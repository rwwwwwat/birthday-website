using BirthdayWebsite.Api.Media;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace BirthdayWebsite.Api.Security;

public sealed class CloudflareAccessVerifier(CloudflareAccessSettings settings, ICloudflareSigningKeys keys,
    IHostEnvironment environment, IOptions<CloudflareAccessOptions> options,
    DevelopmentMediaAuthorizer localDevelopment) : ISiteAccessVerifier
{
    public async Task<SiteAccessResult> VerifyAsync(HttpContext context, CancellationToken cancellationToken)
    {
        var hasHeader = context.Request.Headers.TryGetValue("Cf-Access-Jwt-Assertion", out var header);
        if (!hasHeader && environment.IsDevelopment() && options.Value.AllowDevelopmentLoopback
            && await localDevelopment.IsAuthorizedAsync(context, cancellationToken))
            return new(200, new SiteAccessIdentity("development-loopback", Development: true));
        // A supplied bad JWT can NEVER downgrade into the Development branch.
        if (!settings.Valid || !hasHeader || header.Count != 1) return new(401);
        var token = header[0];
        if (string.IsNullOrWhiteSpace(token) || token.Length > 16384) return new(401);
        try
        {
            var handler = new JsonWebTokenHandler { MapInboundClaims = false, MaximumTokenSizeInBytes = 16384 };
            if (!handler.CanReadToken(token)) return new(401);
            var untrustedHeader = handler.ReadJsonWebToken(token);
            if (untrustedHeader.IsEncrypted || untrustedHeader.Alg != SecurityAlgorithms.RsaSha256
                || string.IsNullOrEmpty(untrustedHeader.Kid) || untrustedHeader.Kid.Length > 200) return new(401);
            var key = await keys.GetAsync(untrustedHeader.Kid, cancellationToken);
            if (key is null) return new(401);
            var validated = await handler.ValidateTokenAsync(token, new TokenValidationParameters
            {
                RequireSignedTokens = true, ValidateIssuerSigningKey = true, IssuerSigningKey = key,
                TryAllIssuerSigningKeys = false, ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
                ValidateIssuer = true, ValidIssuer = settings.Issuer,
                ValidateAudience = true, ValidAudience = settings.Audience, IgnoreTrailingSlashWhenValidatingAudience = false,
                ValidateLifetime = true, RequireExpirationTime = true, ClockSkew = TimeSpan.Zero,
            });
            if (!validated.IsValid) return new(401);
            var emails = validated.ClaimsIdentity.FindAll("email").ToArray();
            var email = emails.Length == 1 ? CloudflareAccessSettings.NormalizeEmail(emails[0].Value) : null;
            return email is not null && settings.AllowedEmails.Contains(email)
                ? new(200, new SiteAccessIdentity(email)) : new(403);
        }
        catch (Exception error) when (error is SecurityTokenException or ArgumentException or FormatException
            or InvalidOperationException or OperationCanceledException or HttpRequestException)
        { return new(401); }
    }
}
