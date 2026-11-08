namespace BirthdayWebsite.Api.Security;

public sealed class AdminOptions
{
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
}
