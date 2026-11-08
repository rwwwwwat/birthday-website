namespace BirthdayWebsite.Api.Services;

// Never attach raw SQL exceptions: they can contain sensitive server or input details.
public sealed class DatabaseUnavailableException : Exception
{
    public DatabaseUnavailableException() : base("数据库服务暂时不可用。") { }
}
