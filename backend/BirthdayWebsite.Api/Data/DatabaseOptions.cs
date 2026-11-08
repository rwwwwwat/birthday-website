namespace BirthdayWebsite.Api.Data;

public sealed class DatabaseOptions
{
    public const string ConnectionStringName = "BirthdayDatabase";
    public bool Enabled { get; set; }
    public int ConnectTimeoutSeconds { get; set; } = 5;
    public int CommandTimeoutSeconds { get; set; } = 5;
    public int OperationTimeoutSeconds { get; set; } = 10;
}
