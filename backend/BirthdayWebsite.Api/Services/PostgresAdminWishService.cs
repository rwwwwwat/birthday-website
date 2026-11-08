using System.Data;
using System.Data.Common;
using BirthdayWebsite.Api.Data;
using BirthdayWebsite.Api.Models;

namespace BirthdayWebsite.Api.Services;

public sealed class PostgresAdminWishService(PostgresOperation operations) : IAdminWishService
{
    public Task<AdminWishPage> ListAsync(int page, int pageSize, bool? isRead, CancellationToken cancellationToken)
    {
        if (page < 1 || pageSize is < 1 or > 100) throw new ArgumentOutOfRangeException(nameof(page));
        return operations.RunAsync(async (connection, token) =>
        {
            // Count and rows must use one snapshot, including under concurrent submissions.
            await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.RepeatableRead, token);
            await using var count = operations.Command(connection, transaction, PostgresWishQueries.Count(isRead));
            var total = Convert.ToInt64(await count.ExecuteScalarAsync(token));
            await using var query = operations.Command(connection, transaction, PostgresWishQueries.Page(isRead));
            PostgresOperation.Parameter(query, "size", DbType.Int32, pageSize);
            PostgresOperation.Parameter(query, "offset", DbType.Int64, ((long)page - 1) * pageSize);
            var items = new List<AdminWishSummary>();
            await using (var reader = await query.ExecuteReaderAsync(token))
            {
                while (await reader.ReadAsync(token)) items.Add(new(reader.GetInt64(0), PreciseUtcTimestamp.Join(reader.GetDateTime(1), reader.GetInt16(2)),
                    reader.GetBoolean(3), reader.GetString(4), reader.GetString(5)));
            }
            await transaction.CommitAsync(token);
            return new AdminWishPage(items, total, page, pageSize, total / pageSize + (total % pageSize == 0 ? 0 : 1));
        }, cancellationToken);
    }
    public Task<AdminWishDetail?> DetailAsync(long id, CancellationToken cancellationToken) => ReadAsync(id, false, cancellationToken);
    public Task<AdminWishDetail?> MarkReadAsync(long id, CancellationToken cancellationToken) => ReadAsync(id, true, cancellationToken);
    private Task<AdminWishDetail?> ReadAsync(long id, bool markRead, CancellationToken cancellationToken) => operations.RunAsync<AdminWishDetail?>(async (connection, token) =>
    {
        await using var transaction = await connection.BeginTransactionAsync(token);
        await using var command = operations.Command(connection, transaction, markRead ? PostgresWishQueries.MarkRead : PostgresWishQueries.Detail);
        PostgresOperation.Parameter(command, "id", DbType.Int64, id);
        AdminWishDetail? result = null;
        await using (var reader = await command.ExecuteReaderAsync(token))
        {
            if (await reader.ReadAsync(token)) result = new(reader.GetInt64(0), reader.GetString(1), PreciseUtcTimestamp.Join(reader.GetDateTime(2), reader.GetInt16(3)), reader.GetBoolean(4), reader.GetString(5));
            while (await reader.ReadAsync(token)) { }
            while (await reader.NextResultAsync(token)) { }
        }
        await transaction.CommitAsync(token); return result;
    }, cancellationToken);
    public Task<AdminWishStats> StatsAsync(CancellationToken cancellationToken) => operations.RunAsync(async (connection, token) =>
    {
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.RepeatableRead, token);
        long total, unread, latestId;
        await using (var command = operations.Command(connection, transaction, PostgresWishQueries.Stats))
        await using (var reader = await command.ExecuteReaderAsync(token))
        {
            if (!await reader.ReadAsync(token)) throw new DatabaseUnavailableException();
            total = reader.GetInt64(0); unread = reader.GetInt64(1); latestId = reader.GetInt64(2);
        }
        DateTimeOffset? latest = null;
        await using (var command = operations.Command(connection, transaction, PostgresWishQueries.Latest))
        await using (var reader = await command.ExecuteReaderAsync(token))
            if (await reader.ReadAsync(token)) latest = PreciseUtcTimestamp.Join(reader.GetDateTime(0), reader.GetInt16(1));
        await transaction.CommitAsync(token);
        return new AdminWishStats(total, unread, total - unread, latest, latestId);
    }, cancellationToken);
}
