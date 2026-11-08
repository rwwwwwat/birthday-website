using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;
using System.Text;

namespace BirthdayWebsite.Api.Security;

public sealed class AdminCredentials(IOptions<AdminOptions> options, IPasswordHasher<string> hasher)
{
    private readonly AdminOptions settings = options.Value;
    public string Username => settings.Username;
    public bool Configured => !string.IsNullOrWhiteSpace(Username) && Username.Length <= 100
        && !string.IsNullOrWhiteSpace(settings.PasswordHash);
    public string Stamp => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Username + "\0" + settings.PasswordHash)));
    public bool Verify(string username, string password)
    {
        if (!Configured) return false;
        try
        {
            // Always perform the password KDF, including when the username is incorrect.
            var result = hasher.VerifyHashedPassword(Username, settings.PasswordHash, password);
            return string.Equals(username, Username, StringComparison.Ordinal)
                && result is PasswordVerificationResult.Success or PasswordVerificationResult.SuccessRehashNeeded;
        }
        catch (FormatException) { return false; }
        catch (ArgumentException) { return false; }
    }
}
