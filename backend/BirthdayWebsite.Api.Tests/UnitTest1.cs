namespace BirthdayWebsite.Api.Tests;

using BirthdayWebsite.Api.Models;

public class WishContentTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" \t\r\n")]
    [InlineData("\u3000\u00a0")]
    public void EmptyOrUnicodeWhitespaceIsRejected(string? content)
    {
        Assert.Equal(WishContentRules.EmptyMessage, WishContentRules.GetError(content));
    }

    [Fact]
    public void LimitUsesUtf16CodeUnitsAndDoesNotTrimOrTruncate()
    {
        var boundary = string.Concat(Enumerable.Repeat("🎂", 1000));
        Assert.Equal(2000, boundary.Length);
        Assert.Null(WishContentRules.GetError(boundary));
        Assert.Equal(WishContentRules.LengthMessage, WishContentRules.GetError(boundary + "a"));
        Assert.Null(WishContentRules.GetError("  希望每天都开心  "));
    }
}
