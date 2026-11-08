using BirthdayWebsite.Api.Security;

namespace BirthdayWebsite.Api.Media;

public sealed class SiteMediaAuthorizer : IMediaAuthorizer
{
    public ValueTask<bool> IsAuthorizedAsync(HttpContext context, CancellationToken cancellationToken) =>
        ValueTask.FromResult(context.Features.Get<SiteAccessIdentity>() is not null);
}
