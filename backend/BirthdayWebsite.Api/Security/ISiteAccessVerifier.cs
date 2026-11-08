namespace BirthdayWebsite.Api.Security;

public sealed record SiteAccessIdentity(string Email, bool Development = false);
public sealed record SiteAccessResult(int StatusCode, SiteAccessIdentity? Identity = null)
{
    public bool Allowed => StatusCode == 200 && Identity is not null;
}
public interface ISiteAccessVerifier
{
    Task<SiteAccessResult> VerifyAsync(HttpContext context, CancellationToken cancellationToken);
}
