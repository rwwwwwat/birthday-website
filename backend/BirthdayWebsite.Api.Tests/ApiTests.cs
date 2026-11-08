using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace BirthdayWebsite.Api.Tests;

public sealed class ApiTests
{
    public static TheoryData<string> InvalidRequests => new()
    {
        "{}", "null", "{", "{\"content\":null}", "{\"content\":123}", "{\"content\":\"\"}",
        "{\"content\":\" \\t\\r\\n\\u3000\"}",
        JsonSerializer.Serialize(new { content = new string('a', 2001) }),
        JsonSerializer.Serialize(new { content = string.Concat(Enumerable.Repeat("🎂", 1001)) }),
        "{\"content\":\"valid\",\"source\":\"attacker\"}",
        "{\"content\":\"valid\",\"isRead\":true}",
        "{\"content\":\"valid\",\"createdAt\":\"2020-01-01\"}",
    };

    [Theory]
    [MemberData(nameof(InvalidRequests))]
    public async Task InvalidBodyNeverReachesPersistence(string body)
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        using var response = await client.PostAsync("/api/wishes", new StringContent(body, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(json.TryGetProperty("errors", out _));
        Assert.True(json.TryGetProperty("traceId", out _));
        Assert.Equal(0, factory.Wishes.Calls);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SuccessfulContractUsesSavedMetadataFromFakeOnly(bool emojiBoundary)
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var text = emojiBoundary ? string.Concat(Enumerable.Repeat("🎂", 1000)) : "  保留愿望原文  ";
        using var response = await client.PostAsJsonAsync("/api/wishes", new { content = text });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(42, json.GetProperty("wishId").GetInt64());
        Assert.False(json.GetProperty("isRead").GetBoolean());
        Assert.Equal("王若溪大王生日网站", json.GetProperty("source").GetString());
        Assert.Equal(TimeSpan.Zero, json.GetProperty("createdAt").GetDateTimeOffset().Offset);
        Assert.False(json.TryGetProperty("content", out _));
        Assert.Equal(text, factory.Wishes.LastContent);
    }

    [Fact]
    public async Task PersistenceFailureIs503WithoutDatabaseDetails()
    {
        await using var factory = new ApiFactory(saveFails: true);
        using var client = factory.CreateClient();
        using var response = await client.PostAsJsonAsync("/api/wishes", new { content = "fake-only" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("SQLEXPRESS", body);
        Assert.DoesNotContain("INSERT", body);
        Assert.DoesNotContain("ConnectionString", body);
    }

    [Theory]
    [InlineData(true, HttpStatusCode.OK, "healthy")]
    [InlineData(false, HttpStatusCode.ServiceUnavailable, "unavailable")]
    public async Task HealthReflectsProbeResult(bool healthy, HttpStatusCode expected, string database)
    {
        await using var factory = new ApiFactory(databaseHealthy: healthy);
        using var client = factory.CreateClient();
        using var response = await client.GetAsync("/api/health");
        Assert.Equal(expected, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(database, json.GetProperty("database").GetString());
        Assert.Equal(0, factory.Wishes.Calls);
    }

    [Fact]
    public async Task SixthSubmissionIsRateLimitedEvenWhenBodiesAreInvalid()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        for (var i = 0; i < 5; i++)
        {
            using var invalid = await client.PostAsJsonAsync("/api/wishes", new { content = "" });
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        }
        using var response = await client.PostAsJsonAsync("/api/wishes", new { content = "" });
        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.True(response.Headers.Contains("Retry-After"));
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(0, factory.Wishes.Calls);
    }

    [Fact]
    public async Task OversizedBodyIs413AndNeverCallsPersistence()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        using var response = await client.PostAsJsonAsync("/api/wishes", new { content = new string('x', 17000) });
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(0, factory.Wishes.Calls);
    }

    [Theory]
    [InlineData("http://localhost:5173", true)]
    [InlineData("http://localhost:4173", true)]
    [InlineData("https://untrusted.example", false)]
    public async Task CorsAllowsOnlyConfiguredDevelopmentOrigins(string origin, bool allowed)
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/wishes");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type");
        using var response = await client.SendAsync(request);
        Assert.Equal(allowed, response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Theory]
    [InlineData("/api/admin/wishes", HttpStatusCode.Unauthorized)]
    [InlineData("/api/admin/wishes/unread-count", HttpStatusCode.Unauthorized)]
    [InlineData("/api/wishes", HttpStatusCode.MethodNotAllowed)]
    [InlineData("/api/wishes/1", HttpStatusCode.NotFound)]
    public async Task NoPublicWishReadEndpoint(string path, HttpStatusCode expected)
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        using var response = await client.GetAsync(path);
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(0, factory.Wishes.Calls);
    }
}
