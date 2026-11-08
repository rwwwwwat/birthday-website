using BirthdayWebsite.Api.Models;
using BirthdayWebsite.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using BirthdayWebsite.Api.Security;

namespace BirthdayWebsite.Api.Tests;

// Every HTTP test uses substitutes: no test invokes the real INSERT service.
public sealed class ApiFactory(bool databaseHealthy = true, bool saveFails = false) : WebApplicationFactory<Program>
{
    public RecordingWishService Wishes { get; } = new(saveFails);
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Database:Enabled"] = "false",
        }));
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<ISiteAccessVerifier>();
            services.AddSingleton<ISiteAccessVerifier, IsolatedSiteAccess>();
            services.RemoveAll<IWishService>();
            services.AddSingleton<IWishService>(Wishes);
            services.RemoveAll<IDatabaseHealthProbe>();
            services.AddSingleton<IDatabaseHealthProbe>(new FakeHealthProbe(databaseHealthy));
        });
    }
}

public sealed class RecordingWishService(bool fails) : IWishService
{
    public string UnavailableReason => "unavailable";
    public int Calls { get; private set; }
    public string? LastContent { get; private set; }
    public Task<WishCreatedResponse> CreateAsync(string content, CancellationToken cancellationToken)
    {
        Calls++;
        LastContent = content;
        if (fails) throw new DatabaseUnavailableException();
        return Task.FromResult(new WishCreatedResponse(42, new DateTimeOffset(2026, 10, 31, 0, 0, 0, TimeSpan.Zero),
            false, "王若溪大王生日网站"));
    }
}

internal sealed class FakeHealthProbe(bool healthy) : IDatabaseHealthProbe
{
    public Task<bool> IsHealthyAsync(CancellationToken cancellationToken) => Task.FromResult(healthy);
}
