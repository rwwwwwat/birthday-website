using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace BirthdayWebsite.Api.Models;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class AdminLoginRequest
{
    [Required, StringLength(100)] public string Username { get; init; } = "";
    [Required, StringLength(256)] public string Password { get; init; } = "";
}
public sealed record AdminWishSummary(long WishId, DateTimeOffset CreatedAt, bool IsRead, string Source, string ContentPreview);
public sealed record AdminWishDetail(long WishId, string Content, DateTimeOffset CreatedAt, bool IsRead, string Source);
public sealed record AdminWishPage(IReadOnlyList<AdminWishSummary> Items, long TotalCount, int CurrentPage, int PageSize, long TotalPages);
public sealed record AdminWishStats(long TotalCount, long UnreadCount, long ReadCount, DateTimeOffset? LatestCreatedAt, long LatestWishId);
