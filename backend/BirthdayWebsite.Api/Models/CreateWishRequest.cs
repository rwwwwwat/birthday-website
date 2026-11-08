using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace BirthdayWebsite.Api.Models;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class CreateWishRequest
{
    [Required(ErrorMessage = WishContentRules.EmptyMessage)]
    [StringLength(WishContentRules.MaxLength, MinimumLength = 1, ErrorMessage = WishContentRules.LengthMessage)]
    public required string Content { get; init; }
}
