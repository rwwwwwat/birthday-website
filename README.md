# 王若溪大王的生日奇幻之旅

第十阶段10.5：新增Npgsql/PostgreSQL数据访问实现，通过DatabaseProvider选择，保留原SQL Server及Azure Blob实现。
本阶段只完成代码、脚本和本地隔离测试，未连接真实SQL Server或Supabase、未迁移数据、未部署或上传素材。
配置与验收见 `docs/phase-10-5.md`；媒体实现见 `docs/phase-10-3.md`，认证说明见 `docs/phase-10-2.md`。
本阶段没有连接或修改真实数据库，管理员认证及SQL业务保持原样，未操作WishId=1。
API 已通过 SqlClient 连接 SQL Server。
前端为 Vite + 原生 HTML/CSS/JavaScript，
后端为 .NET 10 ASP.NET Core Controllers API。当前仅本机运行；后续目标是GitHub Private保存源码，
云端ASP.NET Core同源托管、Cloudflare Access/Tunnel、私有Blob与Azure SQL。
这些云端资源和数据库迁移尚未实施，本阶段不对公网开放服务。

## 目录

- `myneed.md`：原始需求，保留原样。
- `images/`：原始照片，保留原样。
- `audio/`：用户提供的四首原始MP3及四张封面，后端本地读取，已被Git忽略。
- `frontend/public/audio/`：以前的副本保留不动，已忽略；Vite不再公开提供或复制它们。
- `frontend/`：前端源码和公开图片，构建产物为 `dist/`。
- `backend/BirthdayWebsite.Api/`：API、配置示例及 HTTP 测试请求。
- `database/scripts/`：已审查并完成部署的数据库初始化脚本，本阶段不再次执行。
- `backend/BirthdayWebsite.Api.Tests/`：单元及隔离HTTP测试，不调用真实写入服务。
- `docs/`：阶段说明与验证报告。
- `.github/workflows/`：GitHub Pages 部署与 Render/Supabase 保活工作流。

## 前端启动

在 PowerShell 中：

```powershell
cd F:\ourweb\frontend
npm ci
npm run dev
```

打开 `http://localhost:5173`。账号为“宝宝”，仪式口令为 `1002`。
这不是安全认证；当前私有音乐测试授权也仅适用于Development和本机回环连接。

```powershell
npm test
npm run build
npm run preview
```

预览地址为 `http://localhost:4173`。Vite `base: './'`，资源通过相对路径引用，
静态资源兼容子路径；媒体URL使用同源根路径 `/media`，需要后端，不能只部署一个静态目录。
安装依赖使用项目内 package-lock.json；不需要全局安装 Vite。

照片统一在 `frontend/src/config/photos.js` 管理，`pther5.jpg` 保持原名。
日期在 `frontend/src/config/site.js`，正式情书/生日祝福在 `frontend/src/config/copy.js` 管理。
恋爱开始日为2026-06-27，按香港时区包含首日计算；2026-11-10为第137天。
生日为2026-11-10（用户指定农历十月初二），20岁；没有编造照片日期。
所有 `VITE_*` 配置都会进入公开前端，不得存放凭据。
前端API地址通过 `VITE_API_BASE_URL` 读取。当前 `frontend/.env.local` 已设置
`http://localhost:5270`，与后端launchSettings一致；该文件被Git忽略。
新环境可复制 `frontend/.env.example` 为 `.env.local`，不要把数据库连接字符串或凭据放入前端。
本机联调使用 `npm run dev`；生产构建会清空本机/非HTTPS地址，因此默认 `npm run preview`
不会投递真实愿望；媒体仍通过本机5270代理读取。未来同源部署需提供正确的本站HTTPS API地址。

场景状态使用原有store管理，草稿保存在sessionStorage。
投递中的正文和待核实标记还会写入localStorage，避免刷新或关闭后重复发送。
五场景心形列车、开信、20岁蛋糕和吹蜡烛/烟花均已完成，详见第六阶段报告。
音乐由 `frontend/src/config/music.js` 统一管理，使用用户确认的现有Michita《Cry For Me》版本。
四首歌和对应封面使用 `/media/audio/{id}`、`/media/covers/{id}`，默认音量0.15，保留原UI和歌单。
普通歌单循环；第一次合照触发《迷人的危险》，保存普通进度，彩蛋结束后继续下一首并避免立即重复。
页面只在载入尝试一次自动播放，受限时提供一次交互降级和明确的手动播放入口，不循环重试。
音频与封面仍须在公开部署前确认公开传播授权；本阶段只做本地开发，未部署。

## 本地私有媒体

后端使用原始 `audio/`，只接受cry-for-me、aitaiwa、danger、kataomoi四个ID，不接受文件路径。
GET/HEAD与字节Range受统一IMediaAuthorizer保护。默认仅Development、明确启用测试开关、
本机来源/目的IP及Host可访问，拒绝转发头与外站请求；同时要求CloudflareAccess的开发开关启用。
Production必须验证Cloudflare Access JWT和两个完整邮箱白名单，缺少配置时拒绝所有请求。
页面、照片、JS/CSS、健康检查、API与后台也处于同一个验证边界内；Access不授予管理员权限。
响应使用private/no-store。IMediaStorage统一元数据和范围读取；LocalMediaStorage复用原本地实现，
AzureBlobMediaStorage使用官方Azure SDK、Entra身份和精确Range流式下载。Production不允许回退本地文件。
可参考`appsettings.Media.example.json`创建被忽略的`appsettings.Media.Local.json`，或设置
`MediaStorage__Provider=AzureBlob`、`AzureBlob__ServiceUri`、`AzureBlob__ContainerName=birthday-private-media`。
托管身份Client ID可选；实际账户、区域、预算及平台尚未确认，不要直接创建收费资源。
Development未配置Provider时仍读取本地audio；Production缺少有效Blob配置返回503，身份验证仍先于读取。

Vite的dev和preview将 `/media` 代理到现有5270端口，前端不保存密钥。
构建只复制11张照片和favicon，自动检查产物不含歌曲/封面，也封锁旧audio及@fs直链。
原有API若仍在运行，须由所有者审查后停止并重新编译启动，不能用旧DLL验证新接口：

```powershell
cd F:\ourweb\backend\BirthdayWebsite.Api
dotnet run --launch-profile http
```

另开终端在frontend运行 `npm run dev`。不要将Development测试授权用于公网。
`npm run check:private-media`可独立检查当前dist。
自动化浏览器测试使用 `.local/phase10-5-artifacts` 中的独立后端，禁用数据库；运行方法见阶段报告。
愿望请求现使用credentials=same-origin为Access Cookie预留，仍然无自动POST重试。

## 后端启动

```powershell
cd F:\ourweb\backend\BirthdayWebsite.Api
dotnet restore
dotnet build --no-restore
dotnet run --no-build --launch-profile http
```

- 健康检查：`http://localhost:5270/api/health`。
- 开发 OpenAPI：`http://localhost:5270/openapi/v1.json`。
- `.http` 文件提供接口请求示例；本阶段提供 OpenAPI JSON，不包含 Swagger UI。
- 仅监听 localhost；本阶段使用本地 HTTP，不创建开发证书。
- CORS 仅在 Development 开放 `http://localhost:5173` 和 `http://localhost:4173`，
  不允许任意来源，不启用跨域凭据。正式发布前需明确正式来源和认证策略。
- `/api/health` 通过只读 `SELECT 1` 检查数据库；正常返回200，失败返回503。
- `POST /api/wishes` 已实现真实保存，数据库事务提交成功后返回201；本阶段未执行真实写入测试。
- Content拒绝空白及超过2000个UTF-16代码单元的输入，不截断；额外JSON字段被拒绝。
- 请求正文最大16 KiB；提交接口按实际连接IP限制每分钟5次，超限返回429及Retry-After。
- 管理接口要求独立Cookie认证，匿名请求返回401；详见下方管理员后台配置。

## 数据库配置

`DatabaseProvider=SqlServer`用于Development，`DatabaseProvider=PostgreSql`用于Supabase生产配置。
未指定时，Development默认SqlServer，其他环境默认PostgreSql；Production不能选择或回退SqlServer。
现有本机Development启动方法及SQL Server本地配置不变。

PostgreSQL使用单例NpgsqlDataSource，连接池0–5，要求VerifyFull TLS；不自动建表或重试写入。
参考`backend/BirthdayWebsite.Api/appsettings.PostgreSql.example.json`，将真实配置放入已忽略的
`appsettings.PostgreSql.Local.json`，或使用`ConnectionStrings__PostgreSqlBirthdayDatabase`等环境变量。
必须同时设置`Database:Enabled=true`才启用业务数据库；缺少有效配置时启动失败，没有SQL Server兜底。
`Database:Enabled=false`为维护/隔离状态，愿望保存不可用；不是成功写入模式。

新脚本位于`database/postgresql/`，仅供人工审查，不由API执行。独立schema为`birthday_private`。
CreatedAt由UTC微秒时间及0–9的100ns余数构成，API仍返回原有DateTimeOffset格式。
目前没有导出或迁移任何真实愿望，WishId=1保持原样。Supabase连接、真实迁移及部署需要后续单独批准。

实例为 `(local)\SQLEXPRESS`，数据库 `BirthdayWebsiteDB`，Windows 身份验证。
后端使用 Microsoft.Data.SqlClient 7.1.1，不使用 EF Core，不自动建库、建表或执行脚本。
System.Security.Cryptography.Pkcs 显式升级到10.0.14，避免SqlClient间接依赖的旧版漏洞。

数据库、Wishes表、UTC默认时间、完整性约束和历史/未读索引均已完成部署。
`database/scripts/001_create_database_and_wishes.sql` 保持不变，不应为了启动API再次执行。

当前机器已经创建 `appsettings.Local.json` 并启用数据库。新环境可将
`appsettings.Local.example.json` 复制为同目录
`appsettings.Local.json`（已被 Git 忽略），或设置
`ConnectionStrings__BirthdayDatabase` 环境变量。示例采用 `Integrated Security=True`，
不含 SQL 用户名或密码，使用运行 API 的 Windows 身份。示例中的
`TrustServerCertificate=True` 仅为本机开发用途，后续部署应重新审查证书策略。
连接字符串仅位于后端本地配置或环境变量，不进入前端。
本地配置被Git忽略且从发布产物排除；非Development环境禁止TrustServerCertificate=True。
连接池启用（最多50个连接），连接/命令超时各5秒，单次操作总超时10秒；无自动写入重试。
写入参数只有Content和服务器固定Source，CreatedAt/IsRead使用数据库默认值。
SQL异常只记录错误编号，不记录SQL、连接字符串或愿望正文。

## 验证与当前边界

```powershell
cd F:\ourweb
dotnet test BirthdayWebsite.sln
```

测试宿主替换IWishService和IDatabaseHealthProbe，有效请求也只调用测试替身，不连接真实数据库。
本机只读接口验证可在API启动后执行 `./docs/verify-api.ps1`，只发送无效愿望请求。
HTTP请求示例中有效POST会真实写入，需要另行明确授权后才能测试。
前端已具备真实调用能力，但本阶段不得通过真实POST测试。
`npm run test:browser:api`仅构建独立Mock产物，所有POST在浏览器层拦截，真实API额外阻断。
`npm run test:browser`验证默认生产构建和五场景回归，不发送POST。
当前公开投递状态说明见 `docs/phase-7.md`，管理接口与安全验收见 `docs/phase-8.md`。
`npm run test:browser:admin`只使用浏览器拦截的管理数据，不操作真实愿望。

## 管理员后台

API启动后访问 `http://localhost:5270/admin/`，与五个生日场景独立，由API同源提供。
先在本机终端配置你自己的管理员用户名和密码；本阶段没有设置真实凭据：

```powershell
cd F:\ourweb\backend\BirthdayWebsite.Api
dotnet build --no-restore
dotnet bin/Debug/net10.0/BirthdayWebsite.Api.dll --configure-admin
```

密码交互输入不可见，至少16字符。工具只写用户名与Identity安全密码哈希到
`appsettings.Admin.Local.json`，不保存明文、不覆盖已有文件、不连接数据库。
该文件已被Git忽略并排除发布；请限制本机访问权限，随后重新启动API。
也可使用服务器环境变量 `Admin__Username` 和 `Admin__PasswordHash`；不设置默认密码。

认证使用HttpOnly、SameSite=Lax Cookie，生产Secure且要求HTTPS，绝对有效期8小时。
服务端票据退出后立即撤销，重启API也要求重新登录；Data Protection使用当前Windows用户默认受保护密钥环。
登录、退出、标记已读均要求CSRF令牌。后台支持统计、分页、未读/已读筛选、详情、手动已读。
仅页面可见且已登录时每12秒检查新愿望，不自动展开正文、标记已读或播放声音。
**本阶段不得使用真实WishId=1测试“标记已读”；功能测试使用替身。**

## Git 与后续发布

当前仅初始化本地仓库，无提交、无远程。首次提交前需由所有者提供 Git 用户名和邮箱。
`.gitignore` 排除本机配置、密钥、依赖、缓存、编译产物、SQL 数据及备份。
原始素材未删除或覆盖；是否提交需求文档和原始素材，应在首次提交前复核。

第九阶段原始内容见 `docs/phase-9.md`；私有媒体见 `docs/phase-10-1.md`，网站身份验证见 `docs/phase-10-2.md`。
当前部署架构为 GitHub Pages（前端）+ Supabase（PostgreSQL + create_wish RPC）；Render 的 Docker/`render.yaml` 保留为可选备用，不是当前上线路径。
需由所有者提供TeamDomain、Access应用AUD及两个邮箱，通过服务器环境变量或被忽略的
`appsettings.Access.Local.json`配置；`appsettings.Access.example.json`只有空占位，不含真实身份。
Production还需设置`PrivateSite:FrontendRootPath`指向构建后的前端目录。
后续顺序：人工审查、配置真实Access及源站网络/HTTPS保护 → 私有云存储与数据库迁移 →
经授权进行真实身份登录、手机兼容与完整上线验收。云资源创建、部署和真实写入均需后续授权。

## 当前部署（GitHub Pages + Supabase）

1. Supabase：依次运行 `database/postgresql/001_create_private_wishes.sql` 和 `004_create_wish_rpc.sql`。
2. GitHub 仓库变量：`SUPABASE_URL`（项目 URL）和 `SUPABASE_ANON_KEY`（publishable/anon key，可公开）。
3. GitHub Pages：`.github/workflows/pages.yml` 用上述变量构建并发布 `frontend/dist`。
4. 愿望：前端直接 POST 到 `rest/v1/rpc/create_wish`；表仍在 `birthday_private`，只有该函数暴露给 `anon`。
5. 管理：直接在 Supabase Table Editor 查看 `birthday_private.wishes`。
6. 音乐：根目录 `media/` 在 `VITE_MEDIA_MODE=static` 时复制到 `dist/media/`，由 Pages 直接提供。
7. `render.yaml` 与 `Dockerfile` 保留为可选备用，不是当前上线路径。

`appsettings.*.Local.json`、`.env.local` 和 `.acl-recovery/` 均被 Git 忽略。

## 技术参考

- [Vite 相对部署路径](https://vite.dev/guide/build#relative-base)
- [ASP.NET Core OpenAPI](https://learn.microsoft.com/aspnet/core/fundamentals/openapi/aspnetcore-openapi?view=aspnetcore-10.0)
