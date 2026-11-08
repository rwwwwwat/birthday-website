using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using BirthdayWebsite.Api.Media;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BirthdayWebsite.Api.Tests;

public sealed class MediaFactory(string remote = "127.0.0.1", string local = "127.0.0.1", bool development = true,
    bool enabled = true, bool failOnRead = false) : WebApplicationFactory<Program>
{
    public int UnexpectedReads;
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(development ? "Development" : "Production");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Database:Enabled"] = "false", ["Admin:Username"] = "", ["Admin:PasswordHash"] = "",
            ["Media:AllowDevelopmentLoopback"] = enabled.ToString(),
        }));
        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<IStartupFilter>(new ConnectionFilter(remote, local));
            if (failOnRead) { services.RemoveAll<IPrivateMediaStore>(); services.AddSingleton<IPrivateMediaStore>(new NoRead(this)); }
        });
    }
    private sealed class NoRead(MediaFactory owner) : IPrivateMediaStore
    { public Task<PrivateMediaRead?> OpenAsync(MediaKind kind, string id, CancellationToken token) { ++owner.UnexpectedReads; throw new InvalidOperationException("Denied requests must not open files."); } }
    private sealed class ConnectionFilter(string remote, string local) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (context, continuation) =>
            { context.Connection.RemoteIpAddress = IPAddress.Parse(remote); context.Connection.LocalIpAddress = IPAddress.Parse(local); await continuation(); }); next(app);
        };
    }
}

public sealed class MediaTests
{
    private static string OriginalPath(MediaFactory factory, string id, string kind)
    {
        var root = factory.Services.GetRequiredService<IWebHostEnvironment>().ContentRootPath;
        var entry = MediaCatalog.Tracks[id];
        return Path.GetFullPath(Path.Combine(root, "..", "..", "audio", kind == "audio" ? entry.AudioFile : entry.CoverFile));
    }
    [Theory]
    [InlineData("cry-for-me", "audio")] [InlineData("aitaiwa", "audio")]
    [InlineData("danger", "audio")] [InlineData("kataomoi", "audio")]
    [InlineData("cry-for-me", "covers")] [InlineData("aitaiwa", "covers")]
    [InlineData("danger", "covers")] [InlineData("kataomoi", "covers")]
    public async Task GetAndHeadReturnExactOriginalWithoutPublicCaching(string id, string kind)
    {
        await using var factory = new MediaFactory(); using var client = factory.CreateClient();
        var path = OriginalPath(factory, id, kind); var bytes = new FileInfo(path).Length;
        using var response = await client.GetAsync($"/media/{kind}/{id}"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(kind == "audio" ? "audio/mpeg" : "image/jpeg", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(bytes, response.Content.Headers.ContentLength); Assert.True(response.Headers.CacheControl?.NoStore); Assert.True(response.Headers.CacheControl?.Private);
        Assert.Contains("bytes", response.Headers.AcceptRanges);
        await using var original = File.OpenRead(path); await using var received = await response.Content.ReadAsStreamAsync();
        Assert.Equal(await SHA256.HashDataAsync(original), await SHA256.HashDataAsync(received));
        using var head = await client.SendAsync(new HttpRequestMessage(HttpMethod.Head, $"/media/{kind}/{id}"));
        Assert.Equal(HttpStatusCode.OK, head.StatusCode); Assert.Equal(bytes, head.Content.Headers.ContentLength); Assert.Empty(await head.Content.ReadAsByteArrayAsync());
    }
    [Theory]
    [InlineData("bytes=0-1", 0, 2)] [InlineData("bytes=100-199", 100, 100)] [InlineData("bytes=-8", -8, 8)]
    public async Task RangeReturnsExactBytesAnd206(string range, int offset, int count)
    {
        await using var factory = new MediaFactory(); using var client = factory.CreateClient(); var path = OriginalPath(factory, "cry-for-me", "audio");
        using var request = new HttpRequestMessage(HttpMethod.Get, "/media/audio/cry-for-me"); request.Headers.Range = RangeHeaderValue.Parse(range);
        using var response = await client.SendAsync(request); Assert.Equal(HttpStatusCode.PartialContent, response.StatusCode);
        var length = new FileInfo(path).Length; var start = offset < 0 ? length + offset : offset;
        Assert.Equal(start, response.Content.Headers.ContentRange?.From); Assert.Equal(start + count - 1, response.Content.Headers.ContentRange?.To);
        Assert.Equal(length, response.Content.Headers.ContentRange?.Length); Assert.Equal(count, response.Content.Headers.ContentLength);
        await using var source = File.OpenRead(path); source.Position = start; var expected = new byte[count]; await source.ReadExactlyAsync(expected);
        Assert.Equal(expected, await response.Content.ReadAsByteArrayAsync()); Assert.True(response.Headers.CacheControl?.NoStore);
    }
    [Fact]
    public async Task UnsatisfiableRangeIs416WithSizeAndNoBytes()
    {
        await using var factory = new MediaFactory(); using var client = factory.CreateClient(); var size = new FileInfo(OriginalPath(factory,"danger","audio")).Length;
        using var request = new HttpRequestMessage(HttpMethod.Get,"/media/audio/danger"); request.Headers.Range = new RangeHeaderValue(size,null);
        using var response = await client.SendAsync(request); Assert.Equal(HttpStatusCode.RequestedRangeNotSatisfiable,response.StatusCode);
        Assert.Equal(size,response.Content.Headers.ContentRange?.Length); Assert.Empty(await response.Content.ReadAsByteArrayAsync()); Assert.True(response.Headers.CacheControl?.NoStore);
    }
    [Theory]
    [InlineData("203.0.113.5", "127.0.0.1", true, true)]
    [InlineData("127.0.0.1", "0.0.0.0", true, true)]
    [InlineData("127.0.0.1", "127.0.0.1", false, true)]
    [InlineData("127.0.0.1", "127.0.0.1", true, false)]
    public async Task RemoteProductionAndDisabledRequestsAreRejectedBeforeStorage(string remote,string local,bool development,bool enabled)
    {
        await using var factory = new MediaFactory(remote,local,development,enabled,failOnRead:true); using var client=factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get,"/media/audio/cry-for-me"); request.Headers.Range=new RangeHeaderValue(0,1);
        using var response=await client.SendAsync(request); Assert.Equal(HttpStatusCode.Unauthorized,response.StatusCode);
        Assert.Null(response.Content.Headers.ContentRange); Assert.True(response.Headers.CacheControl?.NoStore); Assert.Equal(0,factory.UnexpectedReads);
    }
    [Theory]
    [InlineData("X-Forwarded-For", "127.0.0.1")] [InlineData("X-Forwarded-Proto", "https")]
    [InlineData("Forwarded", "for=127.0.0.1")] [InlineData("CF-Connecting-IP", "127.0.0.1")]
    [InlineData("Cf-Access-Jwt-Assertion", "not-a-validated-token")]
    [InlineData("Origin", "https://evil.example")] [InlineData("Sec-Fetch-Site", "cross-site")]
    public async Task LoopbackTestingDoesNotTrustForwardedHeadersOrForeignSites(string header,string value)
    {
        await using var factory=new MediaFactory(failOnRead:true); using var client=factory.CreateClient();
        using var request=new HttpRequestMessage(HttpMethod.Get,"/media/covers/cry-for-me");request.Headers.Add(header,value);
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.SendAsync(request)).StatusCode);Assert.Equal(0,factory.UnexpectedReads);
    }
    [Fact]
    public async Task HostSpoofAndHeadAreDeniedAndRawFilesStayOutsideStaticRoot()
    {
        await using var factory=new MediaFactory(failOnRead:true);using var client=factory.CreateClient();
        using var request=new HttpRequestMessage(HttpMethod.Head,"/media/audio/danger");request.Headers.Host="example.invalid";
        var response=await client.SendAsync(request);Assert.Contains(response.StatusCode,new[]{HttpStatusCode.BadRequest,HttpStatusCode.Unauthorized});Assert.Equal(0,factory.UnexpectedReads);
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync("/audio/test.mp3")).StatusCode);
    }
    [Theory]
    [InlineData("unknown")] [InlineData("appsettings.Local.json")] [InlineData("Cry%20For%20Me.mp3")]
    public async Task OnlyCatalogIdsAreAccepted(string id)
    {
        await using var factory=new MediaFactory();using var client=factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync("/media/audio/"+id)).StatusCode);
    }
    [Fact]
    public async Task Ipv6LoopbackSupportsBrowserStyleRangeWithLocalOrigin()
    {
        await using var factory=new MediaFactory("::1","::1");using var client=factory.CreateClient();
        using var request=new HttpRequestMessage(HttpMethod.Get,"/media/audio/danger");request.Headers.Add("Origin","http://localhost:5173");request.Headers.Add("Sec-Fetch-Site","same-origin");request.Headers.Range=new RangeHeaderValue(0,1);
        Assert.Equal(HttpStatusCode.PartialContent,(await client.SendAsync(request)).StatusCode);
    }
}
