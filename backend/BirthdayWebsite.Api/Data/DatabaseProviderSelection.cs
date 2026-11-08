namespace BirthdayWebsite.Api.Data;

public enum DatabaseProvider { SqlServer, PostgreSql }

public sealed class DatabaseProviderSelection
{
    public DatabaseProvider Provider { get; }
    public DatabaseProviderSelection(IConfiguration configuration, IHostEnvironment environment)
    {
        var configured = configuration["DatabaseProvider"];
        Provider = string.IsNullOrWhiteSpace(configured)
            ? environment.IsDevelopment() ? DatabaseProvider.SqlServer : DatabaseProvider.PostgreSql
            : configured.Trim().ToLowerInvariant() switch
            {
                "sqlserver" => DatabaseProvider.SqlServer,
                "postgresql" => DatabaseProvider.PostgreSql,
                _ => throw new InvalidOperationException("数据库 Provider 无效。"),
            };
        if (!environment.IsDevelopment() && Provider != DatabaseProvider.PostgreSql)
            throw new InvalidOperationException("非 Development 环境必须明确使用 PostgreSQL，不允许回退 SQL Server。");
    }
}
