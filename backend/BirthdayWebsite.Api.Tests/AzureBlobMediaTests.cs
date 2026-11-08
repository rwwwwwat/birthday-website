using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Azure;
using Azure.Core;
using Azure.Core.Pipeline;
using Azure.Storage.Blobs;
using BirthdayWebsite.Api.Media;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BirthdayWebsite.Api.Tests;

// Real Azure SDK + real JWT validator; only the Azure HTTP transport/credential/JWKS/DB are test doubles.
public sealed class MockBlobTransport : HttpMessageHandler
{
    public byte[] Bytes { get; } = Enumerable.Range(0, 1024).Select(i => (byte)(i % 251)).ToArray();
    public string Failure { get; set; } = "";
    public int Heads, Downloads;
    public long? Offset, Count;
    public string? BlobPath, IfMatch;
    public bool AnonymousRejected;
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.Headers.Authorization?.Scheme != "Bearer")
        { AnonymousRejected = true; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Forbidden)); }
        Assert.Empty(request.RequestUri!.Query); Assert.Equal("https", request.RequestUri.Scheme);
        BlobPath = request.RequestUri.AbsolutePath;
        var head = request.Method == HttpMethod.Head;
        if (head) Heads++; else Downloads++;
        var status = Failure switch { "missing" => 404, "denied" => 403, "error" => 500, "changed" when !head => 412, _ => 200 };
        var response = new HttpResponseMessage((HttpStatusCode)status);
        if (status != 200)
        {
            response.ReasonPhrase = status == 404 ? "Not Found" : "Storage Failure";
            response.Headers.Add("x-ms-error-code", status == 404 ? "BlobNotFound" : "StorageFailure");
            response.Content = new StringContent("<Error><Code>" + (status == 404 ? "BlobNotFound" : "StorageFailure") + "</Code></Error>");
            return Task.FromResult(response);
        }
        long offset = 0, count = Bytes.Length;
        if (!head)
        {
            var header = request.Headers.TryGetValues("x-ms-range", out var values) ? values.Single() : request.Headers.Range?.ToString();
            var range = RangeHeaderValue.Parse(header!); var item = range.Ranges.Single();
            offset = item.From!.Value; count = item.To!.Value - offset + 1;
            Offset = offset; Count = count; IfMatch = request.Headers.IfMatch.Single().Tag;
            Assert.InRange(offset, 0, Bytes.Length - 1); Assert.InRange(count, 1, Bytes.Length - offset);
            response.StatusCode = HttpStatusCode.PartialContent;
        }
        response.Content = new ByteArrayContent(head ? [] : Bytes.Skip((int)offset).Take((int)count).ToArray());
        response.Content.Headers.ContentLength = head ? Bytes.Length : count;
        response.Content.Headers.ContentType = new("audio/mpeg");
        if (!head) response.Content.Headers.ContentRange = new(offset, offset + count - 1, Bytes.Length);
        response.Headers.ETag = new("\"version-one\"");
        response.Content.Headers.LastModified = DateTimeOffset.Parse("2026-10-31T00:00:00Z");
        response.Headers.Add("x-ms-blob-type", "BlockBlob");
        return Task.FromResult(response);
    }
}

public sealed class TestBlobCredential : TokenCredential
{
    public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken)
    { Assert.Contains("https://storage.azure.com/.default", requestContext.Scopes); return new("isolated-test-credential", DateTimeOffset.UtcNow.AddHours(1)); }
    public override ValueTask<AccessToken> GetTokenAsync(TokenRequestContext requestContext, CancellationToken cancellationToken) => ValueTask.FromResult(GetToken(requestContext, cancellationToken));
}

public sealed class AzureBlobMediaTests
{
    private static AccessFactory Factory(MockBlobTransport transport)
    {
        var factory = new AccessFactory { UseConfiguredMediaStorage = true };
        factory.Extra["MediaStorage:Provider"] = "AzureBlob";
        factory.Extra["AzureBlob:ServiceUri"] = "https://isolatedmedia.blob.core.windows.net";
        factory.Extra["AzureBlob:ContainerName"] = "birthday-private-media";
        var options = new BlobClientOptions { Transport = new HttpClientTransport(new HttpClient(transport)) };
        options.Retry.MaxRetries = 0;
        var container = new BlobContainerClient(new Uri("https://isolatedmedia.blob.core.windows.net/birthday-private-media"), new TestBlobCredential(), options);
        factory.ConfigureMediaServices = services => { services.RemoveAll<AzureBlobMediaStorage>(); services.AddSingleton(new AzureBlobMediaStorage(container)); };
        return factory;
    }

    [Theory]
    [InlineData("audio", "cry-for-me")] [InlineData("audio", "aitaiwa")] [InlineData("audio", "danger")] [InlineData("audio", "kataomoi")]
    [InlineData("covers", "cry-for-me")] [InlineData("covers", "aitaiwa")] [InlineData("covers", "danger")] [InlineData("covers", "kataomoi")]
    public async Task AllEightMappingsStreamExactBytesAndHeadDoesNotDownload(string kind, string id)
    {
        var transport = new MockBlobTransport(); await using var factory = Factory(transport); using var client = factory.Client(factory.Token());
        var route = $"/media/{kind}/{id}";
        using var head = await client.SendAsync(new HttpRequestMessage(HttpMethod.Head, route));
        Assert.Equal(HttpStatusCode.OK, head.StatusCode); Assert.Equal(1024, head.Content.Headers.ContentLength); Assert.Empty(await head.Content.ReadAsByteArrayAsync()); Assert.Equal(0, transport.Downloads);
        using var response = await client.GetAsync(route); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(SHA256.HashData(transport.Bytes), SHA256.HashData(await response.Content.ReadAsByteArrayAsync()));
        Assert.Equal(kind == "audio" ? "audio/mpeg" : "image/jpeg", response.Content.Headers.ContentType?.MediaType);
        Assert.True(response.Headers.CacheControl?.Private); Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal($"/birthday-private-media/{kind}/{id}." + (kind == "audio" ? "mp3" : "jpg"), transport.BlobPath);
        Assert.Equal(0, transport.Offset); Assert.Equal(1024, transport.Count); Assert.Equal("\"version-one\"", transport.IfMatch);
        Assert.DoesNotContain("blob.core.windows.net", await response.Content.ReadAsStringAsync()); Assert.Equal(1, transport.Downloads);
    }
    [Theory]
    [InlineData("bytes=0-1", 0, 2)] [InlineData("bytes=512-", 512, 512)] [InlineData("bytes=-8", 1016, 8)]
    [InlineData("bytes=1000-9999", 1000, 24)] [InlineData("bytes=-9999", 0, 1024)]
    public async Task OnlyRequestedRangeIsDownloaded(string range, long offset, long count)
    {
        var transport = new MockBlobTransport(); await using var factory = Factory(transport); using var client = factory.Client(factory.Token());
        using var request = new HttpRequestMessage(HttpMethod.Get, "/media/audio/danger"); request.Headers.TryAddWithoutValidation("Range", range);
        using var response = await client.SendAsync(request); Assert.Equal(HttpStatusCode.PartialContent, response.StatusCode);
        Assert.Equal(offset, transport.Offset); Assert.Equal(count, transport.Count); Assert.Equal(1, transport.Downloads);
        Assert.Equal(offset, response.Content.Headers.ContentRange?.From); Assert.Equal(offset + count - 1, response.Content.Headers.ContentRange?.To); Assert.Equal(1024, response.Content.Headers.ContentRange?.Length);
        Assert.Equal(count, response.Content.Headers.ContentLength); Assert.Equal(transport.Bytes.Skip((int)offset).Take((int)count), await response.Content.ReadAsByteArrayAsync());
    }
    [Theory]
    [InlineData("garbage")] [InlineData("bytes=9-3")] [InlineData("bytes=-0")] [InlineData("bytes=1024-")]
    [InlineData("bytes=0-1,4-5")] [InlineData("items=0-1")] [InlineData("bytes=999999999999999999999999-")]
    public async Task InvalidOrUnsupportedRangeIs416WithoutDownload(string range)
    {
        var transport = new MockBlobTransport(); await using var factory = Factory(transport); using var client = factory.Client(factory.Token());
        using var request = new HttpRequestMessage(HttpMethod.Get, "/media/audio/danger"); request.Headers.TryAddWithoutValidation("Range", range);
        using var response = await client.SendAsync(request); Assert.Equal(HttpStatusCode.RequestedRangeNotSatisfiable, response.StatusCode);
        Assert.Equal("bytes */1024", response.Content.Headers.ContentRange?.ToString()); Assert.Empty(await response.Content.ReadAsByteArrayAsync()); Assert.Equal(0, transport.Downloads);
    }
    [Theory]
    [InlineData("missing", 404)] [InlineData("denied", 503)] [InlineData("error", 503)] [InlineData("changed", 503)]
    public async Task BlobFailuresAreSafeAndNeverFallBackToLocal(string failure, int expected)
    {
        var transport = new MockBlobTransport { Failure = failure }; await using var factory = Factory(transport); using var client = factory.Client(factory.Token());
        using var response = await client.GetAsync("/media/audio/cry-for-me"); Assert.Equal(expected, (int)response.StatusCode);
        var body = await response.Content.ReadAsStringAsync(); Assert.DoesNotContain("StorageFailure", body); Assert.DoesNotContain("blob.core.windows.net", body); Assert.True(response.Headers.CacheControl?.NoStore);
    }
    [Theory]
    [InlineData("missing",401)] [InlineData("third",403)] [InlineData("expired",401)] [InlineData("email-header",401)]
    public async Task AccessRejectsRequestsBeforeAnyBlobOperation(string identity, int status)
    {
        var transport = new MockBlobTransport(); await using var factory = Factory(transport);
        using var client = factory.Client(identity == "third" ? factory.Token("third@example.invalid") : identity == "expired" ? factory.Token(fault:"expired") : null);
        if (identity == "email-header") client.DefaultRequestHeaders.Add("Cf-Access-Authenticated-User-Email", "one@example.invalid");
        foreach (var path in new[]{"/media/audio/danger", "/media/covers/danger"}) Assert.Equal(status, (int)(await client.GetAsync(path)).StatusCode);
        Assert.Equal(0, transport.Heads); Assert.Equal(0, transport.Downloads);
    }
    [Theory]
    [InlineData("", "")] [InlineData("Local", "")] [InlineData("AzureBlob", "")]
    [InlineData("AzureBlob", "http://isolatedmedia.blob.core.windows.net")]
    [InlineData("AzureBlob", "https://isolatedmedia.blob.core.windows.net?sig=fake")]
    [InlineData("AzureBlob", "https://evil.invalid")]
    public async Task ProductionMissingOrUnsafeConfigFailsClosedEvenWithOriginalFiles(string provider, string uri)
    {
        await using var factory = new AccessFactory { UseConfiguredMediaStorage = true };
        factory.Extra["MediaStorage:Provider"] = provider; factory.Extra["AzureBlob:ServiceUri"] = uri;
        using var client = factory.Client(factory.Token()); Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/media/audio/danger")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/audio/test.mp3")).StatusCode);
    }
    [Fact]
    public async Task UnknownIdNeverContactsStorageAndHeadIgnoresRange()
    {
        var transport = new MockBlobTransport(); await using var factory = Factory(transport); using var client = factory.Client(factory.Token());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/media/audio/unknown")).StatusCode); Assert.Equal(0, transport.Heads);
        using var request = new HttpRequestMessage(HttpMethod.Head, "/media/audio/danger"); request.Headers.Range = new(0,1);
        using var response = await client.SendAsync(request); Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.Equal(1024, response.Content.Headers.ContentLength); Assert.Equal(0, transport.Downloads);
    }
    [Fact]
    public async Task ChangedIfRangeDownloadsFullCurrentRepresentation()
    {
        var transport = new MockBlobTransport(); await using var factory = Factory(transport); using var client = factory.Client(factory.Token());
        using var request = new HttpRequestMessage(HttpMethod.Get, "/media/audio/danger"); request.Headers.Range = new(0,1); request.Headers.TryAddWithoutValidation("If-Range", "\"old-version\"");
        using var response = await client.SendAsync(request); Assert.Equal(HttpStatusCode.OK, response.StatusCode); Assert.Equal(1024, transport.Count);
    }
    [Fact]
    public async Task MissingBlobHeadStatusDoesNotRequireXmlErrorBody()
    {
        var transport = new MockBlobTransport { Failure = "missing" };
        var options = new BlobClientOptions { Transport = new HttpClientTransport(new HttpClient(transport)) }; options.Retry.MaxRetries = 0;
        var blob = new BlobClient(new Uri("https://isolatedmedia.blob.core.windows.net/birthday-private-media/audio/danger.mp3"), new TestBlobCredential(), options);
        var error = await Assert.ThrowsAsync<RequestFailedException>(async () => await blob.GetPropertiesAsync());
        Assert.Equal(404, error.Status);
        Assert.True(error.GetRawResponse()!.Headers.TryGetValue("x-ms-error-code", out var code)); Assert.Equal("BlobNotFound", code);
    }
    [Fact]
    public async Task MockPrivateContainerRejectsAnonymousDirectClient()
    {
        var transport = new MockBlobTransport(); using var direct = new HttpClient(transport);
        Assert.Equal(HttpStatusCode.Forbidden, (await direct.GetAsync("https://isolatedmedia.blob.core.windows.net/birthday-private-media/audio/danger.mp3")).StatusCode); Assert.True(transport.AnonymousRejected);
        // This proves the mock's private-container contract, NOT actual Azure account access settings.
    }
    [Fact]
    public async Task OriginalEightFilesMatchUploadManifestWithoutAnyWriteOrDownload()
    {
        // Find the project from the already-established test content root, not a machine-specific hard-coded path.
        await using var factory = new AccessFactory(); using var client = factory.Client(factory.Token());
        var contentRoot = factory.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>().ContentRootPath;
        var root = Path.GetFullPath(Path.Combine(contentRoot, "..", ".."));
        using var json = System.Text.Json.JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(root,"docs","phase-10-3-media-manifest.json")));
        Assert.Equal(8, json.RootElement.GetArrayLength());
        foreach (var item in json.RootElement.EnumerateArray())
        {
            var id = item.GetProperty("TrackId").GetString()!; var kind = item.GetProperty("Kind").GetString() == "audio" ? MediaKind.Audio : MediaKind.Cover;
            var entry = MediaCatalog.Tracks[id]; var path = Path.Combine(root, "audio", kind == MediaKind.Audio ? entry.AudioFile : entry.CoverFile);
            Assert.Equal(AzureBlobMediaStorage.BlobName(kind,id),item.GetProperty("BlobName").GetString());
            Assert.Equal(new FileInfo(path).Length,item.GetProperty("SizeBytes").GetInt64());
            await using var stream = File.OpenRead(path); Assert.Equal(Convert.ToHexString(await SHA256.HashDataAsync(stream)),item.GetProperty("SHA256").GetString());
            Assert.Equal("NOT_UPLOADED",item.GetProperty("UploadStatus").GetString()); Assert.Equal(System.Text.Json.JsonValueKind.Null,item.GetProperty("RemoteSHA256").ValueKind);
        }
    }
    [Fact]
    public async Task FrontendAndPublishableExamplesContainNoStorageSecretsOrSasUrls()
    {
        await using var factory = new AccessFactory(); using var client = factory.Client(factory.Token());
        var contentRoot = factory.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>().ContentRootPath;
        var root = Path.GetFullPath(Path.Combine(contentRoot,"..",".."));
        var files = Directory.GetFiles(Path.Combine(root,"frontend","src"),"*",SearchOption.AllDirectories)
            .Concat(Directory.GetFiles(Path.Combine(root,"frontend","dist"),"*",SearchOption.AllDirectories).Where(path=>path.EndsWith(".js")||path.EndsWith(".css")||path.EndsWith(".html")))
            .Concat(Directory.GetFiles(contentRoot,"appsettings*.example.json"));
        foreach (var file in files)
        {
            var text = await File.ReadAllTextAsync(file);
            foreach(var forbidden in new[]{"AccountKey=","SharedAccessSignature=","DefaultEndpointsProtocol=","?sv=","&sig=","BEGIN PRIVATE KEY"})
                Assert.DoesNotContain(forbidden,text,StringComparison.OrdinalIgnoreCase);
        }
        var ignored = await File.ReadAllTextAsync(Path.Combine(root,".gitignore"));
        Assert.Contains("**/appsettings.*.Local.json",ignored); Assert.Contains("/audio/",ignored);
    }
}
