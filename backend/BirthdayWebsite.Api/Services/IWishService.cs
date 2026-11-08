using BirthdayWebsite.Api.Models;

namespace BirthdayWebsite.Api.Services;

public interface IWishService
{
    string UnavailableReason { get; }
    Task<WishCreatedResponse> CreateAsync(string content, CancellationToken cancellationToken);
}
