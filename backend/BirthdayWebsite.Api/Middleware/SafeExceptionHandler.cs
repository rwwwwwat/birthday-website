using BirthdayWebsite.Api.Services;
using Microsoft.AspNetCore.Diagnostics;

namespace BirthdayWebsite.Api.Middleware;

public sealed class SafeExceptionHandler(IProblemDetailsService problems,
    ILogger<SafeExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception,
        CancellationToken cancellationToken)
    {
        var status = exception switch
        {
            DatabaseUnavailableException => StatusCodes.Status503ServiceUnavailable,
            BadHttpRequestException badRequest => badRequest.StatusCode,
            _ => StatusCodes.Status500InternalServerError,
        };
        // Do not log exception objects, messages, SQL text or request bodies.
        logger.LogWarning("Request failed. Category={Category}; TraceId={TraceId}",
            exception.GetType().Name, context.TraceIdentifier);
        context.Response.StatusCode = status;
        await problems.WriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = new()
            {
                Status = status,
                Title = status switch
                {
                    503 => "数据库服务暂时不可用",
                    413 => "请求正文过大",
                    400 => "请求格式不正确",
                    _ => "服务器暂时无法完成请求",
                },
            },
        });
        return true;
    }
}
