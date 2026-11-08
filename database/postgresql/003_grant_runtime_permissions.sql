-- REVIEW BEFORE REAL USE. No account/password, membership change, REVOKE or schema repair is performed.
-- Run the complete file on a fresh privileged connection: psql -X -v ON_ERROR_STOP=1 -f ...
-- Supply birthday_runtime.role through parameterized set_config on that connection.
-- A dedicated role has NO incoming/outgoing membership, independent of INHERIT/SET flags.
-- PUBLIC TEMP/public-schema access/large-object creators may cause refusal. Never silently fix PUBLIC.
-- Checks are a point-in-time audit, not protection against later privileged administrator changes.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '10s';
DO $grant$
DECLARE
    target_role text := nullif(current_setting('birthday_runtime.role', true), '');
    target_oid oid;
    database_oid oid := (SELECT oid FROM pg_database WHERE datname = current_database());
    table_oid oid := to_regclass('birthday_private.wishes');
    sequence_oid oid := to_regclass('birthday_private.wishes_wish_id_seq');
    helper_oid oid := to_regprocedure('birthday_private.utf16_length(text)');
    row_type_oid oid;
    violation text;
    bad record;
BEGIN
    SELECT oid INTO target_oid FROM pg_roles WHERE rolname = target_role;
    IF target_oid IS NULL OR target_role IN ('anon', 'authenticated', 'service_role', 'postgres') THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = format('Runtime role %I rejected: a dedicated existing LOGIN role is required', coalesce(target_role, '<missing>'));
    END IF;
    SELECT concat_ws(', ', CASE WHEN NOT rolcanlogin THEN 'NOLOGIN' END,
        CASE WHEN rolsuper THEN 'SUPERUSER' END, CASE WHEN rolbypassrls THEN 'BYPASSRLS' END,
        CASE WHEN rolcreaterole THEN 'CREATEROLE' END, CASE WHEN rolcreatedb THEN 'CREATEDB' END,
        CASE WHEN rolreplication THEN 'REPLICATION' END)
    INTO violation FROM pg_roles WHERE oid = target_oid;
    IF violation <> '' THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = format('Runtime role %I rejected: unsafe role attributes [%s]', target_role, violation);
    END IF;
    -- No incident edge means no indirect path either. Reject grants made by this role too.
    SELECT format('member %I -> role %I, grantor %I', member.rolname, parent.rolname, grantor.rolname)
    INTO violation FROM pg_auth_members m
        JOIN pg_roles member ON member.oid = m.member JOIN pg_roles parent ON parent.oid = m.roleid
        JOIN pg_roles grantor ON grantor.oid = m.grantor
    WHERE m.member = target_oid OR m.roleid = target_oid OR m.grantor = target_oid LIMIT 1;
    IF violation IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = format('Runtime role %I rejected: membership/INHERIT/SET ROLE risk: %s', target_role, violation);
    END IF;
    -- Ownership is not an ordinary ACL; inspect shared dependencies, including other databases.
    SELECT string_agg(CASE WHEN d.dbid IN (0, database_oid)
        THEN pg_describe_object(d.classid, d.objid, d.objsubid)
        ELSE format('database oid %s, class %s, object oid %s', d.dbid, d.classid::regclass, d.objid) END, '; ')
    INTO violation FROM pg_shdepend d
    WHERE d.refclassid = 'pg_authid'::regclass AND d.refobjid = target_oid AND d.deptype = 'o';
    IF violation IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = format('Runtime role %I rejected: object OWNER risk: %s', target_role, violation);
    END IF;
    -- Do not accept preset LOGIN settings (identity/preload/search_path etc.) without review.
    SELECT format('database oid %s, setting %s', s.setdatabase, split_part(setting, '=', 1))
    INTO violation FROM pg_db_role_setting s CROSS JOIN LATERAL unnest(s.setconfig) setting
    WHERE s.setrole = target_oid LIMIT 1;
    IF violation IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = format('Runtime role %I rejected: unreviewed LOGIN configuration: %s', target_role, violation);
    END IF;
    IF table_oid IS NULL OR sequence_oid IS NULL OR helper_oid IS NULL THEN
        RAISE EXCEPTION 'Reviewed birthday_private table, identity sequence and helper must already exist';
    END IF;
    SELECT reltype INTO row_type_oid FROM pg_class WHERE oid = table_oid AND relkind = 'r';
    IF row_type_oid IS NULL OR NOT EXISTS
        (SELECT 1 FROM pg_depend d JOIN pg_attribute a ON a.attrelid = table_oid AND a.attname = 'wish_id'
         WHERE d.classid = 'pg_class'::regclass AND d.objid = sequence_oid
            AND d.refclassid = 'pg_class'::regclass AND d.refobjid = table_oid
            AND d.refobjsubid = a.attnum AND d.deptype = 'i' AND a.attidentity = 'd')
        OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = helper_oid AND NOT prosecdef
            AND prorettype = 'integer'::regtype AND proisstrict AND provolatile = 'i'
            AND proconfig @> ARRAY['search_path=pg_catalog']) THEN
        RAISE EXCEPTION 'Unreviewed target table/identity/helper definition; no grants performed';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = table_oid AND NOT tgisinternal)
        OR EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class = table_oid) THEN
        RAISE EXCEPTION 'Unreviewed trigger/rule on birthday_private.wishes; no grants performed';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class WHERE oid=table_oid AND (relrowsecurity OR relforcerowsecurity)) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE=format('Runtime role %I rejected: unreviewed RLS on birthday_private.wishes; ACLs alone cannot prove permitted operations',target_role);
    END IF;
    -- NULL ACL is expanded with acldefault: it can contain PUBLIC privileges (database TEMP).
    FOR bad IN
        WITH objects(kind, object_oid, object_name, acl, column_name) AS (
            SELECT 'database', oid, quote_ident(datname), coalesce(datacl, acldefault('d', datdba)), '' FROM pg_database WHERE datallowconn
            UNION ALL SELECT 'schema', oid, quote_ident(nspname), coalesce(nspacl, acldefault('n', nspowner)), '' FROM pg_namespace
            UNION ALL SELECT CASE WHEN c.relkind = 'S' THEN 'sequence' ELSE 'table' END,
                c.oid, format('%I.%I', n.nspname, c.relname), coalesce(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner)), ''
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p','v','m','f','S')
            UNION ALL SELECT 'column', c.oid, format('%I.%I.%I', n.nspname, c.relname, a.attname), a.attacl, a.attname
                FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
            UNION ALL SELECT 'routine', p.oid, p.oid::regprocedure::text, coalesce(p.proacl, acldefault('f', p.proowner)), '' FROM pg_proc p
            UNION ALL SELECT 'tablespace', oid, quote_ident(spcname), coalesce(spcacl, acldefault('t', spcowner)), '' FROM pg_tablespace
            UNION ALL SELECT 'foreign server', oid, quote_ident(srvname), coalesce(srvacl, acldefault('S', srvowner)), '' FROM pg_foreign_server
            UNION ALL SELECT 'foreign wrapper', oid, quote_ident(fdwname), coalesce(fdwacl, acldefault('F', fdwowner)), '' FROM pg_foreign_data_wrapper
            UNION ALL SELECT 'parameter', oid, quote_ident(parname), paracl, '' FROM pg_parameter_acl
            UNION ALL SELECT 'large object', oid, oid::text, coalesce(lomacl, acldefault('L', lomowner)), '' FROM pg_largeobject_metadata
            UNION ALL SELECT 'type', t.oid, format('%I.%I', n.nspname, t.typname), coalesce(t.typacl, acldefault('T', t.typowner)), ''
                FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            UNION ALL SELECT 'default privilege', d.oid, format('owner %I schema oid %s type %s', r.rolname, d.defaclnamespace, d.defaclobjtype), d.defaclacl, ''
                FROM pg_default_acl d JOIN pg_roles r ON r.oid = d.defaclrole
        ), entries AS (
            SELECT o.*, a.grantee, a.privilege_type, a.is_grantable
            FROM objects o CROSS JOIN LATERAL aclexplode(o.acl) a WHERE a.grantee IN (0, target_oid)
        )
        SELECT e.* FROM entries e WHERE
            -- Trusted standard system SQL/metadata defaults are not application grants.
            -- Direct target ACLs, SECURITY DEFINER and object/file creators are NEVER exempted.
            NOT (e.grantee = 0 AND NOT e.is_grantable AND (
                (e.kind IN ('table','sequence','column') AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE c.oid=e.object_oid AND n.nspname IN ('pg_catalog','information_schema')
                    AND (e.privilege_type='SELECT' OR (n.nspname='pg_catalog' AND c.relname='pg_settings' AND e.kind='table' AND e.privilege_type='UPDATE'))
                    AND c.relname<>'pg_authid' AND NOT (c.relname='pg_subscription' AND e.column_name='subconninfo')))
                OR (e.kind='routine' AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE p.oid=e.object_oid AND n.nspname IN ('pg_catalog','information_schema') AND NOT p.prosecdef
                    AND p.proname NOT IN ('lo_create','lo_creat','lo_from_bytea','lo_import','lo_export','pg_read_file','pg_read_binary_file','pg_ls_dir','pg_write_file')))
                OR (e.kind='type' AND EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                    WHERE t.oid=e.object_oid AND n.nspname IN ('pg_catalog','information_schema')))
            ))
            AND (e.is_grantable OR NOT (
                (e.kind='database' AND e.object_oid=database_oid AND e.privilege_type='CONNECT')
                OR (e.kind='schema' AND e.privilege_type='USAGE' AND (e.object_name IN ('pg_catalog','information_schema') OR (e.grantee=target_oid AND e.object_name='birthday_private')))
                OR (e.grantee=target_oid AND e.kind='table' AND e.object_oid=table_oid AND e.privilege_type IN ('SELECT','INSERT'))
                OR (e.grantee=target_oid AND e.kind='column' AND e.object_oid=table_oid AND (e.privilege_type IN ('SELECT','INSERT') OR (e.privilege_type='UPDATE' AND e.column_name='is_read')))
                OR (e.grantee=target_oid AND e.kind='sequence' AND e.object_oid=sequence_oid AND e.privilege_type='USAGE')
                OR (e.grantee=target_oid AND e.kind='routine' AND e.object_oid=helper_oid AND e.privilege_type='EXECUTE')
                OR (e.kind='type' AND e.privilege_type='USAGE' AND EXISTS (SELECT 1 FROM pg_type t WHERE t.oid=e.object_oid AND (t.oid=row_type_oid OR t.typelem=row_type_oid)))
            ))
        ORDER BY e.kind, e.object_name, e.privilege_type
    LOOP
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = format('Runtime role %I rejected: %s grants unexpected %s%s on %s %s',
            target_role, CASE WHEN bad.grantee=0 THEN 'PUBLIC' ELSE quote_ident(target_role) END,
            bad.privilege_type, CASE WHEN bad.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END, bad.kind, bad.object_name);
    END LOOP;
    -- Only now add missing allowlisted privileges. There is deliberately no REVOKE.
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), target_role);
    EXECUTE format('GRANT USAGE ON SCHEMA birthday_private TO %I', target_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION birthday_private.utf16_length(text) TO %I', target_role);
    EXECUTE format('GRANT SELECT, INSERT ON birthday_private.wishes TO %I', target_role);
    EXECUTE format('GRANT UPDATE (is_read) ON birthday_private.wishes TO %I', target_role);
    EXECUTE format('GRANT USAGE ON SEQUENCE birthday_private.wishes_wish_id_seq TO %I', target_role);
    -- Effective postconditions include PUBLIC/inherited privileges, not just the grants above.
    IF NOT has_database_privilege(target_oid, database_oid, 'CONNECT')
        OR NOT has_schema_privilege(target_oid, 'birthday_private', 'USAGE')
        OR NOT has_table_privilege(target_oid, table_oid, 'SELECT') OR NOT has_table_privilege(target_oid, table_oid, 'INSERT')
        OR NOT has_column_privilege(target_oid, table_oid, 'is_read', 'UPDATE')
        OR NOT has_function_privilege(target_oid, helper_oid, 'EXECUTE') OR NOT has_sequence_privilege(target_oid, sequence_oid, 'USAGE')
        OR has_table_privilege(target_oid, table_oid, 'DELETE') OR has_table_privilege(target_oid, table_oid, 'TRUNCATE')
        OR has_table_privilege(target_oid, table_oid, 'UPDATE')
        OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=table_oid AND a.attnum>0 AND NOT a.attisdropped AND a.attname<>'is_read'
            AND has_column_privilege(target_oid, table_oid, a.attnum, 'UPDATE'))
        OR EXISTS (SELECT 1 FROM pg_namespace n WHERE has_schema_privilege(target_oid, n.oid, 'CREATE'))
        OR has_database_privilege(target_oid, database_oid, 'CREATE') OR has_database_privilege(target_oid, database_oid, 'TEMPORARY')
        OR has_sequence_privilege(target_oid, sequence_oid, 'UPDATE') OR has_sequence_privilege(target_oid, sequence_oid, 'SELECT') THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE=format('Runtime role %I failed effective permission postconditions; grants rolled back', target_role);
    END IF;
    RAISE NOTICE 'Runtime role %: SELECT/INSERT/UPDATE(is_read) allowed; DELETE/TRUNCATE/other UPDATE/CREATE/ALTER-owner paths denied at audit time', target_role;
END $grant$;
COMMIT;
-- Standard trusted system SQL/metadata remains available; this is not a SQL firewall.
-- Platform administrators can change roles/ACLs later: re-audit after such changes.
-- Keep birthday_private OUT of Supabase exposed schemas and never publish the runtime credential.
