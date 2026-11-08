namespace BirthdayWebsite.Api.Media;

public sealed class PrivateMediaMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IMediaAuthorizer authorizer)
    {
        if (!context.Request.Path.StartsWithSegments("/media")) { await next(context); return; }
        context.Response.OnStarting(() =>
        {
            context.Response.Headers.CacheControl = "private, no-store";
            context.Response.Headers.Pragma = "no-cache";
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            return Task.CompletedTask;
        });
        if (!await authorizer.IsAuthorizedAsync(context, context.RequestAborted))
        { context.Response.StatusCode = 401; return; }
        await next(context);
    }
}
