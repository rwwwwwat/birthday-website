namespace BirthdayWebsite.Api.Services;

public interface IDatabaseHealthProbe
{
    Task<bool> IsHealthyAsync(CancellationToken cancellationToken);
}
