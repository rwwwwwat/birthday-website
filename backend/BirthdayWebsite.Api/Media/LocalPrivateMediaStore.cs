using Microsoft.Extensions.Options;

namespace BirthdayWebsite.Api.Media;

public sealed class LocalPrivateMediaStore(IWebHostEnvironment environment, IOptions<MediaOptions> options) : IPrivateMediaStore
{
    public Task<PrivateMediaRead?> OpenAsync(MediaKind kind, string trackId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!MediaCatalog.Tracks.TryGetValue(trackId, out var entry)) return Task.FromResult<PrivateMediaRead?>(null);
        var configured = options.Value.LocalRootPath;
        // Convenient local source only in Development. Deployment must explicitly configure storage.
        if (string.IsNullOrWhiteSpace(configured) && !environment.IsDevelopment()) return Task.FromResult<PrivateMediaRead?>(null);
        var root = Path.GetFullPath(string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(environment.ContentRootPath, "..", "..", "audio") : configured);
        if (!string.IsNullOrEmpty(environment.WebRootPath)
            && (root + Path.DirectorySeparatorChar).StartsWith(Path.GetFullPath(environment.WebRootPath) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Private media must be outside wwwroot.");
        var path = Path.Combine(root, kind == MediaKind.Audio ? entry.AudioFile : entry.CoverFile);
        if (!File.Exists(path)) return Task.FromResult<PrivateMediaRead?>(null);
        // Reject symbolic links/reparse files: only the selected originals may be opened.
        if ((File.GetAttributes(root) & FileAttributes.ReparsePoint) != 0 || (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidOperationException("Private media links are not allowed.");
        Stream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous);
        return Task.FromResult<PrivateMediaRead?>(new(stream, kind == MediaKind.Audio ? "audio/mpeg" : "image/jpeg", File.GetLastWriteTimeUtc(path)));
    }
}
