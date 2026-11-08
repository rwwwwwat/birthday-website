using Azure;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace BirthdayWebsite.Api.Media;

public sealed class AzureBlobMediaStorage(BlobContainerClient container) : IMediaStorage
{
    public static BlobContainerClient CreateClient(AzureBlobSettings settings, IHostEnvironment environment)
    {
        if (!settings.Valid) throw new MediaUnavailableException();
        var credential = new DefaultAzureCredential(new DefaultAzureCredentialOptions
        {
            ManagedIdentityClientId = settings.ManagedIdentityClientId,
            ExcludeEnvironmentCredential = !environment.IsDevelopment(),
            // A deployed service must not accidentally use a developer's cached CLI/session identity.
            ExcludeAzureCliCredential = !environment.IsDevelopment(),
            ExcludeAzureDeveloperCliCredential = !environment.IsDevelopment(),
            ExcludeAzurePowerShellCredential = !environment.IsDevelopment(),
            ExcludeVisualStudioCredential = !environment.IsDevelopment(),
            ExcludeVisualStudioCodeCredential = true,
            ExcludeInteractiveBrowserCredential = true,
            ExcludeBrokerCredential = true,
        });
        var clientOptions = new BlobClientOptions();
        clientOptions.Retry.MaxRetries = 0;
        clientOptions.Retry.NetworkTimeout = TimeSpan.FromSeconds(10);
        clientOptions.Diagnostics.IsLoggingContentEnabled = false;
        return new BlobServiceClient(settings.ServiceUri, credential, clientOptions).GetBlobContainerClient(settings.ContainerName);
    }
    public static string BlobName(MediaKind kind, string id) =>
        MediaCatalog.Tracks.ContainsKey(id) ? (kind == MediaKind.Audio ? $"audio/{id}.mp3" : $"covers/{id}.jpg")
        : throw new ArgumentException("Unknown media ID.");

    public async Task<MediaInfo?> GetInfoAsync(MediaKind kind, string id, CancellationToken cancellationToken)
    {
        if (!MediaCatalog.Tracks.ContainsKey(id)) return null;
        try
        {
            var properties = (await container.GetBlobClient(BlobName(kind, id)).GetPropertiesAsync(cancellationToken: cancellationToken)).Value;
            return new(properties.ContentLength, kind == MediaKind.Audio ? "audio/mpeg" : "image/jpeg", properties.LastModified, properties.ETag.ToString());
        }
        // HEAD failures can have no parsed XML ErrorCode. Status 404 is sufficient: never fall back to local files.
        catch (RequestFailedException error) when (error.Status == 404) { return null; }
        catch (Exception error) when (error is RequestFailedException or AuthenticationFailedException or HttpRequestException or IOException
            || error is OperationCanceledException && !cancellationToken.IsCancellationRequested) { throw new MediaUnavailableException(); }
    }

    public async Task<Stream> OpenReadAsync(MediaKind kind, string id, MediaInfo info, long offset, long count, CancellationToken cancellationToken)
    {
        try
        {
            var download = await container.GetBlobClient(BlobName(kind, id)).DownloadStreamingAsync(new BlobDownloadOptions
            {
                Range = new HttpRange(offset, count),
                Conditions = new BlobRequestConditions { IfMatch = new ETag(info.Version) },
            }, cancellationToken);
            return download.Value.Content;
        }
        catch (Exception error) when (error is RequestFailedException or AuthenticationFailedException or HttpRequestException or IOException
            || error is OperationCanceledException && !cancellationToken.IsCancellationRequested) { throw new MediaUnavailableException(); }
    }
}
