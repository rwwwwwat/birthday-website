using System.Net;
using Microsoft.Extensions.Options;

namespace BirthdayWebsite.Api.Media;

public sealed class DevelopmentMediaAuthorizer(IHostEnvironment environment, IOptions<MediaOptions> options) : IMediaAuthorizer
{
    private static bool Loopback(IPAddress? address) => address is not null
        && IPAddress.IsLoopback(address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address);
    private static bool LocalHost(string host) => host is "localhost" or "127.0.0.1" or "[::1]" or "::1";
    public ValueTask<bool> IsAuthorizedAsync(HttpContext context, CancellationToken cancellationToken)
    {
        // Never grant this testing authorization in Production, even with flags/cookies/fake JWTs.
        if (!environment.IsDevelopment() || !options.Value.AllowDevelopmentLoopback
            || !Loopback(context.Connection.RemoteIpAddress) || !Loopback(context.Connection.LocalIpAddress)
            || !LocalHost(context.Request.Host.Host.ToLowerInvariant())) return ValueTask.FromResult(false);
        if (context.Request.Headers.Keys.Any(key => key.Equals("Forwarded", StringComparison.OrdinalIgnoreCase)
            || key.StartsWith("X-Forwarded-", StringComparison.OrdinalIgnoreCase)
            || key.StartsWith("X-Original-", StringComparison.OrdinalIgnoreCase)
            || key.StartsWith("CF-", StringComparison.OrdinalIgnoreCase))) return ValueTask.FromResult(false);
        var origin = context.Request.Headers.Origin.ToString();
        if (origin.Length > 0 && (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)
            || uri.Scheme is not ("http" or "https") || !LocalHost(uri.Host.ToLowerInvariant()))) return ValueTask.FromResult(false);
        var fetchSite = context.Request.Headers["Sec-Fetch-Site"].ToString();
        return ValueTask.FromResult(fetchSite is "" or "none" or "same-origin" or "same-site");
    }
}
