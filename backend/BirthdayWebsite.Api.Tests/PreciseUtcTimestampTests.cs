using BirthdayWebsite.Api.Data;

namespace BirthdayWebsite.Api.Tests;

public sealed class PreciseUtcTimestampTests
{
    [Theory]
    [InlineData(0)] [InlineData(1)] [InlineData(2)] [InlineData(3)] [InlineData(4)]
    [InlineData(5)] [InlineData(6)] [InlineData(7)] [InlineData(8)] [InlineData(9)]
    public void EveryRemainderRoundTripsExactly(int digit)
    {
        var original = DateTimeOffset.Parse("2026-11-01T00:30:21.1772820+00:00").AddTicks(digit);
        var parts=PreciseUtcTimestamp.Split(original);Assert.Equal(digit,parts.Remainder);Assert.Equal(0,parts.MicrosecondsUtc.Ticks%10);
        Assert.Equal(original,PreciseUtcTimestamp.Join(parts.MicrosecondsUtc,parts.Remainder));
    }
    [Fact]
    public void RangeBoundariesAndDatesBeforePostgresEpochAreLossless()
    {
        foreach(var value in new[]{DateTimeOffset.MinValue,DateTimeOffset.MaxValue,DateTimeOffset.Parse("1900-01-01T00:00:00.0000009Z"),DateTimeOffset.Parse("1999-12-31T23:59:59.9999999Z")})
        { var parts=PreciseUtcTimestamp.Split(value);Assert.Equal(value,PreciseUtcTimestamp.Join(parts.MicrosecondsUtc,parts.Remainder)); }
        var random=new Random(105);for(var i=0;i<10000;i++)
        {var value=new DateTimeOffset(random.NextInt64(0,DateTime.MaxValue.Ticks),TimeSpan.Zero);var parts=PreciseUtcTimestamp.Split(value);Assert.Equal(value.Ticks,PreciseUtcTimestamp.Join(parts.MicrosecondsUtc,parts.Remainder).Ticks);}
    }
    [Fact]
    public void SqlServerUnspecifiedIsExplicitlyUtcAndOffsetsAreNormalized()
    {
        var value=DateTime.ParseExact("2026-11-01T00:30:21.1772829","yyyy-MM-dd'T'HH:mm:ss.fffffff",System.Globalization.CultureInfo.InvariantCulture);
        var parts=PreciseUtcTimestamp.FromSqlServerUtc(value);Assert.Equal(DateTime.SpecifyKind(value,DateTimeKind.Utc),PreciseUtcTimestamp.Join(parts.MicrosecondsUtc,parts.Remainder).UtcDateTime);
        var offset=new DateTimeOffset(DateTime.SpecifyKind(value,DateTimeKind.Unspecified),TimeSpan.FromHours(8));
        parts=PreciseUtcTimestamp.Split(offset);Assert.Equal(offset.UtcTicks,PreciseUtcTimestamp.Join(parts.MicrosecondsUtc,parts.Remainder).UtcTicks);
        Assert.Throws<ArgumentException>(()=>PreciseUtcTimestamp.FromSqlServerUtc(DateTime.SpecifyKind(value,DateTimeKind.Local)));
    }
    [Theory]
    [InlineData(-1)] [InlineData(10)]
    public void InvalidRemaindersAreNeverSilentlyRounded(short digit) => Assert.Throws<InvalidOperationException>(()=>PreciseUtcTimestamp.Join(DateTime.UnixEpoch,digit));
    [Fact]
    public void NonUtcOrNonAlignedTimeIsRejected()
    {
        Assert.Throws<InvalidOperationException>(()=>PreciseUtcTimestamp.Join(DateTime.SpecifyKind(DateTime.UnixEpoch,DateTimeKind.Unspecified),0));
        Assert.Throws<InvalidOperationException>(()=>PreciseUtcTimestamp.Join(DateTime.UnixEpoch.AddTicks(1),0));
    }
}
