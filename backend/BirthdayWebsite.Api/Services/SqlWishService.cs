using System.Data;
using BirthdayWebsite.Api.Data;
using BirthdayWebsite.Api.Models;
using Microsoft.Data.SqlClient;

namespace BirthdayWebsite.Api.Services;

public sealed class SqlWishService(SqlConnectionFactory connections, ILogger<SqlWishService> logger) : IWishService
{
    public string UnavailableReason => "数据库服务暂时不可用。";
    private const string WishSource = "王若溪大王生日网站";

    public async Task<WishCreatedResponse> CreateAsync(string content, CancellationToken cancellationToken)
    {
        if (WishContentRules.GetError(content) is not null)
            throw new ArgumentException("愿望内容不符合要求。", nameof(content));
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(connections.OperationTimeoutSeconds));
        try
        {
            await using var connection = connections.CreateConnection();
            await connections.OpenAsync(connection, timeout.Token);
            await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(timeout.Token);
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandTimeout = connections.CommandTimeoutSeconds;
            command.CommandText = """
                INSERT INTO dbo.Wishes (Content, Source)
                OUTPUT INSERTED.WishId, INSERTED.CreatedAt, INSERTED.IsRead, INSERTED.Source
                VALUES (@Content, @Source);
                """;
            command.Parameters.Add("@Content", SqlDbType.NVarChar, WishContentRules.MaxLength).Value = content;
            command.Parameters.Add("@Source", SqlDbType.NVarChar, 100).Value = WishSource;
            WishCreatedResponse result;
            await using (var reader = await command.ExecuteReaderAsync(timeout.Token))
            {
                if (!await reader.ReadAsync(timeout.Token))
                    throw new DatabaseUnavailableException();
                result = new WishCreatedResponse(reader.GetInt64(0),
                    new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(1), DateTimeKind.Utc)),
                    reader.GetBoolean(2), reader.GetString(3));
                // Consume completion/error packets before acknowledging persistence.
                while (await reader.ReadAsync(timeout.Token)) { }
                while (await reader.NextResultAsync(timeout.Token)) { }
            }
            await transaction.CommitAsync(timeout.Token);
            return result; // HTTP 201 is possible only after a successful database commit.
        }
        catch (SqlException exception)
        {
            logger.LogWarning("Wish persistence failed. SqlErrorNumber={SqlErrorNumber}", exception.Number);
            throw new DatabaseUnavailableException();
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("Wish persistence timed out.");
            throw new DatabaseUnavailableException();
        }
        catch (InvalidOperationException)
        {
            logger.LogWarning("Wish persistence failed because the SQL connection was unavailable.");
            throw new DatabaseUnavailableException();
        }
    }
}
