namespace BirthdayWebsite.Api.Data;

public readonly record struct PreciseUtcTimestamp(DateTime MicrosecondsUtc, short Remainder)
{
    public static PreciseUtcTimestamp Split(DateTimeOffset value)
    {
        var utc = value.UtcDateTime;
        var remainder = (short)(utc.Ticks % 10);
        return new(new DateTime(utc.Ticks - remainder, DateTimeKind.Utc), remainder);
    }
    // SqlClient returns DATETIME2 without a timezone. Existing SQL services explicitly interpret it as UTC.
    public static PreciseUtcTimestamp FromSqlServerUtc(DateTime value)
    {
        if (value.Kind == DateTimeKind.Local) throw new ArgumentException("SQL Server 时间必须具有已确认的 UTC 语义。");
        return Split(new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc)));
    }
    public static DateTimeOffset Join(DateTime microsecondsUtc, short remainder)
    {
        if (microsecondsUtc.Kind != DateTimeKind.Utc || microsecondsUtc.Ticks % 10 != 0 || remainder is < 0 or > 9)
            throw new InvalidOperationException("数据库 UTC 时间或 100ns 余数无效。");
        return new(new DateTime(checked(microsecondsUtc.Ticks + remainder), DateTimeKind.Utc));
    }
}
