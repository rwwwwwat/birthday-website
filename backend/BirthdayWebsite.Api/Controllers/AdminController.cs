using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using BirthdayWebsite.Api.Services;
using System.ComponentModel.DataAnnotations;

namespace BirthdayWebsite.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/admin/wishes")]
public sealed class AdminController(IAdminWishService wishes) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 20, [FromQuery] bool? unreadOnly = null,
        [FromQuery] bool? isRead = null, CancellationToken cancellationToken = default)
    {
        if (unreadOnly == true && isRead == true) return Problem(statusCode: 400, title: "筛选参数冲突");
        return Ok(await wishes.ListAsync(page, pageSize, unreadOnly == true ? false : isRead, cancellationToken));
    }

    [HttpGet("stats")]
    public async Task<IActionResult> Stats(CancellationToken cancellationToken) => Ok(await wishes.StatsAsync(cancellationToken));

    [HttpGet("unread-count")]
    public async Task<IActionResult> UnreadCount(CancellationToken cancellationToken)
    { var stats = await wishes.StatsAsync(cancellationToken); return Ok(new { unreadCount = stats.UnreadCount, latestWishId = stats.LatestWishId }); }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Detail(long id, CancellationToken cancellationToken)
    { var result = await wishes.DetailAsync(id, cancellationToken); return result is null ? NotFound() : Ok(result); }

    [HttpPatch("{id:long}/read")]
    public async Task<IActionResult> MarkRead(long id, CancellationToken cancellationToken)
    { var result = await wishes.MarkReadAsync(id, cancellationToken); return result is null ? NotFound() : Ok(result); }
}
