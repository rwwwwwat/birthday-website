using BirthdayWebsite.Api.Models;
using BirthdayWebsite.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BirthdayWebsite.Api.Controllers;

[ApiController]
[Route("api/wishes")]
public sealed class WishesController(IWishService wishes) : ControllerBase
{
    [HttpPost]
    [EnableRateLimiting("WishSubmission")]
    [RequestSizeLimit(16 * 1024)]
    [ProducesResponseType<WishCreatedResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status413PayloadTooLarge)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Submit([FromBody] CreateWishRequest request, CancellationToken cancellationToken)
    {
        var error = WishContentRules.GetError(request.Content);
        if (error is not null)
        {
            ModelState.AddModelError("content", error);
            return ValidationProblem(ModelState);
        }
        var saved = await wishes.CreateAsync(request.Content, cancellationToken);
        // No Location points to a public wish-detail endpoint: none is exposed.
        return StatusCode(StatusCodes.Status201Created, saved);
    }
}
