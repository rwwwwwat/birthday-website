using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using BirthdayWebsite.Api.Data;
using Npgsql;

namespace BirthdayWebsite.Api.Tests;

// ADO.NET boundary double: no socket, provider emulation or actual database exists in these tests.
public sealed class ScriptedPostgres : IPostgresConnectionFactory
{
    public Queue<Func<ScriptedPgCommand, object?>> Steps { get; } = new();
    public List<ScriptedPgCommand> Commands { get; } = [];
    public List<DataTableReader> Readers { get; } = [];
    public int Opens, Commits, Rollbacks, ConnectionsDisposed;
    public bool FailCommit, FailOpen;
    public IsolationLevel Isolation;
    public int CommandTimeoutSeconds => 5;
    public int OperationTimeoutSeconds => 10;
    public Task<DbConnection> OpenAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested(); Opens++;
        if (FailOpen) throw new NpgsqlException("isolated connection failure");
        return Task.FromResult<DbConnection>(new ScriptedPgConnection(this));
    }
    public object? Run(ScriptedPgCommand command)
    {
        Commands.Add(command); Assert.Equal(5, command.CommandTimeout); Assert.NotEmpty(Steps);
        var value = Steps.Dequeue()(command);
        if (value is DataTableReader reader) Readers.Add(reader);
        return value;
    }
    public static DataTableReader Rows(Type[] types, params object[][] rows)
    {
        var table = new DataTable();
        for (var i = 0; i < types.Length; i++)
        {
            var column = table.Columns.Add("c" + i, types[i]);
            if (types[i] == typeof(DateTime)) column.DateTimeMode = DataSetDateTime.Utc;
        }
        foreach (var row in rows) table.Rows.Add(row);
        return table.CreateDataReader();
    }
}
public sealed class ScriptedPgConnection(ScriptedPostgres owner) : DbConnection
{
    [AllowNull] public override string ConnectionString { get; set; } = "";
    public override string Database => "isolated";
    public override string DataSource => "no-network";
    public override string ServerVersion => "not-a-server";
    public override ConnectionState State => ConnectionState.Open;
    public override void Open() => throw new NotSupportedException();
    public override void Close() { }
    public override void ChangeDatabase(string databaseName) => throw new NotSupportedException();
    protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel) => throw new NotSupportedException("Synchronous DB operations forbidden in test.");
    protected override ValueTask<DbTransaction> BeginDbTransactionAsync(IsolationLevel isolationLevel, CancellationToken cancellationToken)
    { cancellationToken.ThrowIfCancellationRequested(); owner.Isolation = isolationLevel; return ValueTask.FromResult<DbTransaction>(new ScriptedPgTransaction(this, owner, isolationLevel)); }
    protected override DbCommand CreateDbCommand() => new ScriptedPgCommand(this, owner);
    protected override void Dispose(bool disposing) { if (disposing) owner.ConnectionsDisposed++; base.Dispose(disposing); }
}
public sealed class ScriptedPgTransaction(DbConnection connection, ScriptedPostgres owner, IsolationLevel isolationLevel) : DbTransaction
{
    private bool completed;
    public override IsolationLevel IsolationLevel => isolationLevel;
    protected override DbConnection DbConnection => connection;
    public override void Commit() => throw new NotSupportedException();
    public override void Rollback() => throw new NotSupportedException();
    public override Task CommitAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested(); Assert.All(owner.Readers, reader => Assert.True(reader.IsClosed));
        if (owner.FailCommit) throw new NpgsqlException("isolated commit uncertainty");
        completed = true; owner.Commits++; return Task.CompletedTask;
    }
    protected override void Dispose(bool disposing)
    { if (disposing && !completed) { completed = true; owner.Rollbacks++; } base.Dispose(disposing); }
}
public sealed class ScriptedPgCommand(DbConnection connection, ScriptedPostgres owner) : DbCommand
{
    private readonly NpgsqlCommand parameters = new();
    [AllowNull] public override string CommandText { get; set; } = "";
    public override int CommandTimeout { get; set; }
    public override CommandType CommandType { get; set; } = CommandType.Text;
    public override bool DesignTimeVisible { get; set; }
    public override UpdateRowSource UpdatedRowSource { get; set; }
    protected override DbConnection? DbConnection { get; set; } = connection;
    protected override DbTransaction? DbTransaction { get; set; }
    public DbTransaction? AssignedTransaction => DbTransaction;
    protected override DbParameterCollection DbParameterCollection => parameters.Parameters;
    protected override DbParameter CreateDbParameter() => new NpgsqlParameter();
    public override void Cancel() { }
    public override void Prepare() => throw new NotSupportedException();
    public override int ExecuteNonQuery() => throw new NotSupportedException();
    public override object ExecuteScalar() => throw new NotSupportedException();
    protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior) => throw new NotSupportedException();
    public override Task<object?> ExecuteScalarAsync(CancellationToken cancellationToken)
    { cancellationToken.ThrowIfCancellationRequested(); return Task.FromResult(owner.Run(this)); }
    protected override Task<DbDataReader> ExecuteDbDataReaderAsync(CommandBehavior behavior, CancellationToken cancellationToken)
    { cancellationToken.ThrowIfCancellationRequested(); return Task.FromResult((DbDataReader)owner.Run(this)!); }
}
