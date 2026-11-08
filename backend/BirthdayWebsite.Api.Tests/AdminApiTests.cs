using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BirthdayWebsite.Api.Models;
using BirthdayWebsite.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using BirthdayWebsite.Api.Security;

namespace BirthdayWebsite.Api.Tests;

public sealed class AdminFactory(bool configured = true, bool unavailable = false, bool production = false) : WebApplicationFactory<Program>
{
    public const string Password = "ISOLATED-TEST-ONLY-PASSWORD!";
    public MutableClock Clock { get; } = new();
    public FakeAdminWishes Wishes { get; } = new(unavailable);
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(production ? "Production" : "Development");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Database:Enabled"] = "false", ["Admin:Username"] = configured ? "test-admin" : "",
            ["Admin:PasswordHash"] = configured ? new PasswordHasher<string>(Options.Create(new PasswordHasherOptions { IterationCount = 1000 })).HashPassword("test-admin", Password) : "",
        }));
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<ISiteAccessVerifier>(); services.AddSingleton<ISiteAccessVerifier, IsolatedSiteAccess>();
            services.RemoveAll<TimeProvider>(); services.AddSingleton<TimeProvider>(Clock);
            services.RemoveAll<IAdminWishService>(); services.AddSingleton<IAdminWishService>(Wishes);
            services.RemoveAll<IWishService>(); services.AddSingleton<IWishService>(new RecordingWishService(false));
            services.RemoveAll<IDatabaseHealthProbe>(); services.AddSingleton<IDatabaseHealthProbe>(new FakeHealthProbe(true));
            services.AddDataProtection().UseEphemeralDataProtectionProvider();
        });
    }
    public HttpClient Client() => CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, BaseAddress = new Uri(production ? "https://localhost" : "http://localhost") });
    public static async Task<string> Token(HttpClient client) => (await client.GetFromJsonAsync<JsonElement>("/api/admin/csrf")).GetProperty("token").GetString()!;
    public static async Task<HttpResponseMessage> Send(HttpClient client, string path, HttpMethod method, object? body = null, string? token = null)
    {
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Add("X-CSRF-TOKEN", token ?? await Token(client));
        if (body is not null) request.Content = JsonContent.Create(body);
        return await client.SendAsync(request);
    }
    public static Task<HttpResponseMessage> Login(HttpClient client, string password = Password) =>
        Send(client, "/api/admin/login", HttpMethod.Post, new { username = "test-admin", password });
}

public sealed class MutableClock : TimeProvider
{
    private DateTimeOffset now = DateTimeOffset.UtcNow;
    public override DateTimeOffset GetUtcNow() => now;
    public void Advance(TimeSpan span) => now += span;
}

public sealed class FakeAdminWishes(bool unavailable) : IAdminWishService
{
    // All mutations affect only this in-memory fixture. No real WishId=1 is involved.
    public List<AdminWishDetail> Rows { get; } = Enumerable.Range(41, 25).Select(id => new AdminWishDetail(id,
        "<script>not executed</script> 测试心愿 " + id + new string('文', 110),
        new DateTimeOffset(2026, 11, 1, 0, 0, id % 60, TimeSpan.Zero), id % 2 == 0, "隔离测试")).ToList();
    public int Writes { get; private set; }
    public int Reads { get; private set; }
    private void Check() { ++Reads; if (unavailable) throw new DatabaseUnavailableException(); }
    public Task<AdminWishPage> ListAsync(int page, int pageSize, bool? isRead, CancellationToken token)
    {
        Check(); var rows = Rows.Where(row => isRead is null || row.IsRead == isRead).OrderByDescending(row => row.CreatedAt).ThenByDescending(row => row.WishId).ToList();
        var items = rows.Skip((page - 1) * pageSize).Take(pageSize).Select(row => new AdminWishSummary(row.WishId, row.CreatedAt, row.IsRead, row.Source, row.Content[..Math.Min(row.Content.Length, 100)])).ToList();
        return Task.FromResult(new AdminWishPage(items, rows.Count, page, pageSize, (rows.Count + pageSize - 1) / pageSize));
    }
    public Task<AdminWishDetail?> DetailAsync(long id, CancellationToken token)
    { Check(); return Task.FromResult(Rows.Find(row => row.WishId == id)); }
    public Task<AdminWishStats> StatsAsync(CancellationToken token)
    { Check(); return Task.FromResult(new AdminWishStats(Rows.Count, Rows.Count(row => !row.IsRead), Rows.Count(row => row.IsRead), Rows.Max(row => row.CreatedAt), Rows.Max(row => row.WishId))); }
    public Task<AdminWishDetail?> MarkReadAsync(long id, CancellationToken token)
    {
        Check(); ++Writes; var index = Rows.FindIndex(row => row.WishId == id);
        if (index < 0) return Task.FromResult<AdminWishDetail?>(null);
        Rows[index] = Rows[index] with { IsRead = true }; return Task.FromResult<AdminWishDetail?>(Rows[index]);
    }
}

public sealed class AdminApiTests
{
    [Theory]
    [InlineData("/api/admin/me", "GET")]
    [InlineData("/api/admin/logout", "POST")]
    [InlineData("/api/admin/wishes", "GET")]
    [InlineData("/api/admin/wishes/stats", "GET")]
    [InlineData("/api/admin/wishes/unread-count", "GET")]
    [InlineData("/api/admin/wishes/41", "GET")]
    [InlineData("/api/admin/wishes/41/read", "PATCH")]
    public async Task AnonymousCannotReadOrMutate(string path, string method)
    {
        await using var factory = new AdminFactory(); using var client = factory.Client();
        using var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode); Assert.Equal(0, factory.Wishes.Reads); Assert.Equal(0, factory.Wishes.Writes);
    }
    [Fact]
    public async Task LoginMeCookieAndImmediateLogoutRevocation()
    {
        await using var factory = new AdminFactory(); using var client = factory.Client();
        using var login = await AdminFactory.Login(client); Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = login.Headers.GetValues("Set-Cookie").Last(value => value.StartsWith("Birthday.Admin=") && !value.StartsWith("Birthday.Admin=;"));
        Assert.Contains("httponly", cookie.ToLowerInvariant()); Assert.Contains("samesite=lax", cookie.ToLowerInvariant()); Assert.Contains("path=/api/admin", cookie);
        Assert.Equal("test-admin", (await client.GetFromJsonAsync<JsonElement>("/api/admin/me")).GetProperty("username").GetString());
        using var logout = await AdminFactory.Send(client, "/api/admin/logout", HttpMethod.Post); Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/me")).StatusCode);
        using var replay = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        replay.DefaultRequestHeaders.Add("Cookie", cookie.Split(';')[0]);
        Assert.Equal(HttpStatusCode.Unauthorized, (await replay.GetAsync("/api/admin/me")).StatusCode);
    }
    [Theory]
    [InlineData(true)] [InlineData(false)]
    public async Task WrongOrMissingCredentialsNeverLogin(bool configured)
    {
        await using var factory = new AdminFactory(configured); using var client = factory.Client();
        using var response = await AdminFactory.Login(client, configured ? "wrong" : AdminFactory.Password);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode); Assert.DoesNotContain("PasswordHash", await response.Content.ReadAsStringAsync());
    }
    [Fact]
    public async Task AbsoluteSessionExpiresAfterEightHours()
    {
        await using var factory = new AdminFactory(); using var client = factory.Client();
        Assert.Equal(HttpStatusCode.OK, (await AdminFactory.Login(client)).StatusCode);
        factory.Clock.Advance(TimeSpan.FromHours(8).Add(TimeSpan.FromSeconds(1)));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/me")).StatusCode);
    }
    [Fact]
    public async Task LoginLogoutAndPatchRequireCsrf()
    {
        await using var factory = new AdminFactory(); using var client = factory.Client();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/admin/login", new { username = "test-admin", password = AdminFactory.Password })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AdminFactory.Login(client)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/admin/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsync("/api/admin/wishes/41/read", null)).StatusCode);
        using var forged = await AdminFactory.Send(client, "/api/admin/wishes/41/read", HttpMethod.Patch, token: "forged");
        Assert.Equal(HttpStatusCode.BadRequest, forged.StatusCode); Assert.Equal(0, factory.Wishes.Writes);
    }
    [Fact]
    public async Task PaginationFilteringDetailAndReadAreFakeOnly()
    {
        await using var factory = new AdminFactory(); using var client = factory.Client(); await AdminFactory.Login(client);
        var all = await client.GetFromJsonAsync<AdminWishPage>("/api/admin/wishes?page=2&pageSize=10");
        Assert.NotNull(all); Assert.Equal(25, all.TotalCount); Assert.Equal(2, all.CurrentPage); Assert.Equal(3, all.TotalPages); Assert.Equal(10, all.Items.Count);
        Assert.True(all.Items.Zip(all.Items.Skip(1)).All(pair => pair.First.CreatedAt >= pair.Second.CreatedAt));
        Assert.All(all.Items, wish => Assert.True(wish.ContentPreview.Length <= 100));
        var unread = await client.GetFromJsonAsync<AdminWishPage>("/api/admin/wishes?unreadOnly=true"); Assert.All(unread!.Items, wish => Assert.False(wish.IsRead));
        var read = await client.GetFromJsonAsync<AdminWishPage>("/api/admin/wishes?isRead=true"); Assert.All(read!.Items, wish => Assert.True(wish.IsRead));
        var count = await client.GetFromJsonAsync<JsonElement>("/api/admin/wishes/unread-count"); Assert.Equal(unread.TotalCount, count.GetProperty("unreadCount").GetInt64());
        var detail = await client.GetFromJsonAsync<AdminWishDetail>("/api/admin/wishes/41"); Assert.Contains("<script>", detail!.Content);
        foreach (var unused in new[] { 1, 2 })
        {
            using var marked = await AdminFactory.Send(client, "/api/admin/wishes/41/read", HttpMethod.Patch);
            Assert.Equal(HttpStatusCode.OK, marked.StatusCode); Assert.True((await marked.Content.ReadFromJsonAsync<AdminWishDetail>())!.IsRead);
        }
        Assert.Equal(12, (await client.GetFromJsonAsync<JsonElement>("/api/admin/wishes/unread-count")).GetProperty("unreadCount").GetInt64());
        Assert.Equal(2, factory.Wishes.Writes); Assert.False(factory.Wishes.Rows.Single(row => row.WishId == 43).IsRead);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/admin/wishes/9999")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await AdminFactory.Send(client, "/api/admin/wishes/9999/read", HttpMethod.Patch)).StatusCode);
    }
    [Theory]
    [InlineData("?page=0")] [InlineData("?pageSize=101")] [InlineData("?pageSize=0")] [InlineData("?page=abc")] [InlineData("?unreadOnly=true&isRead=true")]
    public async Task InvalidPaginationNeverReachesService(string query)
    {
        await using var factory = new AdminFactory(); using var client = factory.Client(); await AdminFactory.Login(client);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/admin/wishes" + query)).StatusCode); Assert.Equal(0, factory.Wishes.Reads);
    }
    [Fact]
    public async Task LoginIsRateLimitedAndAdminCorsIsNotPublic()
    {
        await using var factory = new AdminFactory(); using var client = factory.Client();
        for (var i = 0; i < 5; ++i) Assert.Equal(HttpStatusCode.Unauthorized, (await AdminFactory.Login(client, "wrong")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await AdminFactory.Login(client)).StatusCode);
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/admin/login"); request.Headers.Add("Origin", "http://localhost:5173"); request.Headers.Add("Access-Control-Request-Method", "POST");
        Assert.False((await client.SendAsync(request)).Headers.Contains("Access-Control-Allow-Origin"));
    }
    [Fact]
    public async Task ServiceFailureDoesNotLeakSqlDetails()
    {
        await using var factory = new AdminFactory(unavailable: true); using var client = factory.Client(); await AdminFactory.Login(client);
        using var response = await client.GetAsync("/api/admin/wishes"); Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.DoesNotContain("SQLEXPRESS", await response.Content.ReadAsStringAsync()); Assert.True(response.Headers.CacheControl?.NoStore);
    }
    [Fact]
    public async Task ProductionCookiesAreSecureAndPlainHttpIsRejected()
    {
        await using var factory = new AdminFactory(production: true); using var client = factory.Client();
        using var login = await AdminFactory.Login(client); Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = login.Headers.GetValues("Set-Cookie").Last(value => value.StartsWith("__Secure-Birthday.Admin=") && !value.StartsWith("__Secure-Birthday.Admin=;"));
        Assert.Contains("secure", cookie.ToLowerInvariant()); Assert.Contains("httponly", cookie.ToLowerInvariant());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("http://localhost/api/admin/csrf")).StatusCode);
    }
    [Fact]
    public async Task IncorrectUsernameAndPreLoginCsrfTokenCannotModifyState()
    {
        await using var factory = new AdminFactory(); using var client = factory.Client(); var oldToken = await AdminFactory.Token(client);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AdminFactory.Send(client, "/api/admin/login", HttpMethod.Post,
            new { username = "other", password = AdminFactory.Password }, oldToken)).StatusCode);
        await AdminFactory.Login(client);
        Assert.Equal(HttpStatusCode.BadRequest, (await AdminFactory.Send(client, "/api/admin/wishes/41/read", HttpMethod.Patch, token: oldToken)).StatusCode);
        Assert.Equal(0, factory.Wishes.Writes);
    }
    [Fact]
    public async Task PublicAdminShellContainsNoWishDataOrServerConfiguration()
    {
        await using var factory = new AdminFactory(); using var client = factory.Client();
        using var page = await client.GetAsync("/admin/"); Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        var html = await page.Content.ReadAsStringAsync(); Assert.Contains("心愿收藏室", html);
        Assert.DoesNotContain(AdminFactory.Password, html); Assert.DoesNotContain("SQLEXPRESS", html);
        Assert.DoesNotContain("not executed", html); Assert.Contains("frame-ancestors 'none'", page.Headers.GetValues("Content-Security-Policy").Single());
        Assert.True(page.Headers.CacheControl?.NoStore);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/admin/appsettings.Admin.Local.json")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/appsettings.Local.json")).StatusCode);
        Assert.Equal(0, factory.Wishes.Reads);
    }
}
