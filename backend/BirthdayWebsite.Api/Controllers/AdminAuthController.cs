using BirthdayWebsite.Api.Models;
using BirthdayWebsite.Api.Security;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;

namespace BirthdayWebsite.Api.Controllers;

[ApiController]
[Route("api/admin")]
public sealed class AdminAuthController(AdminCredentials credentials, TimeProvider clock) : ControllerBase
{
    [HttpGet("csrf"), AllowAnonymous]
    public IActionResult Csrf([FromServices] IAntiforgery antiforgery) =>
        Ok(new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });

    [HttpPost("login"), AllowAnonymous, EnableRateLimiting("AdminLogin")]
    public async Task<IActionResult> Login(AdminLoginRequest request)
    {
        if (!credentials.Verify(request.Username, request.Password))
            return Problem(statusCode: 401, title: "登录失败，请检查管理员凭据");
        // Invalidate any current session before establishing a different one.
        await HttpContext.SignOutAsync("AdminCookie");
        var principal = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, credentials.Username), new Claim(ClaimTypes.Name, credentials.Username),
            new Claim("credential-stamp", credentials.Stamp)], "AdminCookie"));
        await HttpContext.SignInAsync("AdminCookie", principal, new AuthenticationProperties
        { IsPersistent = false, AllowRefresh = false, IssuedUtc = clock.GetUtcNow(), ExpiresUtc = clock.GetUtcNow().AddHours(8) });
        return Ok(new { username = credentials.Username, expiresAt = clock.GetUtcNow().AddHours(8) });
    }
    [HttpGet("me"), Authorize]
    public async Task<IActionResult> Me()
    {
        var ticket = await HttpContext.AuthenticateAsync("AdminCookie");
        return Ok(new { username = User.Identity!.Name, expiresAt = ticket.Properties?.ExpiresUtc });
    }
    [HttpPost("logout"), Authorize]
    public async Task<IActionResult> Logout()
    { await HttpContext.SignOutAsync("AdminCookie"); return NoContent(); }
}
