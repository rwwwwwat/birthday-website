using System.Net.Mail;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace BirthdayWebsite.Api.Security;

public sealed class CloudflareAccessOptions
{
    public string TeamDomain { get; set; } = "";
    public string Audience { get; set; } = "";
    public string[] AllowedEmails { get; set; } = [];
    public bool AllowDevelopmentLoopback { get; set; }
}
public sealed class CloudflareAccessSettings
{
    public string Issuer { get; } = "";
    public string Audience { get; }
    public Uri? JwksAddress { get; }
    public IReadOnlySet<string> AllowedEmails { get; }
    public bool Valid { get; }
    public CloudflareAccessSettings(IOptions<CloudflareAccessOptions> options)
    {
        var value = options.Value; Audience = value.Audience?.Trim() ?? "";
        var emails = (value.AllowedEmails ?? []).Select(NormalizeEmail).ToArray();
        AllowedEmails = emails.Where(email => email is not null).Select(email => email!).ToHashSet(StringComparer.Ordinal);
        var domain = value.TeamDomain?.Trim() ?? "";
        if (!domain.Contains("://", StringComparison.Ordinal)) domain = "https://" + domain;
        if (!Uri.TryCreate(domain, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.Port != 443
            || uri.UserInfo.Length != 0 || uri.AbsolutePath != "/" || uri.Query.Length != 0 || uri.Fragment.Length != 0
            || !Regex.IsMatch(uri.DnsSafeHost, @"\A[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com\z", RegexOptions.IgnoreCase)) return;
        Issuer = uri.GetLeftPart(UriPartial.Authority).ToLowerInvariant();
        JwksAddress = new Uri(Issuer + "/cdn-cgi/access/certs");
        Valid = emails.Length == 2 && emails.All(email => email is not null) && AllowedEmails.Count == 2
            && Audience.Length is > 0 and <= 256 && !Audience.Any(char.IsWhiteSpace);
    }
    public static string? NormalizeEmail(string? email)
    {
        var normalized = email?.Trim().ToLowerInvariant();
        return !string.IsNullOrEmpty(normalized) && !normalized.Contains('*')
            && MailAddress.TryCreate(normalized, out var address) && address.Address == normalized
            && address.DisplayName.Length == 0 ? normalized : null;
    }
}
