namespace BirthdayWebsite.Api.Media;

// Retains the existing local implementation and its filename/path protections.
public sealed class LocalMediaStorage(IPrivateMediaStore files) : IMediaStorage
{
    public async Task<MediaInfo?> GetInfoAsync(MediaKind kind, string id, CancellationToken cancellationToken)
    {
        var read = await files.OpenAsync(kind, id, cancellationToken);
        if (read is null) return null;
        await using var stream = read.Content;
        return new(stream.Length, read.ContentType, read.LastModified, $"{stream.Length}:{read.LastModified.UtcTicks}");
    }
    public async Task<Stream> OpenReadAsync(MediaKind kind, string id, MediaInfo info, long offset, long count, CancellationToken cancellationToken)
    {
        var read = await files.OpenAsync(kind, id, cancellationToken) ?? throw new MediaUnavailableException();
        try
        {
            if ($"{read.Content.Length}:{read.LastModified.UtcTicks}" != info.Version) throw new MediaUnavailableException();
            read.Content.Seek(offset, SeekOrigin.Begin);
            return read.Content;
        }
        catch { await read.Content.DisposeAsync(); throw; }
    }
}
