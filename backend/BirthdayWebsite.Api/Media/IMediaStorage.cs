namespace BirthdayWebsite.Api.Media;

public sealed record MediaInfo(long Length, string ContentType, DateTimeOffset LastModified, string Version);

// Metadata is separate from the body: HEAD and rejected ranges never download an audio body.
public interface IMediaStorage
{
    Task<MediaInfo?> GetInfoAsync(MediaKind kind, string id, CancellationToken cancellationToken);
    Task<Stream> OpenReadAsync(MediaKind kind, string id, MediaInfo info, long offset, long count, CancellationToken cancellationToken);
}

public sealed class MediaUnavailableException : Exception
{
    public MediaUnavailableException() : base("Private media is unavailable.") { }
}
