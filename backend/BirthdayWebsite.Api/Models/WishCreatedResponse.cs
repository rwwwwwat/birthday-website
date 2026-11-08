namespace BirthdayWebsite.Api.Models;

// The response deliberately omits the private wish text.
public sealed record WishCreatedResponse(long WishId, DateTimeOffset CreatedAt, bool IsRead, string Source);
