using System.Data;
using System.Data.Common;
using BirthdayWebsite.Api.Data;

namespace BirthdayWebsite.Api.Services;

public sealed class PostgresOperation(IPostgresConnectionFactory connections, ILogger<PostgresOperation> logger)
{
    public async Task<T> RunAsync<T>(Func<DbConnection, CancellationToken, Task<T>> operation, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(connections.OperationTimeoutSeconds));
        try
        {
            await using var connection = await connections.OpenAsync(timeout.Token);
            return await operation(connection, timeout.Token);
        }
        catch (Exception error) when (error is DbException or InvalidOperationException or IOException
            || error is OperationCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("PostgreSQL operation unavailable. Category={Category}", error.GetType().Name);
            throw new DatabaseUnavailableException();
        }
    }
    public DbCommand Command(DbConnection connection, DbTransaction? transaction, string sql)
    {
        var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = sql; command.CommandTimeout = connections.CommandTimeoutSeconds;
        return command;
    }
    public static void Parameter(DbCommand command, string name, DbType type, object value)
    { var parameter = command.CreateParameter(); parameter.ParameterName = name; parameter.DbType = type; parameter.Value = value; command.Parameters.Add(parameter); }
}
