using System.Net;
using System.Net.Http.Json;
using BirthdayWebsite.Api.Data;
using BirthdayWebsite.Api.Services;
using BirthdayWebsite.Api.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Npgsql;

namespace BirthdayWebsite.Api.Tests;

public sealed class PostgresWebFactory(string environment="Production",string? provider=null,bool enabled=false,string connection="") : WebApplicationFactory<Program>
{
    public ScriptedPostgres Database { get; } = new();
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);
        builder.ConfigureAppConfiguration((_,config)=>config.AddInMemoryCollection(new Dictionary<string,string?>
        {
            ["DatabaseProvider"]=provider,["Database:Enabled"]=enabled.ToString(),
            ["ConnectionStrings:PostgreSqlBirthdayDatabase"]=connection,
            ["Admin:Username"]="",["Admin:PasswordHash"]="",
        }));
        builder.ConfigureTestServices(services=>
        {
            services.RemoveAll<ISiteAccessVerifier>();services.AddSingleton<ISiteAccessVerifier,IsolatedSiteAccess>();
            services.RemoveAll<IPostgresConnectionFactory>();services.AddSingleton<IPostgresConnectionFactory>(Database);
        });
    }
}
public sealed class PostgresConfigurationTests
{
    private const string IsolatedConnection="Host=isolated.invalid;Database=isolated;Username=isolated;Password=not-a-real-password;SSL Mode=VerifyFull";
    private static IConfiguration Config(string? provider)=>new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{["DatabaseProvider"]=provider}).Build();
    private sealed class Environment(string name):IHostEnvironment
    {public string EnvironmentName{get;set;}=name;public string ApplicationName{get;set;}="isolated";public string ContentRootPath{get;set;}=".";public IFileProvider ContentRootFileProvider{get;set;}=new NullFileProvider();}
    [Theory]
    [InlineData("Development",null,DatabaseProvider.SqlServer)] [InlineData("Development","SqlServer",DatabaseProvider.SqlServer)]
    [InlineData("Development","PostgreSql",DatabaseProvider.PostgreSql)] [InlineData("Production",null,DatabaseProvider.PostgreSql)]
    [InlineData("Production","PostgreSql",DatabaseProvider.PostgreSql)] [InlineData("Staging",null,DatabaseProvider.PostgreSql)]
    public void ProviderSelectionHasSafeDefaults(string environment,string? configured,DatabaseProvider expected)
    {Assert.Equal(expected,new DatabaseProviderSelection(Config(configured),new Environment(environment)).Provider);}
    [Theory]
    [InlineData("Production","SqlServer")] [InlineData("Staging","SqlServer")] [InlineData("Development","unknown")]
    public void InvalidProviderAndProductionSqlServerAreRejected(string environment,string configured)
    {Assert.Throws<InvalidOperationException>(()=>new DatabaseProviderSelection(Config(configured),new Environment(environment)));}
    [Theory]
    [InlineData("")] [InlineData("broken")]
    [InlineData("Host=isolated.invalid;Database=isolated;Username=isolated;SSL Mode=VerifyFull")]
    [InlineData("Host=isolated.invalid;Database=isolated;Username=isolated;Password=not-real;SSL Mode=Require")]
    [InlineData("Host=isolated.invalid;Database=isolated;Username=isolated;Password=not-real;SSL Mode=Disable")]
    [InlineData("Host=a.invalid,b.invalid;Database=isolated;Username=isolated;Password=not-real;SSL Mode=VerifyFull")]
    [InlineData("Host=isolated.invalid;Database=isolated;Username=isolated;Password=not-real;SSL Mode=VerifyFull;Options=-c search_path=public")]
    public void UnsafeOrIncompleteSettingsFailWithoutOpeningConnection(string connection)
    {var error=Assert.Throws<InvalidOperationException>(()=>PostgresConnectionFactory.Validate(connection,new DatabaseOptions()));Assert.DoesNotContain("not-real",error.Message);Assert.DoesNotContain(connection.Length>0?connection:"ignored",error.Message);}
    [Fact]
    public void PoolTimeoutAndLoggingAreBoundedEvenWhenConnectionStringOverridesThem()
    {
        var settings=PostgresConnectionFactory.Validate(IsolatedConnection+";Maximum Pool Size=100;Minimum Pool Size=20;Max Auto Prepare=50;Include Error Detail=true;Log Parameters=true;Multiplexing=true",new DatabaseOptions());
        Assert.True(settings.Pooling);Assert.Equal(0,settings.MinPoolSize);Assert.Equal(5,settings.MaxPoolSize);
        Assert.Equal(5,settings.Timeout);Assert.Equal(5,settings.CommandTimeout);Assert.Equal(0,settings.MaxAutoPrepare);
        Assert.False(settings.IncludeErrorDetail);Assert.False(settings.LogParameters);Assert.False(settings.Multiplexing);Assert.False(settings.PersistSecurityInfo);
        Assert.Equal(SslMode.VerifyFull,settings.SslMode);
    }
    [Fact]
    public async Task DisabledFactoryCannotOpenAndDoesNotRequireCredentials()
    {
        await using var factory=new PostgresConnectionFactory(Config(null),Options.Create(new DatabaseOptions()));
        await Assert.ThrowsAsync<DatabaseUnavailableException>(()=>factory.OpenAsync(default));
    }
    [Fact]
    public async Task EnabledFactoryConstructsDataSourceWithoutConnecting()
    {
        var configuration=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{["ConnectionStrings:PostgreSqlBirthdayDatabase"]=IsolatedConnection}).Build();
        await using var factory=new PostgresConnectionFactory(configuration,Options.Create(new DatabaseOptions{Enabled=true}));
        Assert.Equal(5,factory.CommandTimeoutSeconds); // Do NOT call OpenAsync: isolated.invalid is deliberately unreachable.
    }
    [Fact]
    public async Task DevelopmentKeepsSqlServerServicesAndProductionSelectsPostgresServices()
    {
        await using var development=new PostgresWebFactory("Development");using var client=development.CreateClient();
        using(var scope=development.Services.CreateScope())
        {Assert.IsType<SqlAdminWishService>(scope.ServiceProvider.GetRequiredService<IAdminWishService>());Assert.IsType<SqlDatabaseHealthProbe>(scope.ServiceProvider.GetRequiredService<IDatabaseHealthProbe>());}
        await using var production=new PostgresWebFactory();using var remote=production.CreateClient();
        using(var scope=production.Services.CreateScope())
        {Assert.IsType<PostgresAdminWishService>(scope.ServiceProvider.GetRequiredService<IAdminWishService>());Assert.IsType<PostgresDatabaseHealthProbe>(scope.ServiceProvider.GetRequiredService<IDatabaseHealthProbe>());}
        Assert.Equal(0,development.Database.Opens);Assert.Equal(0,production.Database.Opens);
    }
    [Fact]
    public async Task EnabledProductionMissingConfigStopsStartupWithoutFallback()
    {
        await using var factory=new PostgresWebFactory(enabled:true);
        Assert.Throws<InvalidOperationException>(()=>factory.CreateClient());Assert.Equal(0,factory.Database.Opens);
    }
    [Fact]
    public async Task HttpPostWithPostgresServiceUsesFakeTransactionAndKeeps201Contract()
    {
        await using var factory=new PostgresWebFactory(enabled:true,connection:IsolatedConnection);
        factory.Database.Steps.Enqueue(_=>ScriptedPostgres.Rows([typeof(long),typeof(DateTime),typeof(short),typeof(bool),typeof(string)],
            [74L,DateTime.UnixEpoch,(short)9,false,PostgresWishQueries.Source]));
        using var client=factory.CreateClient();
        using var response=await client.PostAsJsonAsync("/api/wishes",new{content="isolated test, no real database"});
        Assert.Equal(HttpStatusCode.Created,response.StatusCode);var receipt=await response.Content.ReadFromJsonAsync<BirthdayWebsite.Api.Models.WishCreatedResponse>();
        Assert.Equal(74,receipt!.WishId);Assert.Equal(DateTime.UnixEpoch.AddTicks(9),receipt.CreatedAt.UtcDateTime);Assert.Equal(1,factory.Database.Commits);Assert.Equal(1,factory.Database.Opens);
    }
}
