using BirthdayWebsite.Api.Data;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace BirthdayWebsite.Api.Tests;

public sealed class ConnectionConfigurationTests
{
    [Fact]
    public void ProductionRejectsCertificateTrustExceptionWithoutOpeningConnection()
    {
        Assert.Throws<InvalidOperationException>(() => Create("Production", "Server=(local)\\SQLEXPRESS;Database=BirthdayWebsiteDB;Integrated Security=True;TrustServerCertificate=True;"));
    }

    [Fact]
    public void SqlLoginsAreRejectedWithoutOpeningConnection()
    {
        Assert.Throws<InvalidOperationException>(() => Create("Development", "Server=localhost;Database=example;User ID=sa;Password=not-used;"));
    }

    [Fact]
    public void LocalWindowsConnectionUsesPoolEncryptionAndBoundedTimeouts()
    {
        var factory = Create("Development", "Server=(local)\\SQLEXPRESS;Database=BirthdayWebsiteDB;Integrated Security=True;TrustServerCertificate=True;");
        using var connection = factory.CreateConnection(); // Construct only; never Open.
        var settings = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(connection.ConnectionString);
        Assert.True(settings.IntegratedSecurity);
        Assert.True(settings.Pooling);
        Assert.Equal(50, settings.MaxPoolSize);
        Assert.Equal(5, settings.ConnectTimeout);
        Assert.Equal(0, settings.ConnectRetryCount);
        Assert.Equal(Microsoft.Data.SqlClient.SqlConnectionEncryptOption.Mandatory, settings.Encrypt);
    }

    private static SqlConnectionFactory Create(string environment, string connectionString)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:BirthdayDatabase"] = connectionString,
        }).Build();
        return new SqlConnectionFactory(configuration, Options.Create(new DatabaseOptions { Enabled = true }),
            new FakeEnvironment { EnvironmentName = environment });
    }

    private sealed class FakeEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "test";
        public string ContentRootPath { get; set; } = ".";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
