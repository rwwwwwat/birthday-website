using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BirthdayWebsite.Api.Security;
using BirthdayWebsite.Api.Media;
using BirthdayWebsite.Api.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;

namespace BirthdayWebsite.Api.Tests;

// Keys/email addresses exist only in this test assembly. No cloud service or real database is contacted.
public sealed class AccessFactory(bool configured = true, bool development = false, string remote = "127.0.0.1") : WebApplicationFactory<Program>
{
    public const string Issuer = "https://isolated-test.cloudflareaccess.com", Audience = "isolated-test-audience";
    public RSA SigningRsa { get; } = RSA.Create(2048);
    public MutableClock Clock { get; } = new();
    public TestJwksTransport Transport { get; } = new();
    public RecordingWishService Wishes { get; } = new(false);
    public FakeAdminWishes AdminWishes { get; } = new(false);
    public CapturedAccessLogs Logs { get; } = new();
    public Dictionary<string, string?> Extra { get; } = new();
    public bool UseConfiguredMediaStorage { get; set; }
    public Action<IServiceCollection>? ConfigureMediaServices { get; set; }
    public RsaSecurityKey SigningKey => new(SigningRsa) { KeyId = "key-one" };
    public void PublishKey(RsaSecurityKey key)
    {
        var parameters = key.Rsa.ExportParameters(false);
        Transport.Json = JsonSerializer.Serialize(new { keys = new[] { new { kty = "RSA", use = "sig", alg = "RS256", kid = key.KeyId,
            n = Base64UrlEncoder.Encode(parameters.Modulus), e = Base64UrlEncoder.Encode(parameters.Exponent) } } });
    }
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        PublishKey(SigningKey);
        builder.UseEnvironment(development ? "Development" : "Production");
        builder.ConfigureLogging(logging => logging.AddProvider(Logs));
        builder.ConfigureAppConfiguration((context, config) =>
        {
            var contentRoot = context.HostingEnvironment.ContentRootPath;
            var values = new Dictionary<string, string?>
            {
                ["Database:Enabled"] = "false", ["Admin:Username"] = "test-admin",
                ["Admin:PasswordHash"] = new PasswordHasher<string>(Options.Create(new PasswordHasherOptions { IterationCount = 1000 })).HashPassword("test-admin", AdminFactory.Password),
                ["CloudflareAccess:TeamDomain"] = configured ? Issuer : "",
                ["CloudflareAccess:Audience"] = configured ? Audience : "",
                ["CloudflareAccess:AllowedEmails:0"] = configured ? " One@Example.Invalid " : "",
                ["CloudflareAccess:AllowedEmails:1"] = configured ? "two@example.invalid" : "",
                // These flags MUST NOT bypass the production verifier.
                ["CloudflareAccess:AllowDevelopmentLoopback"] = "true", ["Media:AllowDevelopmentLoopback"] = "true",
                ["Media:LocalRootPath"] = Path.GetFullPath(Path.Combine(contentRoot,"..","..","audio")),
                ["PrivateSite:FrontendRootPath"] = Path.GetFullPath(Path.Combine(contentRoot,"..","..","frontend","dist")),
            };
            foreach (var pair in Extra) values[pair.Key] = pair.Value;
            config.AddInMemoryCollection(values);
        });
        builder.ConfigureTestServices(services =>
        {
            // Test-only original-file fixture. Production DI is tested separately and never permits local fallback.
            if (!UseConfiguredMediaStorage) { services.RemoveAll<IMediaStorage>(); services.AddScoped<IMediaStorage, LocalMediaStorage>(); }
            ConfigureMediaServices?.Invoke(services);
            services.RemoveAll<TimeProvider>(); services.AddSingleton<TimeProvider>(Clock);
            services.AddSingleton<IStartupFilter>(new ConnectionFilter(remote));
            services.AddHttpClient("CloudflareJwks").ConfigurePrimaryHttpMessageHandler(() => Transport);
            services.RemoveAll<IWishService>(); services.AddSingleton<IWishService>(Wishes);
            services.RemoveAll<IAdminWishService>(); services.AddSingleton<IAdminWishService>(AdminWishes);
            services.RemoveAll<IDatabaseHealthProbe>(); services.AddSingleton<IDatabaseHealthProbe>(new FakeHealthProbe(true));
            services.AddDataProtection().UseEphemeralDataProtectionProvider();
        });
    }
    public HttpClient Client(string? token = null)
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri(development ? "http://localhost" : "https://localhost"), AllowAutoRedirect = false });
        if (token is not null) client.DefaultRequestHeaders.Add("Cf-Access-Jwt-Assertion", token);
        return client;
    }
    public string Token(string? email = "one@example.invalid", string fault = "", RsaSecurityKey? key = null)
    {
        var now = DateTime.UtcNow; var claims = new Dictionary<string,object>();
        if (email is not null) claims["email"] = email;
        claims["sub"] = "isolated-subject";
        var signingKey = key ?? SigningKey;
        if (fault == "no-kid") signingKey = new(SigningRsa);
        if (fault == "unknown-kid") signingKey = new(SigningRsa) { KeyId = "unknown-key" };
        SigningCredentials? credentials = fault == "none" ? null : fault == "hs256"
            ? new SigningCredentials(new SymmetricSecurityKey(RandomNumberGenerator.GetBytes(32)),SecurityAlgorithms.HmacSha256)
            : new SigningCredentials(signingKey,fault=="rs512"?SecurityAlgorithms.RsaSha512:SecurityAlgorithms.RsaSha256);
        return new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false }.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = fault == "issuer" ? "https://other.cloudflareaccess.com" : Issuer,
            Audience = fault == "audience" ? "other-audience" : Audience,
            NotBefore = fault == "future" ? now.AddMinutes(10) : now.AddHours(-1),
            Expires = fault == "no-exp" ? null : fault == "expired" ? now.AddMinutes(-1) : now.AddHours(1),
            IssuedAt = now.AddHours(-1), Claims = claims, SigningCredentials = credentials,
        });
    }
    private sealed class ConnectionFilter(string remote) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        { app.Use(async (context, continuation) => { context.Connection.RemoteIpAddress=IPAddress.Parse(remote);context.Connection.LocalIpAddress=IPAddress.Loopback;await continuation(); }); next(app); };
    }
}

public sealed class CapturedAccessLogs : ILoggerProvider
{
    public ConcurrentQueue<string> Lines { get; } = new();
    public ILogger CreateLogger(string category) => new Capture(Lines);
    public void Dispose() { }
    private sealed class Capture(ConcurrentQueue<string> lines) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => true;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? error, Func<TState,Exception?,string> format) =>
            lines.Enqueue(format(state,error) + (error?.ToString() ?? ""));
    }
}

public sealed class TestJwksTransport : HttpMessageHandler
{
    public string Json { get; set; } = "{}";
    public bool Fail { get; set; }
    public int Calls;
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    {
        Interlocked.Increment(ref Calls);
        Assert.Equal(AccessFactory.Issuer + "/cdn-cgi/access/certs", request.RequestUri?.AbsoluteUri);
        Assert.False(request.Headers.Contains("Cf-Access-Jwt-Assertion")); Assert.False(request.Headers.Contains("Cookie"));
        if (Fail) throw new HttpRequestException("isolated transport failure");
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Json,Encoding.UTF8,"application/json") });
    }
}

public sealed class CloudflareAccessTests
{
    [Theory]
    [InlineData("missing")] [InlineData("malformed")] [InlineData("signature")]
    [InlineData("issuer")] [InlineData("audience")] [InlineData("expired")]
    [InlineData("future")] [InlineData("unknown-kid")] [InlineData("hs256")]
    [InlineData("none")] [InlineData("no-exp")] [InlineData("no-kid")] [InlineData("rs512")]
    public async Task InvalidTokensAre401WithoutReadingServices(string fault)
    {
        await using var factory=new AccessFactory(); using var wrong=RSA.Create(2048);
        var token=fault=="missing"?null:fault=="malformed"?"not-a-jwt":factory.Token(fault:fault,key:fault=="signature"?new RsaSecurityKey(wrong){KeyId="key-one"}:null);
        using var client=factory.Client(token); using var response=await client.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.Unauthorized,response.StatusCode); Assert.True(response.Headers.CacheControl?.NoStore);
        var body=await response.Content.ReadAsStringAsync();Assert.DoesNotContain("healthy",body);Assert.DoesNotContain("IDX",body);
        if(token is not null) Assert.DoesNotContain(token,body);
        if(fault=="signature") { Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/health")).StatusCode);Assert.Equal(1,factory.Transport.Calls); }
        Assert.Equal(0,factory.Wishes.Calls);Assert.Equal(0,factory.AdminWishes.Reads);
    }
    [Theory]
    [InlineData("one@example.invalid")] [InlineData("two@example.invalid")] [InlineData(" ONE@EXAMPLE.INVALID ")]
    public async Task ExactlyTwoNormalizedEmailsCanReadProtectedHealth(string email)
    {
        await using var factory=new AccessFactory();using var client=factory.Client(factory.Token(email));
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync("/api/health")).StatusCode);Assert.Equal(1,factory.Transport.Calls);
    }
    [Theory]
    [InlineData("third@example.invalid")] [InlineData(null)] [InlineData("")] [InlineData(" ")]
    [InlineData("one+other@example.invalid")] [InlineData("display <one@example.invalid>")]
    public async Task ValidSignatureWithoutAnAllowedEmailIs403(string? email)
    {
        await using var factory=new AccessFactory();using var client=factory.Client(factory.Token(email));
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync("/api/health")).StatusCode);
    }
    [Fact]
    public async Task EmailHeaderCannotReplaceOrOverrideSignedEmailAndBadJwtCannotUseDevBypass()
    {
        await using var factory=new AccessFactory(development:true);using var client=factory.Client();
        client.DefaultRequestHeaders.Add("Cf-Access-Authenticated-User-Email","one@example.invalid");
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/health")).StatusCode);
        client.DefaultRequestHeaders.Add("Cf-Access-Jwt-Assertion","broken");
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/health")).StatusCode);
        client.DefaultRequestHeaders.Remove("Cf-Access-Jwt-Assertion");client.DefaultRequestHeaders.Add("Cf-Access-Jwt-Assertion",factory.Token("third@example.invalid"));
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync("/api/health")).StatusCode);
    }
    [Fact]
    public async Task MissingProductionConfigurationAndAnyBypassFlagsFailClosed()
    {
        await using var factory=new AccessFactory(configured:false);factory.Extra["CloudflareAccess:Enabled"]="false";factory.Extra["CloudflareAccess:Bypass"]="true";
        using var client=factory.Client();Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/")).StatusCode);
        Assert.Equal(0,factory.Transport.Calls);
    }
    [Theory]
    [InlineData("127.0.0.1",HttpStatusCode.OK)] [InlineData("203.0.113.6",HttpStatusCode.Unauthorized)]
    public async Task DevelopmentBypassRequiresActualLoopback(string remote,HttpStatusCode expected)
    {
        await using var factory=new AccessFactory(configured:false,development:true,remote:remote);using var client=factory.Client();
        Assert.Equal(expected,(await client.GetAsync("/api/health")).StatusCode);
    }
    [Fact]
    public async Task EntireSiteBoundaryProtectsRealStaticFilesAllPhotosMediaApisAndAdmin()
    {
        await using var factory=new AccessFactory();using var denied=factory.Client();using var allowed=factory.Client(factory.Token());
        var siteFiles=new[]{"/","/index.html","/favicon.svg","/admin/","/admin/admin.js","/admin/admin.css"}.ToList();
        siteFiles.AddRange(new[]{"firstphoto","other1","other2","other3","other4","pther5","other6","other7","other8","other9","userphoto"}.Select(name=>"/images/"+name+".jpg"));
        var frontend=Path.GetFullPath(Path.Combine(factory.Services.GetRequiredService<IWebHostEnvironment>().ContentRootPath,"..","..","frontend","dist"));
        siteFiles.AddRange(Directory.GetFiles(Path.Combine(frontend,"assets")).Select(path=>"/assets/"+Path.GetFileName(path)));
        foreach(var id in new[]{"cry-for-me","aitaiwa","danger","kataomoi"}){siteFiles.Add("/media/audio/"+id);siteFiles.Add("/media/covers/"+id);}
        foreach(var path in siteFiles)
        {
            Assert.Equal(HttpStatusCode.Unauthorized,(await denied.GetAsync(path)).StatusCode);
            using var response=await allowed.SendAsync(new HttpRequestMessage(HttpMethod.Head,path));
            // Controller health does not define HEAD, but all selected files/media do.
            Assert.Equal(HttpStatusCode.OK,response.StatusCode);Assert.True(response.Headers.CacheControl?.NoStore);Assert.True(response.Headers.CacheControl?.Private);
        }
        foreach(var path in new[]{"/api/health","/api/admin/me","/api/admin/wishes","/api/admin/wishes/41","/api/admin/wishes/stats"})
            Assert.Equal(HttpStatusCode.Unauthorized,(await denied.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await denied.PostAsJsonAsync("/api/wishes",new{content="FAKE ONLY"})).StatusCode);Assert.Equal(0,factory.Wishes.Calls);
        Assert.Equal(0,factory.AdminWishes.Reads);
    }
    [Fact]
    public async Task ValidJwtKeepsRange206And416WhileNoJwtGetsNoMediaBytes()
    {
        await using var factory=new AccessFactory();using var client=factory.Client(factory.Token());
        using var range=new HttpRequestMessage(HttpMethod.Get,"/media/audio/danger");range.Headers.Range=new(0,1);
        using var response=await client.SendAsync(range);Assert.Equal(HttpStatusCode.PartialContent,response.StatusCode);Assert.Equal(2,(await response.Content.ReadAsByteArrayAsync()).Length);
        using var impossible=new HttpRequestMessage(HttpMethod.Get,"/media/audio/danger");impossible.Headers.Range=new(long.MaxValue,null);
        Assert.Equal(HttpStatusCode.RequestedRangeNotSatisfiable,(await client.SendAsync(impossible)).StatusCode);
    }
    [Fact]
    public async Task JwksCachesRefreshesUnknownKidAndDoesNotTrustUnknownOrOfflineKeys()
    {
        await using var factory=new AccessFactory();using var first=factory.Client(factory.Token());
        Assert.Equal(HttpStatusCode.OK,(await first.GetAsync("/api/health")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await first.GetAsync("/api/health")).StatusCode);Assert.Equal(1,factory.Transport.Calls);
        using var rotated=RSA.Create(2048);var key=new RsaSecurityKey(rotated){KeyId="key-two"};factory.PublishKey(key);
        using var second=factory.Client(factory.Token(key:key));Assert.Equal(HttpStatusCode.OK,(await second.GetAsync("/api/health")).StatusCode);Assert.Equal(2,factory.Transport.Calls);
        using var unknown=factory.Client(factory.Token(fault:"unknown-kid"));Assert.Equal(HttpStatusCode.Unauthorized,(await unknown.GetAsync("/api/health")).StatusCode);Assert.Equal(2,factory.Transport.Calls);
        factory.Clock.Advance(TimeSpan.FromSeconds(31));factory.Transport.Fail=true;
        Assert.Equal(HttpStatusCode.Unauthorized,(await unknown.GetAsync("/api/health")).StatusCode);Assert.Equal(3,factory.Transport.Calls);
        Assert.Equal(HttpStatusCode.OK,(await second.GetAsync("/api/health")).StatusCode); // Still valid cached key, signature still checked.
        factory.Clock.Advance(TimeSpan.FromMinutes(16));Assert.Equal(HttpStatusCode.Unauthorized,(await second.GetAsync("/api/health")).StatusCode);
    }
    [Fact]
    public async Task UnavailableJwksNeverDowngradesToAnonymousOrRepeatedNetworkFetches()
    {
        await using var factory=new AccessFactory();using var client=factory.Client(factory.Token());factory.Transport.Fail=true;
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/health")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/health")).StatusCode);Assert.Equal(1,factory.Transport.Calls);
    }
    [Fact]
    public async Task AccessDoesNotGrantAdminAndAdminCookieCannotReplaceAccess()
    {
        await using var factory=new AccessFactory();var token=factory.Token();using var client=factory.Client(token);
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/admin/wishes")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await AdminFactory.Login(client)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync("/api/admin/wishes")).StatusCode);
        client.DefaultRequestHeaders.Remove("Cf-Access-Jwt-Assertion");Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/admin/me")).StatusCode);
        client.DefaultRequestHeaders.Add("Cf-Access-Jwt-Assertion",token);
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PatchAsync("/api/admin/wishes/41/read",null)).StatusCode);Assert.Equal(0,factory.AdminWishes.Writes);
        Assert.Equal(HttpStatusCode.NoContent,(await AdminFactory.Send(client,"/api/admin/logout",HttpMethod.Post)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/admin/me")).StatusCode);
    }
    [Fact]
    public async Task TokensAndCookiesAreNotWrittenToOrdinaryLogs()
    {
        await using var factory=new AccessFactory();var token=factory.Token("third@example.invalid");using var client=factory.Client(token);
        const string cookie="isolated-cookie-must-not-be-logged";client.DefaultRequestHeaders.Add("Cookie","CF_Authorization="+cookie);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync("/api/health")).StatusCode);
        foreach(var line in factory.Logs.Lines){Assert.DoesNotContain(token,line);Assert.DoesNotContain(cookie,line);}
    }
    [Theory]
    [InlineData("http://isolated-test.cloudflareaccess.com")]
    [InlineData("https://evil.example")]
    [InlineData("https://isolated-test.cloudflareaccess.com/path")]
    [InlineData("https://user:password@isolated-test.cloudflareaccess.com")]
    public async Task InvalidTeamConfigurationCannotCauseArbitraryJwksFetch(string domain)
    {
        await using var factory=new AccessFactory();factory.Extra["CloudflareAccess:TeamDomain"]=domain;
        using var client=factory.Client(factory.Token());Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/")).StatusCode);Assert.Equal(0,factory.Transport.Calls);
    }
    [Fact]
    public async Task PublicKeysAreCachedForConcurrentRequestsAndMissRefreshIsBounded()
    {
        await using var factory=new AccessFactory();using var client=factory.Client(factory.Token());
        var successes=await Task.WhenAll(Enumerable.Range(0,12).Select(_=>client.GetAsync("/api/health")));
        Assert.All(successes,response=>Assert.Equal(HttpStatusCode.OK,response.StatusCode));Assert.Equal(1,factory.Transport.Calls);
        using var unknown=factory.Client(factory.Token(fault:"unknown-kid"));
        var failures=await Task.WhenAll(Enumerable.Range(0,12).Select(_=>unknown.GetAsync("/api/health")));
        Assert.All(failures,response=>Assert.Equal(HttpStatusCode.Unauthorized,response.StatusCode));Assert.Equal(2,factory.Transport.Calls);
    }
    [Theory]
    [InlineData("malformed")] [InlineData("oversized")] [InlineData("empty")]
    public async Task InvalidJwksIsNeverAccepted(string kind)
    {
        await using var factory=new AccessFactory();using var client=factory.Client(factory.Token());
        factory.Transport.Json=kind=="oversized"?new string('x',70000):kind=="empty"?"{\"keys\":[]}":"not-json";
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/health")).StatusCode);
    }
    [Fact]
    public async Task FrontendRootCannotExposeServerJsonEvenToAllowedSiteMember()
    {
        await using var factory=new AccessFactory();factory.Extra["PrivateSite:FrontendRootPath"]=AppContext.BaseDirectory;
        using var client=factory.Client(factory.Token());Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync("/appsettings.json")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync("/appsettings.Access.Local.json")).StatusCode);
    }
    [Theory]
    [InlineData("*@example.invalid")] [InlineData("ONE@example.invalid")] [InlineData("")]
    public async Task BroadDuplicateOrEmptyAllowlistSafelyFails(string secondEmail)
    {
        await using var factory=new AccessFactory();factory.Extra["CloudflareAccess:AllowedEmails:1"]=secondEmail;
        using var client=factory.Client(factory.Token());Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/health")).StatusCode);Assert.Equal(0,factory.Transport.Calls);
    }
    [Fact]
    public async Task DuplicateJwtHeadersAreRejectedInsteadOfChoosingOne()
    {
        await using var factory=new AccessFactory();using var client=factory.Client();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Cf-Access-Jwt-Assertion",new[]{factory.Token(),factory.Token("two@example.invalid")});
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/")).StatusCode);Assert.Equal(0,factory.Transport.Calls);
    }
    [Fact]
    public async Task DevelopmentRequiresExplicitOptInAndForwardedIpIsNotIdentity()
    {
        await using var dev=new AccessFactory(configured:false,development:true);dev.Extra["CloudflareAccess:AllowDevelopmentLoopback"]="false";
        using var local=dev.Client();Assert.Equal(HttpStatusCode.Unauthorized,(await local.GetAsync("/")).StatusCode);
        await using var production=new AccessFactory();using var remote=production.Client();remote.DefaultRequestHeaders.Add("X-Forwarded-For","127.0.0.1");
        Assert.Equal(HttpStatusCode.Unauthorized,(await remote.GetAsync("/")).StatusCode);
    }
}
