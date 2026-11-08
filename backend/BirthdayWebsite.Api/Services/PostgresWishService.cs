using System.Data;
using BirthdayWebsite.Api.Data;
using BirthdayWebsite.Api.Models;

namespace BirthdayWebsite.Api.Services;

public sealed class PostgresWishService(PostgresOperation operations) : IWishService
{
    public string UnavailableReason => "数据库服务暂时不可用。";
    public Task<WishCreatedResponse> CreateAsync(string content, CancellationToken cancellationToken)
    {
        if (WishContentRules.GetError(content) is not null) throw new ArgumentException("愿望内容不符合要求。", nameof(content));
        return operations.RunAsync(async (connection, token) =>
        {
            await using var transaction = await connection.BeginTransactionAsync(token);
            await using var command = operations.Command(connection, transaction, PostgresWishQueries.Insert);
            PostgresOperation.Parameter(command, "content", DbType.String, content);
            PostgresOperation.Parameter(command, "source", DbType.String, PostgresWishQueries.Source);
            WishCreatedResponse result;
            await using (var reader = await command.ExecuteReaderAsync(token))
            {
                if (!await reader.ReadAsync(token)) throw new DatabaseUnavailableException();
                result = new(reader.GetInt64(0), PreciseUtcTimestamp.Join(reader.GetDateTime(1), reader.GetInt16(2)), reader.GetBoolean(3), reader.GetString(4));
                while (await reader.ReadAsync(token)) { }
                while (await reader.NextResultAsync(token)) { }
            }
            await transaction.CommitAsync(token);
            return result; // A RETURNING row alone is not proof of a successful commit.
        }, cancellationToken);
    }
}
