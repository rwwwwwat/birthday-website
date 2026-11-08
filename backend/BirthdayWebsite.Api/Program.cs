using BirthdayWebsite.Api.Data;
using BirthdayWebsite.Api.Middleware;
using BirthdayWebsite.Api.Models;
using BirthdayWebsite.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Globalization;
using System.Threading.RateLimiting;
using BirthdayWebsite.Api.Security;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using BirthdayWebsite.Api.Media;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.FileProviders;

if (args.Contains("--configure-admin")) { AdminSetup.Run(); return; }

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false);
builder.Configuration.AddJsonFile("appsettings.Admin.Local.json", optional: true, reloadOnChange: false);
builder.Configuration.AddJsonFile("appsettings.Access.Local.json", optional: true, reloadOnChange: false);
builder.Configuration.AddJsonFile("appsettings.Media.Local.json", optional: true, reloadOnChange: false);
builder.Configuration.AddJsonFile("appsettings.PostgreSql.Local.json", optional: true, reloadOnChange: false);
builder.Configuration.AddEnvironmentVariables();
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 16 * 1024);
builder.Services.AddControllers().ConfigureApiBehaviorOptions(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var errors = new Dictionary<string, string[]>();
        foreach (var entry in context.ModelState.Values.SelectMany(value => value.Errors))
        {
            var safeMessage = context.HttpContext.Request.Path.StartsWithSegments("/api/admin")
                ? "管理请求格式或参数无效。"
                : entry.ErrorMessage is WishContentRules.EmptyMessage or WishContentRules.LengthMessage
                ? entry.ErrorMessage : "请求正文必须是包含 content 字符串的有效 JSON，且不包含额外字段。";
            errors[safeMessage == WishContentRules.EmptyMessage || safeMessage == WishContentRules.LengthMessage
                ? "content" : "body"] = [safeMessage];
        }
        var problem = new ValidationProblemDetails(errors) { Status = 400, Title = "请求验证失败" };
        problem.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
        var result = new BadRequestObjectResult(problem);
        result.ContentTypes.Add("application/problem+json");
        return result;
    };
});
builder.Services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
    context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier);
builder.Services.AddExceptionHandler<SafeExceptionHandler>();
// Render/Cloudflare terminate TLS in front of Kestrel. Trust the single local proxy so
// Request.IsHttps and the client IP used by rate limiting are correct inside the container.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
    options.ForwardLimit = 1;
});
builder.Services.AddOpenApi();
builder.Services.AddOptions<CloudflareAccessOptions>().Bind(builder.Configuration.GetSection("CloudflareAccess"));
builder.Services.AddSingleton<CloudflareAccessSettings>();
builder.Services.AddHttpClient("CloudflareJwks", client => client.Timeout = TimeSpan.FromSeconds(5))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false });
builder.Services.AddSingleton<ICloudflareSigningKeys, CloudflareSigningKeys>();
builder.Services.AddScoped<DevelopmentMediaAuthorizer>();
builder.Services.AddOptions<PrivateSiteOptions>().Bind(builder.Configuration.GetSection("PrivateSite"));
builder.Services.AddScoped<CloudflareAccessVerifier>();
builder.Services.AddScoped<ISiteAccessVerifier>(services =>
    services.GetRequiredService<IOptions<PrivateSiteOptions>>().Value.IsPublic
        ? new PublicSiteAccessVerifier()
        : services.GetRequiredService<CloudflareAccessVerifier>());
builder.Services.AddOptions<MediaOptions>().Bind(builder.Configuration.GetSection("Media"));
builder.Services.AddScoped<IMediaAuthorizer, SiteMediaAuthorizer>();
builder.Services.AddScoped<IPrivateMediaStore, LocalPrivateMediaStore>();
builder.Services.AddOptions<MediaStorageOptions>().Bind(builder.Configuration.GetSection("MediaStorage"));
builder.Services.AddOptions<AzureBlobOptions>().Bind(builder.Configuration.GetSection("AzureBlob"));
builder.Services.AddSingleton<AzureBlobSettings>();
builder.Services.AddScoped<LocalMediaStorage>();
builder.Services.AddSingleton<AzureBlobMediaStorage>(services => new(AzureBlobMediaStorage.CreateClient(
    services.GetRequiredService<AzureBlobSettings>(), builder.Environment)));
builder.Services.AddScoped<IMediaStorage>(services =>
{
    var provider = services.GetRequiredService<IOptions<MediaStorageOptions>>().Value.Provider;
    if (provider == "AzureBlob" && services.GetRequiredService<AzureBlobSettings>().Valid)
        return services.GetRequiredService<AzureBlobMediaStorage>();
    if (builder.Environment.IsDevelopment() && (string.IsNullOrEmpty(provider) || provider == "Local"))
        return services.GetRequiredService<LocalMediaStorage>();
    return new UnavailableMediaStorage(); // Production never falls back to local/static files.
});
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddOptions<AdminOptions>().Bind(builder.Configuration.GetSection("Admin"));
builder.Services.Configure<PasswordHasherOptions>(options => options.IterationCount = 210_000);
builder.Services.AddSingleton<IPasswordHasher<string>, PasswordHasher<string>>();
builder.Services.AddSingleton<AdminCredentials>();
// Framework default key persistence: current Windows user's DPAPI-protected key ring.
builder.Services.AddDataProtection().SetApplicationName("BirthdayWebsite.Admin.v1");
builder.Services.AddSingleton<AdminTicketStore>();
builder.Services.AddAuthentication("AdminCookie").AddCookie("AdminCookie", options =>
{
    options.Cookie.Name = builder.Environment.IsDevelopment() ? "Birthday.Admin" : "__Secure-Birthday.Admin";
    options.Cookie.Path = "/api/admin";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = false;
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
    options.Events.OnValidatePrincipal = context =>
    {
        var credentials = context.HttpContext.RequestServices.GetRequiredService<AdminCredentials>();
        if (!credentials.Configured || context.Principal?.Identity?.Name != credentials.Username
            || context.Principal.FindFirst("credential-stamp")?.Value != credentials.Stamp) context.RejectPrincipal();
        return Task.CompletedTask;
    };
});
builder.Services.AddOptions<CookieAuthenticationOptions>("AdminCookie")
    .Configure<AdminTicketStore, TimeProvider>((options, tickets, clock) => { options.SessionStore = tickets; options.TimeProvider = clock; });
builder.Services.AddAuthorization();
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "Birthday.Admin.Csrf";
    options.Cookie.Path = "/api/admin";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
});
builder.Services.AddSingleton<DatabaseProviderSelection>();
builder.Services.AddScoped<SqlAdminWishService>();
builder.Services.AddScoped<PostgresAdminWishService>();
builder.Services.AddScoped<IAdminWishService>(services => services.GetRequiredService<DatabaseProviderSelection>().Provider == DatabaseProvider.SqlServer
    ? services.GetRequiredService<SqlAdminWishService>() : services.GetRequiredService<PostgresAdminWishService>());
builder.Services.AddOptions<DatabaseOptions>().Bind(builder.Configuration.GetSection("Database"))
    .Validate(options => options.ConnectTimeoutSeconds is >= 1 and <= 30
        && options.CommandTimeoutSeconds is >= 1 and <= 30
        && options.OperationTimeoutSeconds >= Math.Max(options.ConnectTimeoutSeconds, options.CommandTimeoutSeconds)
        && options.OperationTimeoutSeconds <= 60, "数据库超时配置无效。")
    .ValidateOnStart();
builder.Services.AddSingleton<SqlConnectionFactory>();
builder.Services.AddSingleton<PostgresConnectionFactory>();
builder.Services.AddSingleton<IPostgresConnectionFactory>(services => services.GetRequiredService<PostgresConnectionFactory>());
builder.Services.AddScoped<PostgresOperation>();
builder.Services.AddScoped<SqlWishService>();
builder.Services.AddScoped<PostgresWishService>();
builder.Services.AddScoped<IWishService>(services =>
    services.GetRequiredService<IOptions<DatabaseOptions>>().Value.Enabled
        ? services.GetRequiredService<DatabaseProviderSelection>().Provider == DatabaseProvider.SqlServer
            ? services.GetRequiredService<SqlWishService>() : services.GetRequiredService<PostgresWishService>()
        : new UnavailableWishService());
builder.Services.AddScoped<SqlDatabaseHealthProbe>();
builder.Services.AddScoped<PostgresDatabaseHealthProbe>();
builder.Services.AddScoped<IDatabaseHealthProbe>(services => services.GetRequiredService<DatabaseProviderSelection>().Provider == DatabaseProvider.SqlServer
    ? services.GetRequiredService<SqlDatabaseHealthProbe>() : services.GetRequiredService<PostgresDatabaseHealthProbe>());
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
if (allowedOrigins.Length == 0 && builder.Environment.IsDevelopment())
    allowedOrigins = ["http://localhost:5173", "http://localhost:4173"];
builder.Services.AddCors(options => options.AddPolicy("Frontend", policy =>
{
    if (allowedOrigins.Length == 0) return;
    policy.WithOrigins(allowedOrigins)
          .WithMethods("GET", "POST", "OPTIONS")
          .WithHeaders("Content-Type");
}));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("AdminLogin", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
    options.AddPolicy("WishSubmission", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true,
        }));
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter = Math.Ceiling(retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        await context.HttpContext.RequestServices.GetRequiredService<IProblemDetailsService>()
            .WriteAsync(new ProblemDetailsContext
            {
                HttpContext = context.HttpContext,
                ProblemDetails = new() { Status = 429, Title = "请求过于频繁，请稍后再试" },
            });
    };
});
var app = builder.Build();
app.UseForwardedHeaders();
var databaseProvider = app.Services.GetRequiredService<DatabaseProviderSelection>();
// Validate connection settings at startup without opening a connection.
if (databaseProvider.Provider == DatabaseProvider.SqlServer) _ = app.Services.GetRequiredService<SqlConnectionFactory>();
else _ = app.Services.GetRequiredService<PostgresConnectionFactory>();
app.UseExceptionHandler();
// Entire source-site boundary: before status pages, CORS, routing, controllers and ALL static files.
// There is no anonymous database health endpoint or anonymous private-resource fallback.
app.UseMiddleware<PrivateSiteMiddleware>();
app.UseStatusCodePages(async context =>
    await context.HttpContext.RequestServices.GetRequiredService<IProblemDetailsService>()
        .WriteAsync(new ProblemDetailsContext { HttpContext = context.HttpContext }));
app.Use(async (context, next) =>
{
    if (context.Request.ContentLength > 16 * 1024)
    {
        context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
        await context.RequestServices.GetRequiredService<IProblemDetailsService>()
            .WriteAsync(new ProblemDetailsContext
            {
                HttpContext = context,
                ProblemDetails = new() { Status = 413, Title = "请求正文过大" },
            });
        return;
    }
    await next(context);
});
// Applied before static files too: no accidental anonymous /media static-file bypass.
app.UseMiddleware<PrivateMediaMiddleware>();
app.UseRouting();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/admin") || context.Request.Path.StartsWithSegments("/api/admin"))
    {
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
        if (!app.Environment.IsDevelopment() && !context.Request.IsHttps) { context.Response.StatusCode = 400; return; }
    }
    await next(context);
});
// Public birthday frontend origins never receive access to administrator endpoints.
app.UseWhen(context => !context.Request.Path.StartsWithSegments("/api/admin"), branch => branch.UseCors("Frontend"));
if (app.Environment.IsDevelopment()) app.MapOpenApi();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api/admin")
        && !HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method) && !HttpMethods.IsOptions(context.Request.Method))
    {
        try { await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context); }
        catch (AntiforgeryValidationException)
        { context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new ProblemDetails { Status = 400, Title = "安全令牌无效，请刷新页面后重试" }); return; }
    }
    await next(context);
});
app.UseDefaultFiles();
app.UseStaticFiles();
// Local built frontend is served by the same private source boundary. Production must set its deployment path.
var frontendPath = builder.Configuration["PrivateSite:FrontendRootPath"];
if (string.IsNullOrWhiteSpace(frontendPath) && app.Environment.IsDevelopment())
    frontendPath = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "..", "frontend", "dist"));
if (!string.IsNullOrWhiteSpace(frontendPath) && Directory.Exists(frontendPath))
{
    var frontendFiles = new PhysicalFileProvider(Path.GetFullPath(frontendPath));
    app.Lifetime.ApplicationStopped.Register(frontendFiles.Dispose);
    // A mistaken frontend directory must never turn server JSON/configuration into readable assets.
    app.UseWhen(context => PrivateFrontendAssets.Matches(context.Request.Path), branch =>
    {
        branch.UseDefaultFiles(new DefaultFilesOptions { FileProvider = frontendFiles });
        branch.UseStaticFiles(new StaticFileOptions { FileProvider = frontendFiles });
    });
}
app.MapControllers();
app.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));
app.Run();

public partial class Program { }
