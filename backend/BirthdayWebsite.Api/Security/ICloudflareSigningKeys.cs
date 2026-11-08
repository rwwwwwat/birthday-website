using Microsoft.IdentityModel.Tokens;

namespace BirthdayWebsite.Api.Security;

public interface ICloudflareSigningKeys
{
    Task<SecurityKey?> GetAsync(string keyId, CancellationToken cancellationToken);
}
