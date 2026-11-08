using BirthdayWebsite.Api.Data;
using Microsoft.Data.SqlClient;

namespace BirthdayWebsite.Api.Services;

public sealed class SqlDatabaseHealthProbe(SqlConnectionFactory connections,
    ILogger<SqlDatabaseHealthProbe> logger) : IDatabaseHealthProbe
{
    public async Task<bool> IsHealthyAsync(CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(connections.OperationTimeoutSeconds));
        try
        {
            await using var connection = connections.CreateConnection();
            await connections.OpenAsync(connection, timeout.Token);
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT 1;";
            command.CommandTimeout = connections.CommandTimeoutSeconds;
            return Convert.ToInt32(await command.ExecuteScalarAsync(timeout.Token)) == 1;
        }
        catch (SqlException exception)
        {
            logger.LogWarning("Database health probe failed. SqlErrorNumber={SqlErrorNumber}", exception.Number);
            return false;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { return false; }
        catch (DatabaseUnavailableException) { return false; }
        catch (InvalidOperationException) { return false; }
    }
}
