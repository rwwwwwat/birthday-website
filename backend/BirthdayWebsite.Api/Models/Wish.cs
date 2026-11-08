namespace BirthdayWebsite.Api.Models;

public sealed class Wish
{
    public long WishId { get; set; }
    public required string Content { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsRead { get; set; }
    public string Source { get; set; } = "王若溪大王生日网站";
}
