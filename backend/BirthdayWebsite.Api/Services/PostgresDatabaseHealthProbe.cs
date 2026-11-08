using BirthdayWebsite.Api.Data;

namespace BirthdayWebsite.Api.Services;

public sealed class PostgresDatabaseHealthProbe(PostgresOperation operations) : IDatabaseHealthProbe
{
    public async Task<bool> IsHealthyAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await operations.RunAsync(async (connection, token) =>
            {
                await using var command = operations.Command(connection, null, "SELECT 1");
                return Convert.ToInt32(await command.ExecuteScalarAsync(token)) == 1;
            }, cancellationToken);
        }
        catch (DatabaseUnavailableException) { return false; }
    }
}
