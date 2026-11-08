using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace BirthdayWebsite.Api.Media;

public sealed class MediaStorageOptions { public string Provider { get; set; } = ""; }
public sealed class AzureBlobOptions
{
    public string ServiceUri { get; set; } = "";
    public string ContainerName { get; set; } = "birthday-private-media";
    public string ManagedIdentityClientId { get; set; } = "";
}

public sealed class AzureBlobSettings
{
    public Uri? ServiceUri { get; }
    public string ContainerName { get; }
    public string? ManagedIdentityClientId { get; }
    public bool Valid { get; }
    public AzureBlobSettings(IOptions<AzureBlobOptions> options)
    {
        var value = options.Value; ContainerName = value.ContainerName ?? "";
        ManagedIdentityClientId = string.IsNullOrWhiteSpace(value.ManagedIdentityClientId) ? null : value.ManagedIdentityClientId;
        // Fixed Azure public-cloud endpoint only; never accept SAS, account keys, paths or arbitrary proxy URLs.
        Valid = Uri.TryCreate(value.ServiceUri, UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.Port == 443
            && uri.UserInfo.Length == 0 && uri.AbsolutePath == "/" && uri.Query.Length == 0 && uri.Fragment.Length == 0
            && Regex.IsMatch(uri.DnsSafeHost, @"\A[a-z0-9]{3,24}\.blob\.core\.windows\.net\z")
            && ContainerName == "birthday-private-media"
            && (ManagedIdentityClientId is null || Guid.TryParse(ManagedIdentityClientId, out _));
        if (Valid) ServiceUri = uri;
    }
}

public sealed class UnavailableMediaStorage : IMediaStorage
{
    public Task<MediaInfo?> GetInfoAsync(MediaKind kind, string id, CancellationToken cancellationToken) => throw new MediaUnavailableException();
    public Task<Stream> OpenReadAsync(MediaKind kind, string id, MediaInfo info, long offset, long count, CancellationToken cancellationToken) => throw new MediaUnavailableException();
}
