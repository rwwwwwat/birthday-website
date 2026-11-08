# 第三阶段验证报告

检查日期：2026-10-31。仅本地开发与验证，无部署、上传、提交或数据库修改。

## 实际文件范围

```text
F:\ourweb\
├── myneed.md                           原样保留
├── images\                             11 张原图，原样保留
├── .git\                               本地 main 分支，无提交、无远程
├── .gitignore
├── README.md
├── frontend\
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js
│   ├── public\
│   │   ├── favicon.svg
│   │   └── images\                     11 张逐字节相同的复制图片
│   ├── src\
│   │   ├── css\style.css
│   │   ├── config\
│   │   │   ├── site.js
│   │   │   └── photos.js
│   │   └── js\
│   │       ├── app.js
│   │       ├── state.js
│   │       ├── components\
│   │       │   ├── music.js
│   │       │   └── navigation.js
│   │       └── scenes\
│   │           ├── login.js
│   │           ├── memories.js
│   │           ├── letter.js
│   │           ├── cake.js
│   │           └── wishes.js
│   └── tests\state.test.js
├── backend\BirthdayWebsite.Api\
│   ├── BirthdayWebsite.Api.csproj
│   ├── BirthdayWebsite.Api.http
│   ├── Program.cs
│   ├── appsettings.json
│   ├── appsettings.Development.json
│   ├── appsettings.Local.example.json
│   ├── Properties\launchSettings.json
│   ├── Controllers\
│   │   ├── HealthController.cs
│   │   ├── WishesController.cs
│   │   ├── AdminController.cs
│   │   └── AuthController.cs
│   ├── Models\
│   │   ├── HealthResponse.cs
│   │   ├── CreateWishRequest.cs
│   │   └── Wish.cs
│   ├── Data\DatabaseOptions.cs
│   └── Services\
│       ├── IWishService.cs
│       └── UnavailableWishService.cs
├── database\scripts\001_create_database_and_wishes.sql
├── docs\
│   ├── phase-3.md
│   ├── verify-api.ps1
│   ├── verify-sql.ps1
│   └── verification-report.md
└── .github\workflows\README.md          仅说明，无可执行部署工作流
```

另外生成了被 Git 忽略的项目依赖/构建目录：`frontend/node_modules`、
`frontend/dist`、后端 `bin` 和 `obj`，以及 `.local` 中的隔离 CLI 缓存、
NuGet/npm 缓存、原始文件哈希基线、浏览器测试脚本、截图与测试日志。
未安装全局软件。所有图片复制时保持原文件名，包括 `pther5.jpg`。

## 验证结果

| 检查 | 结果 |
|---|---|
| Vite 安装 | 8.3.5，已记录精确版本与 package-lock；安装审计报告 0 个漏洞 |
| 前端状态测试 | 2 项通过：解锁/非法场景限制、跨场景草稿与完成状态保留 |
| 前端构建 | `npm run build` 成功，生成 dist |
| .NET 构建 | net10.0；0 警告、0 错误 |
| 健康接口 | GET /api/health 返回 HTTP 200，status=ok，database=not-configured |
| 开发文档 | GET /openapi/v1.json 正常，OpenAPI 3.1.1；六个 API 路径均列出 |
| 愿望预留接口 | 有效内容返回 503；空白、空内容、超过2000字符返回400；不写数据库 |
| 管理预留接口 | 列表、未读数、标记已读均返回401；登录预留返回503 |
| CORS | 允许 localhost:5173 和 localhost:4173；不为测试的非信任来源返回允许头 |
| 图片完整性 | 原文档与11张原图哈希保持一致；public和dist中各11张照片哈希逐一相同 |
| SQL 语法 | 使用现有 SSMS 的 TSql170Parser 离线解析，5个批次，0解析错误 |
| Git | main，无提交、无远程；所有源文件仍未跟踪；姓名和邮箱未配置 |
| 忽略规则 | .local、node_modules、dist、bin、obj、本地配置和数据库备份均被忽略 |

使用现有 Edge 无头模式和独立临时配置完成了浏览器交互验证：

- 错误口令提示、正确口令进入回忆；初始1张照片、展开后10张照片。
- 十张图片全部成功解码，逐一打开并关闭大图。
- 信件展开、点击吹灭蜡烛、跨场景草稿保留、愿望提交禁用。
- 五个场景在320px和390px宽度下没有横向页面溢出。
- 静态产物挂载到 `/birthday-test/` 下仍能登录并加载全部照片。
- 最终无 JavaScript 异常或资源加载错误；缺失 favicon 的初次发现已修复并复测。
- 测试服务与测试用独立浏览器在验证后关闭。

## 验证边界

SQL 脚本没有交给 SQL Server 执行，没有建库、建表、连接数据库或测试实际重复执行。
离线解析只证明语法可解析，不证明数据库权限、既有表结构或运行时结果。
脚本中动态批次的建库语句另经静态审阅。
尚未在真实 iPhone、Android、微信浏览器中测试；照片列车等最终动画、实际音乐、
数据库业务、独立管理界面和正式认证不属于本阶段已完成功能。

## 需要所有者后续确认

1. 审阅 SQL 脚本，明确授权后再进入数据库执行阶段。
2. 首次 Git 提交前提供提交姓名和邮箱；本阶段不需要登录或提交。
3. 后续提供恋爱日期、生日、正式情书与照片说明，并确认音乐合法来源。
4. 正式部署前确认远程仓库、API 地址、认证与隧道配置。
