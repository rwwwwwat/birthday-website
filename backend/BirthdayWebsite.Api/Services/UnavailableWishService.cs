using BirthdayWebsite.Api.Models;

namespace BirthdayWebsite.Api.Services;

public sealed class UnavailableWishService : IWishService
{
    public string UnavailableReason => "数据库业务尚未接入，愿望未保存。请保留内容并稍后重试。";

    public Task<WishCreatedResponse> CreateAsync(string content, CancellationToken cancellationToken) =>
        throw new DatabaseUnavailableException();
}
