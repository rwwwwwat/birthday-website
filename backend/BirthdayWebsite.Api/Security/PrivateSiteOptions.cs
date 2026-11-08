namespace BirthdayWebsite.Api.Security;

/// <summary>
/// Selects how the whole site boundary is verified.
/// CloudflareAccess keeps the original production behaviour.
/// Public is for deployments (for example Render) that intentionally expose a public birthday site.
/// </summary>
public sealed class PrivateSiteOptions
{
    public string Mode { get; set; } = "CloudflareAccess";

    public bool IsPublic => string.Equals(Mode?.Trim(), "Public", StringComparison.OrdinalIgnoreCase);
}

public sealed class PublicSiteAccessVerifier : ISiteAccessVerifier
{
    private static readonly SiteAccessResult Allowed =
        new(200, new SiteAccessIdentity("public"));

    public Task<SiteAccessResult> VerifyAsync(HttpContext context, CancellationToken cancellationToken) =>
        Task.FromResult(Allowed);
}
