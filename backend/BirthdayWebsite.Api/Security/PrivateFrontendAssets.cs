namespace BirthdayWebsite.Api.Security;

public static class PrivateFrontendAssets
{
    private static readonly HashSet<string> Photos = new(StringComparer.Ordinal)
    { "firstphoto.jpg", "other1.jpg", "other2.jpg", "other3.jpg", "other4.jpg", "pther5.jpg",
      "other6.jpg", "other7.jpg", "other8.jpg", "other9.jpg", "userphoto.jpg" };
    public static bool Matches(PathString requestPath)
    {
        var path = requestPath.Value ?? "/";
        if (path is "/" or "/index.html" or "/favicon.svg") return true;
        if (path.StartsWith("/images/", StringComparison.Ordinal)) return Photos.Contains(path[8..]);
        return path.StartsWith("/assets/", StringComparison.Ordinal) && !path.Contains("..", StringComparison.Ordinal)
            && !path.Contains('\\') && (path.EndsWith(".js", StringComparison.Ordinal) || path.EndsWith(".css", StringComparison.Ordinal));
    }
}
