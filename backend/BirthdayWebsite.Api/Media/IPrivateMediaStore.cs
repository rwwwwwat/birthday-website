namespace BirthdayWebsite.Api.Media;

// The caller/framework owns and disposes Content. Implementations must provide a seekable
// read stream (or a future range-aware result), never buffer entire songs into byte arrays.
public sealed record PrivateMediaRead(Stream Content, string ContentType, DateTimeOffset LastModified);
public interface IPrivateMediaStore
{
    Task<PrivateMediaRead?> OpenAsync(MediaKind kind, string trackId, CancellationToken cancellationToken);
}
