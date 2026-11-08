namespace BirthdayWebsite.Api.Models;

public static class WishContentRules
{
    public const int MaxLength = 2000;
    public const string EmptyMessage = "愿望内容不能为空或纯空白。";
    public const string LengthMessage = "愿望内容不能超过 2000 个 UTF-16 代码单元。";

    public static string? GetError(string? content) => string.IsNullOrWhiteSpace(content)
        ? EmptyMessage : content.Length > MaxLength ? LengthMessage : null;
}
