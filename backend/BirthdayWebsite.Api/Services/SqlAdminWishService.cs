using System.Data;
using BirthdayWebsite.Api.Data;
using BirthdayWebsite.Api.Models;
using Microsoft.Data.SqlClient;

namespace BirthdayWebsite.Api.Services;

public sealed class SqlAdminWishService(SqlConnectionFactory connections, ILogger<SqlAdminWishService> logger) : IAdminWishService
{
    private async Task<T> Run<T>(Func<SqlConnection, CancellationToken, Task<T>> action, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(connections.OperationTimeoutSeconds));
        try
        {
            await using var connection = connections.CreateConnection();
            await connections.OpenAsync(connection, timeout.Token);
            return await action(connection, timeout.Token);
        }
        catch (SqlException exception)
        { logger.LogWarning("Admin database operation unavailable. SqlErrorNumber={Number}", exception.Number); throw new DatabaseUnavailableException(); }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        { logger.LogWarning("Admin database operation timed out."); throw new DatabaseUnavailableException(); }
        catch (InvalidOperationException)
        { logger.LogWarning("Admin database connection unavailable."); throw new DatabaseUnavailableException(); }
    }
    private SqlCommand Command(SqlConnection connection, string text)
    {
        var command = connection.CreateCommand(); command.CommandText = text;
        command.CommandTimeout = connections.CommandTimeoutSeconds; return command;
    }
    public Task<AdminWishPage> ListAsync(int page, int pageSize, bool? isRead, CancellationToken cancellationToken)
    {
        if (page < 1 || pageSize is < 1 or > 100) throw new ArgumentOutOfRangeException(nameof(page));
        return Run(async (connection, token) =>
        {
            // Static predicates allow the existing filtered unread index to remain eligible.
            var predicate = isRead switch { false => "WHERE IsRead = 0", true => "WHERE IsRead = 1", _ => "" };
            await using var command = Command(connection, $"""
                SELECT COUNT_BIG(*) FROM dbo.Wishes {predicate};
                SELECT WishId, CreatedAt, IsRead, Source, LEFT(Content, 100)
                FROM dbo.Wishes {predicate}
                ORDER BY CreatedAt DESC, WishId DESC OFFSET @Offset ROWS FETCH NEXT @Size ROWS ONLY;
                """);
            command.Parameters.Add("@Offset", SqlDbType.BigInt).Value = ((long)page - 1) * pageSize;
            command.Parameters.Add("@Size", SqlDbType.Int).Value = pageSize;
            await using var reader = await command.ExecuteReaderAsync(token);
            await reader.ReadAsync(token); var total = reader.GetInt64(0);
            await reader.NextResultAsync(token); var items = new List<AdminWishSummary>();
            while (await reader.ReadAsync(token)) items.Add(new(reader.GetInt64(0), Utc(reader.GetDateTime(1)),
                reader.GetBoolean(2), reader.GetString(3), reader.GetString(4)));
            return new AdminWishPage(items, total, page, pageSize, (total + pageSize - 1) / pageSize);
        }, cancellationToken);
    }
    public Task<AdminWishDetail?> DetailAsync(long id, CancellationToken cancellationToken) => ReadOrMark(id, false, cancellationToken);
    public Task<AdminWishDetail?> MarkReadAsync(long id, CancellationToken cancellationToken) => ReadOrMark(id, true, cancellationToken);
    private Task<AdminWishDetail?> ReadOrMark(long id, bool mark, CancellationToken cancellationToken) => Run<AdminWishDetail?>(async (connection, token) =>
    {
        await using var command = Command(connection, mark ? """
            UPDATE dbo.Wishes SET IsRead = 1
            OUTPUT INSERTED.WishId, INSERTED.Content, INSERTED.CreatedAt, INSERTED.IsRead, INSERTED.Source
            WHERE WishId = @Id;
            """ : "SELECT WishId, Content, CreatedAt, IsRead, Source FROM dbo.Wishes WHERE WishId = @Id;");
        command.Parameters.Add("@Id", SqlDbType.BigInt).Value = id;
        await using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token)) return null;
        var result = new AdminWishDetail(reader.GetInt64(0), reader.GetString(1), Utc(reader.GetDateTime(2)), reader.GetBoolean(3), reader.GetString(4));
        while (await reader.ReadAsync(token)) { }
        while (await reader.NextResultAsync(token)) { }
        return result;
    }, cancellationToken);
    public Task<AdminWishStats> StatsAsync(CancellationToken cancellationToken) => Run(async (connection, token) =>
    {
        await using var command = Command(connection, """
            SELECT COUNT_BIG(*), (SELECT COUNT_BIG(*) FROM dbo.Wishes WHERE IsRead = 0),
                MAX(CreatedAt), COALESCE(MAX(WishId), CONVERT(bigint, 0)) FROM dbo.Wishes;
            """);
        await using var reader = await command.ExecuteReaderAsync(token); await reader.ReadAsync(token);
        var total = reader.GetInt64(0); var unread = reader.GetInt64(1);
        return new AdminWishStats(total, unread, total - unread, reader.IsDBNull(2) ? null : Utc(reader.GetDateTime(2)), reader.GetInt64(3));
    }, cancellationToken);
    private static DateTimeOffset Utc(DateTime time) => new(DateTime.SpecifyKind(time, DateTimeKind.Utc));
}
