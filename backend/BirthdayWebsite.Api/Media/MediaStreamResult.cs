using Microsoft.AspNetCore.Mvc;

namespace BirthdayWebsite.Api.Media;

// Fixed-size transfer buffer, not a MemoryStream/byte[] containing the whole media file.
public sealed class MediaStreamResult(Stream stream, long count) : IActionResult
{
    public async Task ExecuteResultAsync(ActionContext context)
    {
        var response = context.HttpContext.Response;
        await using (stream)
        {
            var buffer = new byte[64 * 1024]; var remaining = count;
            try
            {
                while (remaining > 0)
                {
                    var read = await stream.ReadAsync(buffer.AsMemory(0, (int)Math.Min(buffer.Length, remaining)), context.HttpContext.RequestAborted);
                    if (read == 0) throw new IOException("Incomplete private media stream.");
                    await response.Body.WriteAsync(buffer.AsMemory(0, read), context.HttpContext.RequestAborted);
                    remaining -= read;
                }
            }
            catch (Exception error) when (error is IOException or HttpRequestException or Azure.RequestFailedException or OperationCanceledException)
            {
                // Once bytes have been sent, changing HTTP status to 503 would be dishonest/impossible.
                if (response.HasStarted || context.HttpContext.RequestAborted.IsCancellationRequested) context.HttpContext.Abort();
                else { response.Headers.Clear(); response.StatusCode = 503; await response.WriteAsJsonAsync(new ProblemDetails { Status = 503, Title = "媒体读取服务暂时不可用" }); }
            }
        }
    }
}
