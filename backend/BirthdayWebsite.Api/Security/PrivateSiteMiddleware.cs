using Microsoft.AspNetCore.Mvc;

namespace BirthdayWebsite.Api.Security;

public sealed class PrivateSiteMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, ISiteAccessVerifier verifier)
    {
        context.Response.OnStarting(() =>
        {
            context.Response.Headers.CacheControl = "private, no-store";
            context.Response.Headers.Pragma = "no-cache";
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            return Task.CompletedTask;
        });
        var result = await verifier.VerifyAsync(context, context.RequestAborted);
        if (!result.Allowed)
        {
            context.Response.StatusCode = result.StatusCode == 403 ? 403 : 401;
            if (!HttpMethods.IsHead(context.Request.Method))
                await context.Response.WriteAsJsonAsync(new ProblemDetails
                { Status = context.Response.StatusCode, Title = context.Response.StatusCode == 401 ? "请重新完成私人网站身份验证" : "当前身份不在允许访问名单中" });
            return;
        }
        // Do not assign HttpContext.User: Access identity must not satisfy AdminCookie authorization.
        context.Features.Set(result.Identity!);
        await next(context);
    }
}
