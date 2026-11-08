using BirthdayWebsite.Api.Models;

namespace BirthdayWebsite.Api.Services;

public interface IAdminWishService
{
    Task<AdminWishPage> ListAsync(int page, int pageSize, bool? isRead, CancellationToken cancellationToken);
    Task<AdminWishDetail?> DetailAsync(long id, CancellationToken cancellationToken);
    Task<AdminWishStats> StatsAsync(CancellationToken cancellationToken);
    Task<AdminWishDetail?> MarkReadAsync(long id, CancellationToken cancellationToken);
}
