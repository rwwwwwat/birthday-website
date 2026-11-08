using BirthdayWebsite.Api.Media;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace BirthdayWebsite.Api.Controllers;

[ApiController]
[Route("media")]
public sealed class MediaController(IMediaStorage store) : ControllerBase
{
    [HttpGet("audio/{id}"), HttpHead("audio/{id}")]
    public Task<IActionResult> Audio(string id, CancellationToken cancellationToken) => Read(MediaKind.Audio, id, cancellationToken);
    [HttpGet("covers/{id}"), HttpHead("covers/{id}")]
    public Task<IActionResult> Cover(string id, CancellationToken cancellationToken) => Read(MediaKind.Cover, id, cancellationToken);
    private async Task<IActionResult> Read(MediaKind kind, string id, CancellationToken cancellationToken)
    {
        if (!MediaCatalog.Tracks.ContainsKey(id)) return NotFound();
        try
        {
            var info = await store.GetInfoAsync(kind, id, cancellationToken);
            if (info is null) return NotFound();
            long offset = 0, count = info.Length;
            var partial = false;
            // RFC 9110: Range is defined for GET; HEAD returns full representation metadata.
            if (HttpMethods.IsGet(Request.Method) && Request.Headers.ContainsKey(HeaderNames.Range))
            {
                if (!RangeHeaderValue.TryParse(Request.Headers.Range.ToString(), out var range) || !string.Equals(range.Unit.Value, "bytes", StringComparison.OrdinalIgnoreCase) || range.Ranges.Count != 1)
                    return InvalidRange(info.Length);
                var item = range.Ranges.Single();
                if (item.From.HasValue) { offset = item.From.Value; count = Math.Min(item.To ?? (info.Length - 1), info.Length - 1) - offset + 1; }
                else { count = Math.Min(item.To ?? 0, info.Length); offset = info.Length - count; }
                if (offset < 0 || offset >= info.Length || count <= 0) return InvalidRange(info.Length);
                // If-Range mismatch means send a full representation, not bytes from an old version.
                var condition = Request.Headers.IfRange.ToString();
                var matches = condition.Length == 0 || condition == info.Version
                    || DateTimeOffset.TryParse(condition, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AssumeUniversal, out var date)
                    && info.LastModified.ToUnixTimeSeconds() <= date.ToUnixTimeSeconds();
                partial = matches;
                if (!partial) { offset = 0; count = info.Length; }
            }
            Stream? stream = null;
            if (!HttpMethods.IsHead(Request.Method) && count > 0)
                stream = await store.OpenReadAsync(kind, id, info, offset, count, cancellationToken);
            Response.Headers.AcceptRanges = "bytes";
            Response.Headers.LastModified = info.LastModified.ToString("R");
            Response.ContentType = info.ContentType; Response.ContentLength = count;
            Response.StatusCode = partial ? 206 : 200;
            if (partial) Response.Headers.ContentRange = $"bytes {offset}-{offset + count - 1}/{info.Length}";
            return stream is null ? new EmptyResult() : new MediaStreamResult(stream, count);
        }
        catch (Exception error) when (error is MediaUnavailableException or IOException or UnauthorizedAccessException)
        { return Problem(statusCode: 503, title: "媒体读取服务暂时不可用"); }
    }
    private IActionResult InvalidRange(long length)
    { Response.StatusCode = 416; Response.Headers.ContentRange = $"bytes */{length}"; Response.Headers.AcceptRanges = "bytes"; Response.ContentLength = 0; return new EmptyResult(); }
}
