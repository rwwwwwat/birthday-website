using System.Data.Common;
using Microsoft.Extensions.Options;
using Npgsql;
using BirthdayWebsite.Api.Services;

namespace BirthdayWebsite.Api.Data;

public interface IPostgresConnectionFactory
{
    int CommandTimeoutSeconds { get; }
    int OperationTimeoutSeconds { get; }
    Task<DbConnection> OpenAsync(CancellationToken cancellationToken);
}

// One data source/pool per process. Construction validates settings but never opens a connection.
public sealed class PostgresConnectionFactory : IPostgresConnectionFactory, IAsyncDisposable
{
    static PostgresConnectionFactory()
    {
        // The schema accepts only finite .NET-range times. Do not map DateTime.MinValue to -infinity.
        AppContext.SetSwitch("Npgsql.DisableDateTimeInfinityConversions", true);
    }
    private readonly NpgsqlDataSource? dataSource;
    public int CommandTimeoutSeconds { get; }
    public int OperationTimeoutSeconds { get; }
    public PostgresConnectionFactory(IConfiguration configuration, IOptions<DatabaseOptions> options)
    {
        CommandTimeoutSeconds = options.Value.CommandTimeoutSeconds;
        OperationTimeoutSeconds = options.Value.OperationTimeoutSeconds;
        if (!options.Value.Enabled) return;
        var settings = Validate(configuration.GetConnectionString("PostgreSqlBirthdayDatabase"), options.Value);
        dataSource = new NpgsqlDataSourceBuilder(settings.ConnectionString).Build();
    }
    public static NpgsqlConnectionStringBuilder Validate(string? connectionString, DatabaseOptions options)
    {
        try
        {
            if (options.ConnectTimeoutSeconds is < 1 or > 30 || options.CommandTimeoutSeconds is < 1 or > 30
                || options.OperationTimeoutSeconds < Math.Max(options.ConnectTimeoutSeconds, options.CommandTimeoutSeconds)
                || options.OperationTimeoutSeconds > 60) throw new ArgumentException();
            var builder = new NpgsqlConnectionStringBuilder(connectionString ?? "");
            if (string.IsNullOrWhiteSpace(builder.Host) || builder.Host.Contains(',') || builder.Host.StartsWith('/')
                || string.IsNullOrWhiteSpace(builder.Database) || string.IsNullOrWhiteSpace(builder.Username)
                || string.IsNullOrWhiteSpace(builder.Password) || builder.SslMode != SslMode.VerifyFull
                || !string.IsNullOrEmpty(builder.Options)) throw new ArgumentException();
            // Session pooler is recommended. Never prepare/pipeline queries automatically.
            builder.Pooling = true; builder.MinPoolSize = 0; builder.MaxPoolSize = 5;
            builder.Timeout = options.ConnectTimeoutSeconds; builder.CommandTimeout = options.CommandTimeoutSeconds;
            builder.MaxAutoPrepare = 0; builder.Multiplexing = false;
            builder.IncludeErrorDetail = false; builder.LogParameters = false;
            builder.PersistSecurityInfo = false;
            return builder;
        }
        catch (ArgumentException) { throw new InvalidOperationException("PostgreSQL 配置缺失或无效，必须提供完整连接设置并验证 TLS 证书。"); }
    }
    public async Task<DbConnection> OpenAsync(CancellationToken cancellationToken) =>
        dataSource is null ? throw new DatabaseUnavailableException() : await dataSource.OpenConnectionAsync(cancellationToken);
    public ValueTask DisposeAsync() => dataSource?.DisposeAsync() ?? ValueTask.CompletedTask;
}
