using BirthdayWebsite.Api.Security;
using Microsoft.AspNetCore.Http;

namespace BirthdayWebsite.Api.Tests;

// Legacy HTTP tests exercise AdminCookie/CORS/validation separately from the Access boundary.
// This type is compiled ONLY into the test assembly; no runtime flag or secret can enable it.
internal sealed class IsolatedSiteAccess : ISiteAccessVerifier
{
    public Task<SiteAccessResult> VerifyAsync(HttpContext context, CancellationToken cancellationToken) =>
        Task.FromResult(new SiteAccessResult(200, new SiteAccessIdentity("isolated-test-identity")));
}
