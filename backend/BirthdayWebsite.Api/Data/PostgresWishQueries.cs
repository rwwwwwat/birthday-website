namespace BirthdayWebsite.Api.Data;

public static class PostgresWishQueries
{
    public const string Source = "王若溪大王生日网站";
    public const string ReceiptColumns = "wish_id, created_at, created_at_100ns_remainder, is_read, source";
    public const string DetailColumns = "wish_id, content, created_at, created_at_100ns_remainder, is_read, source";
    // Physical timestamp + remainder is the original logical DATETIME2(7) ordering.
    public const string Ordering = "created_at DESC, created_at_100ns_remainder DESC, wish_id DESC";
    public const string Insert = "INSERT INTO birthday_private.wishes (content, source) VALUES (@content, @source) RETURNING " + ReceiptColumns;
    public const string Detail = "SELECT " + DetailColumns + " FROM birthday_private.wishes WHERE wish_id = @id";
    public const string MarkRead = "UPDATE birthday_private.wishes SET is_read = true WHERE wish_id = @id RETURNING " + DetailColumns;
    public static string Predicate(bool? isRead) => isRead switch { false => " WHERE is_read = false", true => " WHERE is_read = true", _ => "" };
    public static string Count(bool? isRead) => "SELECT count(*) FROM birthday_private.wishes" + Predicate(isRead);
    public static string Page(bool? isRead) => "SELECT " + ReceiptColumns + ", left(content, 100) FROM birthday_private.wishes"
        + Predicate(isRead) + " ORDER BY " + Ordering + " LIMIT @size OFFSET @offset";
    public const string Stats = """
        SELECT count(*) AS total_count, count(*) FILTER (WHERE is_read = false) AS unread_count,
            COALESCE(max(wish_id), 0::bigint) AS latest_wish_id
        FROM birthday_private.wishes
        """;
    public const string Latest = "SELECT created_at, created_at_100ns_remainder FROM birthday_private.wishes ORDER BY " + Ordering + " LIMIT 1";
}
