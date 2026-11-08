using Microsoft.AspNetCore.Mvc;

namespace BirthdayWebsite.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    [HttpPost("admin/login")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public IActionResult Login() => Problem(statusCode: StatusCodes.Status503ServiceUnavailable,
        title: "管理员登录尚未开放", detail: "此端点仅预留结构，不签发凭据，不创建登录会话。");
}
