using System.Data;
using BirthdayWebsite.Api.Data;
using BirthdayWebsite.Api.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace BirthdayWebsite.Api.Tests;

public sealed class PostgresDataTests
{
    private static readonly DateTime Micro = new(2026, 11, 1, 0, 30, 21, DateTimeKind.Utc);
    private static PostgresOperation Operation(ScriptedPostgres db) => new(db, NullLogger<PostgresOperation>.Instance);
    private static DataTableReader Receipt(long id = 42) => ScriptedPostgres.Rows([typeof(long),typeof(DateTime),typeof(short),typeof(bool),typeof(string)], [id,Micro,(short)9,false,PostgresWishQueries.Source]);
    private static DataTableReader Detail(bool read = false, bool empty = false) => ScriptedPostgres.Rows([typeof(long),typeof(string),typeof(DateTime),typeof(short),typeof(bool),typeof(string)],
        empty ? [] : [[42L,"isolated body",Micro,(short)9,read,PostgresWishQueries.Source]]);

    [Fact]
    public async Task InsertIsParameterizedAndReturnsDatabaseReceiptOnlyAfterCommit()
    {
        var db = new ScriptedPostgres(); const string body = "'); DELETE FROM anything; -- 😀";
        db.Steps.Enqueue(command =>
        {
            Assert.Equal(PostgresWishQueries.Insert, command.CommandText); Assert.DoesNotContain(body, command.CommandText);
            Assert.Equal(body,command.Parameters["content"].Value); Assert.Equal(PostgresWishQueries.Source,command.Parameters["source"].Value);
            Assert.Equal(2,command.Parameters.Count); Assert.DoesNotContain("created_at)",command.CommandText); Assert.DoesNotContain("wish_id)",command.CommandText);
            Assert.NotNull(command.AssignedTransaction); Assert.Equal(0,db.Commits); return Receipt();
        });
        var result = await new PostgresWishService(Operation(db)).CreateAsync(body, default);
        Assert.Equal(42,result.WishId); Assert.Equal(Micro.AddTicks(9),result.CreatedAt.UtcDateTime); Assert.False(result.IsRead);
        Assert.Equal(1,db.Commits); Assert.Equal(0,db.Rollbacks); Assert.Equal(1,db.Opens); Assert.Equal(1,db.ConnectionsDisposed);
    }
    [Theory]
    [InlineData("commit")] [InlineData("command")] [InlineData("empty")] [InlineData("open")]
    public async Task FailedPersistenceNeverReturnsSuccessOrRetries(string fault)
    {
        var db = new ScriptedPostgres { FailCommit = fault == "commit", FailOpen = fault == "open" };
        db.Steps.Enqueue(_ => fault == "command" ? throw new NpgsqlException("isolated") : fault == "empty"
            ? ScriptedPostgres.Rows([typeof(long),typeof(DateTime),typeof(short),typeof(bool),typeof(string)]) : Receipt());
        await Assert.ThrowsAsync<DatabaseUnavailableException>(() => new PostgresWishService(Operation(db)).CreateAsync("isolated", default));
        Assert.Equal(1,db.Opens); Assert.Equal(0,db.Commits); Assert.InRange(db.Commands.Count,0,1);
        Assert.Equal(fault == "open" ? 0 : 1, db.Rollbacks);
    }
    [Theory]
    [InlineData(0)] [InlineData(1)] [InlineData(2)]
    public async Task InvalidContentNeverOpensAConnection(int kind)
    {
        var db = new ScriptedPostgres(); var body = kind == 0 ? "" : kind == 1 ? " \t\r\n\u00a0" : new string('x',2001);
        await Assert.ThrowsAsync<ArgumentException>(() => new PostgresWishService(Operation(db)).CreateAsync(body,default)); Assert.Equal(0,db.Opens);
    }
    [Fact]
    public async Task ExactUtf16LimitWithEmojiIsNotTruncated()
    {
        var db = new ScriptedPostgres(); var body = string.Concat(Enumerable.Repeat("😀",1000));
        db.Steps.Enqueue(command => { Assert.Equal(2000,((string)command.Parameters["content"].Value!).Length); return Receipt(); });
        await new PostgresWishService(Operation(db)).CreateAsync(body,default);
    }
    [Theory]
    [InlineData(null)] [InlineData(false)] [InlineData(true)]
    public async Task PaginationCountAndRowsUseOneRepeatableReadSnapshot(bool? filter)
    {
        var db = new ScriptedPostgres();
        db.Steps.Enqueue(command => { Assert.Equal(PostgresWishQueries.Count(filter),command.CommandText); return 7L; });
        db.Steps.Enqueue(command =>
        {
            Assert.Equal(PostgresWishQueries.Page(filter),command.CommandText); Assert.Equal(3,command.Parameters["size"].Value); Assert.Equal(3L,command.Parameters["offset"].Value);
            Assert.Same(db.Commands[0].AssignedTransaction,command.AssignedTransaction);
            return ScriptedPostgres.Rows([typeof(long),typeof(DateTime),typeof(short),typeof(bool),typeof(string),typeof(string)], [42L,Micro,(short)7,filter ?? false,"source","preview"]);
        });
        var result = await new PostgresAdminWishService(Operation(db)).ListAsync(2,3,filter,default);
        Assert.Equal(IsolationLevel.RepeatableRead,db.Isolation); Assert.Equal(7,result.TotalCount); Assert.Equal(3,result.TotalPages); Assert.Equal(2,result.CurrentPage);
        Assert.Equal(Micro.AddTicks(7),Assert.Single(result.Items).CreatedAt.UtcDateTime); Assert.Equal(1,db.Commits); Assert.Empty(db.Steps);
    }
    [Theory]
    [InlineData(false,false)] [InlineData(true,false)] [InlineData(false,true)] [InlineData(true,true)]
    public async Task DetailsAndMarkReadAreParameterizedAndMissingRowsStayMissing(bool mark, bool empty)
    {
        var db = new ScriptedPostgres();
        db.Steps.Enqueue(command => { Assert.Equal(mark?PostgresWishQueries.MarkRead:PostgresWishQueries.Detail,command.CommandText); Assert.Equal(42L,command.Parameters["id"].Value); return Detail(mark,empty); });
        var service = new PostgresAdminWishService(Operation(db)); var result = mark ? await service.MarkReadAsync(42,default) : await service.DetailAsync(42,default);
        if (empty) Assert.Null(result); else { Assert.Equal(mark,result!.IsRead); Assert.Equal(Micro.AddTicks(9),result.CreatedAt.UtcDateTime); }
        Assert.Equal(1,db.Commits); Assert.Equal(0,db.Rollbacks);
    }
    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task StatsUsesConsistentSnapshotAndFullPrecisionLatestTime(bool empty)
    {
        var db = new ScriptedPostgres();
        db.Steps.Enqueue(command => { Assert.Equal(PostgresWishQueries.Stats,command.CommandText); return ScriptedPostgres.Rows([typeof(long),typeof(long),typeof(long)], [empty?0L:8L,empty?0L:3L,empty?0L:99L]); });
        db.Steps.Enqueue(command => { Assert.Equal(PostgresWishQueries.Latest,command.CommandText); return ScriptedPostgres.Rows([typeof(DateTime),typeof(short)],empty?[]:[[Micro,(short)9]]); });
        var result = await new PostgresAdminWishService(Operation(db)).StatsAsync(default);
        Assert.Equal(empty?0:8,result.TotalCount); Assert.Equal(empty?0:5,result.ReadCount); Assert.Equal(empty?null:new DateTimeOffset(Micro.AddTicks(9)),result.LatestCreatedAt);
        Assert.Equal(IsolationLevel.RepeatableRead,db.Isolation); Assert.Equal(1,db.Commits);
    }
    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task HealthOnlySelectsOneAndReportsUnavailability(bool fail)
    {
        var db = new ScriptedPostgres { FailOpen=fail }; db.Steps.Enqueue(command => { Assert.Equal("SELECT 1",command.CommandText); Assert.Empty(command.Parameters); return 1; });
        Assert.Equal(!fail,await new PostgresDatabaseHealthProbe(Operation(db)).IsHealthyAsync(default)); Assert.Equal(1,db.Opens); Assert.Equal(0,db.Commits);
    }
    [Fact]
    public async Task CallerCancellationIsPreservedWithoutRetry()
    {
        var db = new ScriptedPostgres(); using var cancel = new CancellationTokenSource(); cancel.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>new PostgresWishService(Operation(db)).CreateAsync("isolated",cancel.Token)); Assert.Equal(0,db.Opens);
    }
    [Theory]
    [InlineData(0,10)] [InlineData(1,0)] [InlineData(1,101)]
    public async Task InvalidPageNeverOpensAConnection(int page, int size)
    { var db=new ScriptedPostgres();await Assert.ThrowsAsync<ArgumentOutOfRangeException>(()=>new PostgresAdminWishService(Operation(db)).ListAsync(page,size,null,default));Assert.Equal(0,db.Opens); }
}
