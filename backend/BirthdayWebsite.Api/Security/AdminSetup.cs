using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace BirthdayWebsite.Api.Security;

public static class AdminSetup
{
    public static void Run()
    {
        if (Console.IsInputRedirected) throw new InvalidOperationException("请在交互式本机终端配置，不通过参数或管道传入密码。");
        var path = Path.GetFullPath("appsettings.Admin.Local.json");
        if (File.Exists(path)) throw new InvalidOperationException("本地管理员配置已存在；不会覆盖，请人工审查后处理。");
        Console.Write("管理员用户名：");
        var username = Console.ReadLine()?.Trim() ?? "";
        Console.Write("密码（至少16字符，输入不可见）："); var password = ReadSecret();
        Console.Write("再次输入："); var confirmation = ReadSecret();
        if (username.Length is < 1 or > 100 || password.Length is < 16 or > 256 || password != confirmation)
            throw new InvalidOperationException("用户名、密码长度或两次密码不符合要求。未保存配置。");
        var hasher = new PasswordHasher<string>(Options.Create(new PasswordHasherOptions { IterationCount = 210_000 }));
        var json = JsonSerializer.Serialize(new { Admin = new { Username = username, PasswordHash = hasher.HashPassword(username, password) } },
            new JsonSerializerOptions { WriteIndented = true });
        using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        using (var writer = new StreamWriter(stream)) writer.Write(json);
        Console.WriteLine("仅用户名与安全哈希已写入被Git忽略的本地文件；请限制此文件的本机访问权限。重启API后生效。");
    }
    private static string ReadSecret()
    {
        var chars = new List<char>();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); return new string(chars.ToArray()); }
            if (key.Key == ConsoleKey.Backspace) { if (chars.Count > 0) chars.RemoveAt(chars.Count - 1); }
            else if (!char.IsControl(key.KeyChar) && chars.Count < 257) chars.Add(key.KeyChar);
        }
    }
}
