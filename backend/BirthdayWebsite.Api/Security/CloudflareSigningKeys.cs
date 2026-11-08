using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace BirthdayWebsite.Api.Security;

// Only key discovery/cache is implemented here; all JWT cryptography uses IdentityModel.
public sealed class CloudflareSigningKeys(CloudflareAccessSettings settings, IHttpClientFactory clients,
    TimeProvider clock) : ICloudflareSigningKeys
{
    private readonly SemaphoreSlim refreshLock = new(1, 1);
    private IReadOnlyDictionary<string, SecurityKey> keys = new Dictionary<string, SecurityKey>();
    private DateTimeOffset expires, retryAfter, missRefreshAfter;
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(15), RefreshCooldown = TimeSpan.FromSeconds(30);
    public async Task<SecurityKey?> GetAsync(string keyId, CancellationToken cancellationToken)
    {
        if (!settings.Valid || keyId.Length is 0 or > 200) return null;
        await refreshLock.WaitAsync(cancellationToken);
        try
        {
            var now = clock.GetUtcNow();
            if (now < expires && keys.TryGetValue(keyId, out var cached)) return cached;
            if (now < retryAfter || (now < expires && now < missRefreshAfter)) return null;
            // One immediate refresh for an unknown kid, then bounded retries; never fetch token-supplied URLs.
            if (now < expires) missRefreshAfter = now + RefreshCooldown;
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(TimeSpan.FromSeconds(5));
                using var response = await clients.CreateClient("CloudflareJwks").GetAsync(settings.JwksAddress,
                    HttpCompletionOption.ResponseHeadersRead, timeout.Token);
                response.EnsureSuccessStatusCode();
                if (response.Content.Headers.ContentLength > 65536) throw new InvalidOperationException();
                await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
                using var buffer = new MemoryStream(); var chunk = new byte[4096]; int length;
                while ((length = await stream.ReadAsync(chunk, timeout.Token)) > 0)
                { if (buffer.Length + length > 65536) throw new InvalidOperationException(); buffer.Write(chunk, 0, length); }
                var set = JsonWebKeySet.Create(Encoding.UTF8.GetString(buffer.ToArray()));
                if (set.Keys.Count is < 1 or > 32) throw new InvalidOperationException();
                var fresh = new Dictionary<string, SecurityKey>(StringComparer.Ordinal);
                foreach (var key in set.Keys)
                {
                    if (key.Kty != "RSA" || (key.Alg is not null && key.Alg != SecurityAlgorithms.RsaSha256)
                        || (key.Use is not null && key.Use != "sig") || string.IsNullOrEmpty(key.Kid)
                        || (key.KeyOps.Count > 0 && !key.KeyOps.Contains("verify")) || key.KeySize < 2048) continue;
                    if (!fresh.TryAdd(key.Kid, key)) throw new InvalidOperationException();
                }
                if (fresh.Count == 0) throw new InvalidOperationException();
                keys = fresh; expires = clock.GetUtcNow() + CacheLifetime; retryAfter = default;
            }
            catch (Exception error) when (error is HttpRequestException or OperationCanceledException or InvalidOperationException
                or ArgumentException or System.Text.Json.JsonException or FormatException)
            {
                // No tokens, cookies, raw JSON or exception objects are logged. No stale-after-expiry fallback.
                retryAfter = clock.GetUtcNow() + RefreshCooldown; return null;
            }
            return keys.GetValueOrDefault(keyId);
        }
        finally { refreshLock.Release(); }
    }
}
