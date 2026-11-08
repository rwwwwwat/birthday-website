using BirthdayWebsite.Api.Models;
using BirthdayWebsite.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace BirthdayWebsite.Api.Controllers;

[ApiController]
[Route("api/health")]
public sealed class HealthController(IDatabaseHealthProbe database) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<HealthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<HealthResponse>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<HealthResponse>> Get(CancellationToken cancellationToken)
    {
        var healthy = await database.IsHealthyAsync(cancellationToken);
        return StatusCode(healthy ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable,
            new HealthResponse(healthy ? "ok" : "degraded", "BirthdayWebsite.Api", DateTimeOffset.UtcNow,
                healthy ? "healthy" : "unavailable"));
    }
}
