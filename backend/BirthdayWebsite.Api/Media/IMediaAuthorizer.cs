namespace BirthdayWebsite.Api.Media;

// Replace this implementation with validated Access identity in a later phase.
public interface IMediaAuthorizer
{
    ValueTask<bool> IsAuthorizedAsync(HttpContext context, CancellationToken cancellationToken);
}
