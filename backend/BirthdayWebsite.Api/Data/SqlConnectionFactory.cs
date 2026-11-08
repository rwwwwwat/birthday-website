using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace BirthdayWebsite.Api.Data;

public sealed class SqlConnectionFactory
{
    private readonly string? connectionString;
    private readonly DatabaseOptions options;

    public SqlConnectionFactory(IConfiguration configuration, IOptions<DatabaseOptions> options,
        IHostEnvironment environment)
    {
        this.options = options.Value;
        if (!this.options.Enabled) return;
        SqlConnectionStringBuilder builder;
        try
        {
            builder = new SqlConnectionStringBuilder(
                configuration.GetConnectionString(DatabaseOptions.ConnectionStringName)
                ?? throw new ArgumentException());
        }
        catch (ArgumentException)
        {
            throw new InvalidOperationException("数据库连接配置缺失或格式无效。");
        }
        if (!builder.IntegratedSecurity || !string.IsNullOrEmpty(builder.UserID)
            || !string.IsNullOrEmpty(builder.Password) || string.IsNullOrWhiteSpace(builder.DataSource)
            || string.IsNullOrWhiteSpace(builder.InitialCatalog))
            throw new InvalidOperationException("数据库必须使用具有目标服务器和数据库的 Windows 身份验证配置。");
        if (builder.TrustServerCertificate && !environment.IsDevelopment())
            throw new InvalidOperationException("TrustServerCertificate 仅允许用于 Development 环境。");
        builder.Encrypt = SqlConnectionEncryptOption.Mandatory;
        builder.Pooling = true;
        builder.MinPoolSize = 0;
        builder.MaxPoolSize = 50;
        builder.ConnectTimeout = this.options.ConnectTimeoutSeconds;
        builder.ConnectRetryCount = 0; // Never automatically retry a write operation.
        builder.PersistSecurityInfo = false;
        connectionString = builder.ConnectionString;
    }

    public SqlConnection CreateConnection()
    {
        if (connectionString is null) throw new Services.DatabaseUnavailableException();
        return new SqlConnection(connectionString);
    }

    public int CommandTimeoutSeconds => options.CommandTimeoutSeconds;
    public int OperationTimeoutSeconds => options.OperationTimeoutSeconds;

    public async Task OpenAsync(SqlConnection connection, CancellationToken cancellationToken)
    {
        await connection.OpenAsync(cancellationToken);
        // Every pooled lease must satisfy the filtered-index session requirements.
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SET ANSI_NULLS ON;
            SET QUOTED_IDENTIFIER ON;
            SET ANSI_PADDING ON;
            SET ANSI_WARNINGS ON;
            SET ARITHABORT ON;
            SET CONCAT_NULL_YIELDS_NULL ON;
            SET NUMERIC_ROUNDABORT OFF;
            SET XACT_ABORT ON;
            SET NOCOUNT ON;
            """;
        command.CommandTimeout = CommandTimeoutSeconds;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
