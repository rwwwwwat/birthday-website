/*
  REVIEW BEFORE EXECUTION. This file is not run by the application.
  Target: SQL Server Express 17.x; BirthdayWebsiteDB; Windows authentication.
  Run the ENTIRE file, once per deployment connection, in autocommit mode.

  SSMS: connect to (local)\SQLEXPRESS with Windows Authentication.
        Enable Query > SQLCMD Mode for this query window; retain :On Error exit.
        Do not select individual batches or ignore errors.
  sqlcmd (ODBC): use -E -d master -b -V 11 -f 65001 -i <this-file>.
        Supply -S "(local)\SQLEXPRESS"; retain :On Error exit.
        -C is only an optional local-development certificate-trust exception.
        Inspect the process exit code. Do not raise the -V threshold.
  GO and :On Error exit are CLIENT commands, not server-side T-SQL.
  Ordinary SSMS mode and clients that ignore SQLCMD commands are unsupported.

  Existing Wishes tables must match the complete declared schema. Missing or
  mismatched constraints/indexes cause an error, never an automatic repair.
  Formatting-only variations in expressions are accepted; quoted string contents
  remain significant. This conservative comparison is not a SQL equivalence prover.
  No records are inserted or changed, and no existing identity value is reset.
  Database creation is outside the table transaction: a later failure may leave
  the new database empty. Run with full metadata visibility and DDL permissions.
*/
:On Error exit

USE [master];
SET NOCOUNT ON;
IF @@TRANCOUNT <> 0 OR (@@OPTIONS & 2) <> 0
    THROW 51000, N'Use a fresh connection in autocommit mode with no open transaction.', 1;
IF DB_NAME() <> N'master'
    THROW 51001, N'Initial database context is not master; execution stopped.', 1;

BEGIN TRY
    IF DB_ID(N'BirthdayWebsiteDB') IS NULL
        EXEC(N'CREATE DATABASE [BirthdayWebsiteDB];');

    IF NOT EXISTS
       (SELECT 1 FROM sys.databases
        WHERE name = N'BirthdayWebsiteDB' AND state = 0)
        THROW 51002, N'BirthdayWebsiteDB was not created or is not ONLINE.', 1;
END TRY
BEGIN CATCH
    THROW;
END CATCH;
GO

-- Keep USE, the context guard, and ALL table/index operations in ONE batch.
-- SQLCMD must stop after a failed USE; the guard additionally rejects master.
USE [BirthdayWebsiteDB];
SET NOCOUNT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'BirthdayWebsiteDB'
    THROW 51003, N'Wrong database context; no table or index operation is permitted.', 1;
IF @@TRANCOUNT <> 0 OR (@@OPTIONS & 2) <> 0
    THROW 51004, N'An open or implicit transaction is not supported.', 1;
IF COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'VIEW DEFINITION'), 0) <> 1
    THROW 51005, N'VIEW DEFINITION permission is required for reliable schema validation.', 1;

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    -- Serialize schema validation/creation within the target database.
    DECLARE @LockResult INT;
    EXEC @LockResult = sys.sp_getapplock
        @Resource = N'BirthdayWebsiteDB:dbo.Wishes:bootstrap',
        @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 10000;
    IF @LockResult < 0
        THROW 51006, N'Could not acquire the Wishes schema deployment lock.', 1;

    IF EXISTS (SELECT 1 FROM sys.objects
               WHERE schema_id = SCHEMA_ID(N'dbo') AND name = N'Wishes' AND type <> N'U')
        THROW 51007, N'dbo.Wishes exists but is not a user table.', 1;

    IF OBJECT_ID(N'dbo.Wishes', N'U') IS NULL
    BEGIN
        -- Lower execution scope avoids binding DDL to an incompatible old table
        -- before the metadata checks below can report the mismatch.
        EXEC sys.sp_executesql N'CREATE TABLE dbo.Wishes
(
    WishId BIGINT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_Wishes PRIMARY KEY CLUSTERED,
    Content NVARCHAR(2000) NOT NULL,
    CreatedAt DATETIME2(7) NOT NULL
        CONSTRAINT DF_Wishes_CreatedAt DEFAULT (SYSUTCDATETIME()),
    IsRead BIT NOT NULL
        CONSTRAINT DF_Wishes_IsRead DEFAULT (0),
    Source NVARCHAR(100) NOT NULL
        CONSTRAINT DF_Wishes_Source DEFAULT (N''王若溪大王生日网站''),
    CONSTRAINT CK_Wishes_Content_NotBlank CHECK
        (LEN(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(Content,
            NCHAR(9), N''''), NCHAR(10), N''''), NCHAR(13), N'''')))) > 0),
    CONSTRAINT CK_Wishes_Source_NotBlank CHECK
        (LEN(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(Source,
            NCHAR(9), N''''), NCHAR(10), N''''), NCHAR(13), N'''')))) > 0)
);';
        EXEC sys.sp_executesql N'CREATE INDEX IX_Wishes_CreatedAt_WishId
            ON dbo.Wishes (CreatedAt DESC, WishId DESC);';
        EXEC sys.sp_executesql N'CREATE INDEX IX_Wishes_Unread_CreatedAt
            ON dbo.Wishes (CreatedAt DESC, WishId DESC) WHERE IsRead = 0;';
    END;

    DECLARE @TableId INT = OBJECT_ID(N'dbo.Wishes', N'U');
    IF @TableId IS NULL
        THROW 51008, N'dbo.Wishes could not be located after creation.', 1;

    IF EXISTS (SELECT 1 FROM sys.tables WHERE object_id = @TableId
               AND (is_memory_optimized <> 0 OR temporal_type <> 0))
        THROW 51009, N'Wishes must be an ordinary disk-based, non-temporal table.', 1;

    DECLARE @ExpectedColumns TABLE
    (
        ColumnName SYSNAME NOT NULL, TypeName SYSNAME NOT NULL,
        MaxLength SMALLINT NOT NULL, ExpectedScale TINYINT NOT NULL,
        IsIdentity BIT NOT NULL
    );
    -- max_length is BYTES: NVARCHAR(2000)=4000, NVARCHAR(100)=200.
    INSERT INTO @ExpectedColumns VALUES
        (N'WishId', N'bigint', 8, 0, 1),
        (N'Content', N'nvarchar', 4000, 0, 0),
        (N'CreatedAt', N'datetime2', 8, 7, 0),
        (N'IsRead', N'bit', 1, 0, 0),
        (N'Source', N'nvarchar', 200, 0, 0);

    IF (SELECT COUNT(*) FROM sys.columns WHERE object_id = @TableId) <> 5
       OR EXISTS
       (
           SELECT 1 FROM @ExpectedColumns AS e
           LEFT JOIN sys.columns AS c ON c.object_id = @TableId
                AND c.name COLLATE Latin1_General_100_BIN2 = e.ColumnName COLLATE Latin1_General_100_BIN2
           LEFT JOIN sys.types AS t ON t.user_type_id = c.user_type_id
           WHERE c.column_id IS NULL OR t.name <> e.TypeName
              OR c.user_type_id <> c.system_type_id OR c.max_length <> e.MaxLength
              OR c.scale <> e.ExpectedScale OR c.is_nullable <> 0
              OR c.is_identity <> e.IsIdentity OR c.is_computed <> 0
              OR c.is_sparse <> 0 OR c.is_column_set <> 0 OR c.is_hidden <> 0
              OR c.generated_always_type <> 0 OR c.encryption_type IS NOT NULL
       )
        THROW 51010, N'Wishes column names, types, lengths, scale, NULL or column properties do not match.', 1;

    IF NOT EXISTS
       (SELECT 1 FROM sys.identity_columns
        WHERE object_id = @TableId AND name = N'WishId'
          AND CONVERT(BIGINT, seed_value) = 1 AND CONVERT(BIGINT, increment_value) = 1
          AND is_not_for_replication = 0)
        THROW 51011, N'WishId must be IDENTITY(1,1), without NOT FOR REPLICATION.', 1;
    -- last_value is intentionally not compared: existing IDs must be preserved.

    DECLARE @ExpectedDefaults TABLE
        (ConstraintName SYSNAME, ColumnName SYSNAME, ExpectedDefinition NVARCHAR(MAX));
    INSERT INTO @ExpectedDefaults VALUES
        (N'DF_Wishes_CreatedAt', N'CreatedAt', N'SYSUTCDATETIME()'),
        (N'DF_Wishes_IsRead', N'IsRead', N'0'),
        (N'DF_Wishes_Source', N'Source', N'N''王若溪大王生日网站''');

    IF (SELECT COUNT(*) FROM sys.default_constraints WHERE parent_object_id = @TableId) <> 3
       OR EXISTS
       (
           SELECT 1 FROM @ExpectedDefaults AS e
           LEFT JOIN sys.columns AS c ON c.object_id = @TableId AND c.name = e.ColumnName
           LEFT JOIN sys.default_constraints AS d
                ON d.object_id = c.default_object_id AND d.parent_object_id = @TableId
                AND d.parent_column_id = c.column_id
           WHERE d.object_id IS NULL OR d.name COLLATE Latin1_General_100_BIN2
                <> e.ConstraintName COLLATE Latin1_General_100_BIN2 OR d.definition IS NULL
       )
        THROW 51012, N'Expected default constraints are missing, renamed or attached to the wrong columns.', 1;

    DECLARE @ExpectedChecks TABLE
        (ConstraintName SYSNAME, ColumnName SYSNAME, ExpectedDefinition NVARCHAR(MAX));
    INSERT INTO @ExpectedChecks VALUES
        (N'CK_Wishes_Content_NotBlank', N'Content', N'LEN(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(Content, NCHAR(9), N''''), NCHAR(10), N''''), NCHAR(13), N'''')))) > 0'),
        (N'CK_Wishes_Source_NotBlank', N'Source', N'LEN(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(Source, NCHAR(9), N''''), NCHAR(10), N''''), NCHAR(13), N'''')))) > 0');

    IF (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id = @TableId) <> 2
       OR EXISTS
       (
           SELECT 1 FROM @ExpectedChecks AS e
           LEFT JOIN sys.columns AS ec ON ec.object_id = @TableId
                AND ec.name COLLATE Latin1_General_100_BIN2 = e.ColumnName COLLATE Latin1_General_100_BIN2
           LEFT JOIN sys.check_constraints AS c ON c.parent_object_id = @TableId
                AND c.name COLLATE Latin1_General_100_BIN2 = e.ConstraintName COLLATE Latin1_General_100_BIN2
           WHERE ec.column_id IS NULL OR c.object_id IS NULL OR c.definition IS NULL
              OR (c.parent_column_id <> 0 AND c.parent_column_id <> ec.column_id)
              OR c.is_disabled <> 0 OR c.is_not_trusted <> 0 OR c.is_not_for_replication <> 0
       )
        THROW 51013, N'Expected CHECK constraints must exist, match the expected columns, be enabled and trusted.', 1;

    DECLARE @ExpectedIndexes TABLE
        (IndexName SYSNAME, IndexType TINYINT, IsUnique BIT, IsPrimaryKey BIT, HasFilter BIT, KeyCount INT);
    INSERT INTO @ExpectedIndexes VALUES
        (N'PK_Wishes', 1, 1, 1, 0, 1),
        (N'IX_Wishes_CreatedAt_WishId', 2, 0, 0, 0, 2),
        (N'IX_Wishes_Unread_CreatedAt', 2, 0, 0, 1, 2);

    IF (SELECT COUNT(*) FROM sys.key_constraints WHERE parent_object_id = @TableId) <> 1
       OR NOT EXISTS
       (SELECT 1 FROM sys.key_constraints AS k
        JOIN sys.indexes AS i ON i.object_id = k.parent_object_id AND i.index_id = k.unique_index_id
        WHERE k.parent_object_id = @TableId AND k.type = N'PK'
          AND k.name COLLATE Latin1_General_100_BIN2 = N'PK_Wishes'
          AND i.name COLLATE Latin1_General_100_BIN2 = N'PK_Wishes')
        THROW 51014, N'Expected clustered primary key PK_Wishes is missing or mismatched.', 1;

    -- Strict bootstrap: extra indexes or missing expected indexes need manual review.
    IF (SELECT COUNT(*) FROM sys.indexes WHERE object_id = @TableId) <> 3
       OR EXISTS
       (
           SELECT 1 FROM @ExpectedIndexes AS e
           LEFT JOIN sys.indexes AS i ON i.object_id = @TableId
                AND i.name COLLATE Latin1_General_100_BIN2 = e.IndexName COLLATE Latin1_General_100_BIN2
           WHERE i.index_id IS NULL OR i.type <> e.IndexType OR i.is_unique <> e.IsUnique
              OR i.is_primary_key <> e.IsPrimaryKey OR i.has_filter <> e.HasFilter
              OR i.is_disabled <> 0 OR i.is_hypothetical <> 0 OR i.is_unique_constraint <> 0
              OR (e.HasFilter = 0 AND i.filter_definition IS NOT NULL)
              OR (e.HasFilter = 1 AND i.filter_definition IS NULL)
              OR (SELECT COUNT(*) FROM sys.index_columns AS ic
                  WHERE ic.object_id = @TableId AND ic.index_id = i.index_id
                    AND ic.key_ordinal > 0) <> e.KeyCount
              OR EXISTS (SELECT 1 FROM sys.index_columns AS ic
                         WHERE ic.object_id = @TableId AND ic.index_id = i.index_id
                           AND (ic.is_included_column <> 0 OR ic.partition_ordinal <> 0))
       )
        THROW 51015, N'Index names, types, uniqueness, state, filtering or included columns do not match.', 1;

    DECLARE @ExpectedKeys TABLE
        (IndexName SYSNAME, KeyOrdinal INT, ColumnName SYSNAME, IsDescending BIT);
    INSERT INTO @ExpectedKeys VALUES
        (N'PK_Wishes', 1, N'WishId', 0),
        (N'IX_Wishes_CreatedAt_WishId', 1, N'CreatedAt', 1),
        (N'IX_Wishes_CreatedAt_WishId', 2, N'WishId', 1),
        (N'IX_Wishes_Unread_CreatedAt', 1, N'CreatedAt', 1),
        (N'IX_Wishes_Unread_CreatedAt', 2, N'WishId', 1);
    IF EXISTS
       (
           SELECT 1 FROM @ExpectedKeys AS e
           LEFT JOIN sys.indexes AS i ON i.object_id = @TableId AND i.name = e.IndexName
           LEFT JOIN sys.index_columns AS ic
                ON ic.object_id = @TableId AND ic.index_id = i.index_id AND ic.key_ordinal = e.KeyOrdinal
           LEFT JOIN sys.columns AS c ON c.object_id = @TableId AND c.column_id = ic.column_id
           WHERE c.column_id IS NULL OR c.name COLLATE Latin1_General_100_BIN2
                 <> e.ColumnName COLLATE Latin1_General_100_BIN2 OR ic.is_descending_key <> e.IsDescending
       )
        THROW 51016, N'Index key columns, key order or ascending/descending directions do not match.', 1;

    DECLARE @Definitions TABLE
    (
        DefinitionId INT IDENTITY(1,1), ObjectName SYSNAME,
        ExpectedDefinition NVARCHAR(MAX), ActualDefinition NVARCHAR(MAX)
    );
    INSERT INTO @Definitions (ObjectName, ExpectedDefinition, ActualDefinition)
        SELECT e.ConstraintName, e.ExpectedDefinition, d.definition
        FROM @ExpectedDefaults AS e
        JOIN sys.default_constraints AS d ON d.parent_object_id = @TableId AND d.name = e.ConstraintName;
    INSERT INTO @Definitions (ObjectName, ExpectedDefinition, ActualDefinition)
        SELECT e.ConstraintName, e.ExpectedDefinition, c.definition
        FROM @ExpectedChecks AS e
        JOIN sys.check_constraints AS c ON c.parent_object_id = @TableId AND c.name = e.ConstraintName;
    INSERT INTO @Definitions (ObjectName, ExpectedDefinition, ActualDefinition)
        SELECT N'IX_Wishes_Unread_CreatedAt', N'IsRead = 0', filter_definition
        FROM sys.indexes WHERE object_id = @TableId AND name = N'IX_Wishes_Unread_CreatedAt';
    IF (SELECT COUNT(*) FROM @Definitions) <> 6
        THROW 51017, N'Not all expected SQL expressions are visible.', 1;

    -- Compare conservative canonical forms without removing content inside strings.
    -- Ignore only whitespace, brackets and redundant parentheses outside literals.
    DECLARE @DefinitionId INT = 1, @DefinitionCount INT = (SELECT COUNT(*) FROM @Definitions);
    DECLARE @ObjectName SYSNAME, @Expected NVARCHAR(MAX), @Actual NVARCHAR(MAX);
    DECLARE @Side INT, @Text NVARCHAR(MAX), @Canonical NVARCHAR(MAX);
    DECLARE @ExpectedCanonical NVARCHAR(MAX), @ActualCanonical NVARCHAR(MAX);
    DECLARE @Position INT, @InString BIT, @Character NCHAR(1), @Error NVARCHAR(2048);
    WHILE @DefinitionId <= @DefinitionCount
    BEGIN
        SELECT @ObjectName = ObjectName, @Expected = ExpectedDefinition, @Actual = ActualDefinition
        FROM @Definitions WHERE DefinitionId = @DefinitionId;
        SET @Side = 1;
        WHILE @Side <= 2
        BEGIN
            SET @Text = CASE WHEN @Side = 1 THEN @Expected ELSE @Actual END;
            SET @Canonical = N'';
            SET @Position = 1;
            SET @InString = 0;
            WHILE @Position <= LEN(@Text)
            BEGIN
                SET @Character = SUBSTRING(@Text, @Position, 1);
                IF @Character = N''''
                BEGIN
                    SET @Canonical += @Character;
                    IF @InString = 1 AND SUBSTRING(@Text, @Position + 1, 1) = N''''
                    BEGIN
                        SET @Canonical += N'''';
                        SET @Position += 2;
                        CONTINUE;
                    END;
                    SET @InString = CASE WHEN @InString = 1 THEN 0 ELSE 1 END;
                END
                ELSE IF @InString = 1
                    SET @Canonical += @Character;
                ELSE IF @Character NOT IN (N' ', NCHAR(9), NCHAR(10), NCHAR(13), N'(', N')', N'[', N']')
                    SET @Canonical += LOWER(@Character COLLATE Latin1_General_100_CI_AS);
                SET @Position += 1;
            END;
            IF @Side = 1 SET @ExpectedCanonical = @Canonical;
            ELSE SET @ActualCanonical = @Canonical;
            SET @Side += 1;
        END;
        IF @Actual IS NULL OR @ExpectedCanonical COLLATE Latin1_General_100_BIN2
                              <> @ActualCanonical COLLATE Latin1_General_100_BIN2
        BEGIN
            SET @Error = N'SQL expression mismatch for ' + QUOTENAME(@ObjectName)
                       + N'; no automatic repair is permitted.';
            THROW 51018, @Error, 1;
        END;
        SET @DefinitionId += 1;
    END;

    COMMIT TRANSACTION;
    PRINT N'BirthdayWebsiteDB.dbo.Wishes schema verified. No wish records were changed.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
