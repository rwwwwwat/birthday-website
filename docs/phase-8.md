# 第八阶段：独立管理员后台

验收日期：2026-11-01。本阶段实现 API 同源的 `/admin/` 管理页面、独立认证、愿望管理和在线提醒。
没有配置真实管理员凭据，没有发送真实 POST 或 PATCH，没有新增、删除或修改真实愿望。
数据库结构、初始化脚本、原始需求、照片和生日网站 `frontend/src/` 均保持不变。

## 文件清单

新增：

- `backend/BirthdayWebsite.Api/Controllers/AdminAuthController.cs`
- `backend/BirthdayWebsite.Api/Security/AdminOptions.cs`
- `backend/BirthdayWebsite.Api/Security/AdminCredentials.cs`
- `backend/BirthdayWebsite.Api/Security/AdminTicketStore.cs`
- `backend/BirthdayWebsite.Api/Security/AdminSetup.cs`
- `backend/BirthdayWebsite.Api/Models/AdminModels.cs`
- `backend/BirthdayWebsite.Api/Services/IAdminWishService.cs`
- `backend/BirthdayWebsite.Api/Services/SqlAdminWishService.cs`
- `backend/BirthdayWebsite.Api/appsettings.Admin.example.json`
- `backend/BirthdayWebsite.Api/wwwroot/admin/index.html`
- `backend/BirthdayWebsite.Api/wwwroot/admin/admin.css`
- `backend/BirthdayWebsite.Api/wwwroot/admin/admin.js`
- `backend/BirthdayWebsite.Api/wwwroot/admin/polling.js`
- `backend/BirthdayWebsite.Api/wwwroot/admin/mark.svg`
- `backend/BirthdayWebsite.Api.Tests/AdminApiTests.cs`
- `frontend/tests/admin-polling.test.js`
- `frontend/tests/admin-browser-check.mjs`
- `docs/phase-8.md`
- `docs/screenshots/phase-8/01-login-desktop.png`
- `docs/screenshots/phase-8/02-dashboard-mock.png`
- `docs/screenshots/phase-8/03-detail-mock.png`
- `docs/screenshots/phase-8/04-dashboard-mobile-mock.png`

修改：

- `backend/BirthdayWebsite.Api/Program.cs`：认证/授权、CSRF、独立登录限流、管理安全头与静态文件。
- `backend/BirthdayWebsite.Api/Controllers/AdminController.cs`：将拒绝访问的占位实现替换为受认证保护的业务接口。
- `backend/BirthdayWebsite.Api/BirthdayWebsite.Api.csproj`：禁止发布 `appsettings.*.Local.json`。
- `frontend/package.json`：增加 `test:browser:admin`，无新增依赖。
- `README.md`：更新当前状态、管理员配置、启动与测试说明。

现有公开 `WishesController`、`SqlWishService`、连接工厂、健康检查实现及旧测试均保留。
`AuthController` 的旧 `/api/auth/admin/login` 占位路由仍返回503，不签发会话；新后台只使用 `/api/admin/login`。
本机日志、隔离浏览器配置和机器结果位于被忽略的 `.local/`；未创建管理员本地凭据文件。
原 `.gitignore` 已覆盖 `**/appsettings.*.Local.json`，无需修改。

## 认证与会话

使用 ASP.NET Core Cookie Authentication，单个服务器端配置的管理员。
用户名和安全哈希来自 `Admin:Username`、`Admin:PasswordHash`；缺失或无效时拒绝登录，没有默认密码。
使用 Identity PasswordHasher，生成哈希时 PBKDF2 迭代数为210,000。用户名错误时也执行已配置密码哈希验证。
登录失败统一401提示，不说明用户名是否存在，不返回哈希、内部异常或输入的密码。

Cookie 为 HttpOnly、SameSite=Lax、Path=/api/admin，非持久浏览器会话，服务器绝对有效期8小时，无滑动续期。
Development 允许本机 HTTP；生产 Cookie 强制 Secure，管理页面和管理 API 拒绝明文 HTTP。
Cookie 使用 Data Protection 保护，密钥采用框架默认当前 Windows 用户的受 DPAPI 保护密钥环。
本项目没有将密钥导出或放进仓库。正式换运行账户/部署时，需要核对用户配置文件、密钥持久化与权限。

服务端内存票据存储负责撤销：退出立即删除票据，复制旧 Cookie 也不能重新使用。
API 重启会清空所有票据，必须重新登录；这是当前单机单进程方案的明确行为。
未来多实例需要共享票据存储，此阶段没有增加数据库对象或外部服务。

登录接口按实际连接IP每分钟最多5次尝试，无排队。没有启用不可信的转发头解析。
生产隧道/代理的可信来源、转发头及 HTTPS 识别应在后续部署阶段专门配置。

## 首次配置真实凭据（用户手动完成）

在你自己的本机交互式终端中执行：

```powershell
cd F:\ourweb\backend\BirthdayWebsite.Api
dotnet build --no-restore
dotnet bin/Debug/net10.0/BirthdayWebsite.Api.dll --configure-admin
```

工具依次询问用户名、密码和确认密码；密码输入不回显，要求16～256字符。
仅写入用户名和安全哈希到当前目录的 `appsettings.Admin.Local.json`，不保存明文，
不将密码放在命令参数或日志中，不覆盖已有文件，不启动API或连接数据库。
哈希含随机盐；本阶段未替你设置用户名或密码，也未执行此配置工具。
请使用密码管理器设置独立密码，并限制该文件的本机访问权限。

也可由服务器环境变量 `Admin__Username`、`Admin__PasswordHash` 提供同样的值，
环境变量优先于本地文件。不要将真实值写进 `.env`、前端或示例配置。
本地文件已被 Git 忽略并排除发布；修改凭据后重启API，现有会话也随之失效。

然后启动：

```powershell
dotnet run --no-build --launch-profile http
```

访问 **http://localhost:5270/admin/**。端口沿用原有 `launchSettings.json`。
后台文件由 API 提供，不经过 Vite，也不放在 GitHub Pages；公开生日网站继续使用 Vite。
本阶段验证用服务已经关闭，须按上述命令重新启动后才能访问。

## 管理 API

所有 JSON 字段使用现有 ASP.NET Core camelCase 序列化。

| 方法与路径 | 说明 |
| --- | --- |
| GET /api/admin/csrf | 获取 `{token}` 并设置 CSRF Cookie；允许匿名，用于登录前令牌 |
| POST /api/admin/login | `{username,password}`，成功200 `{username,expiresAt}`，失败401，限流429 |
| GET /api/admin/me | 当前认证用户 `{username,expiresAt}`；未登录401 |
| POST /api/admin/logout | 撤销当前服务端会话并清除认证Cookie；成功204 |
| GET /api/admin/wishes | 愿望分页与筛选 |
| GET /api/admin/wishes/{id} | 完整详情；不存在404；查看不会自动标记已读 |
| GET /api/admin/wishes/unread-count | `{unreadCount,latestWishId}` |
| GET /api/admin/wishes/stats | `{totalCount,unreadCount,readCount,latestCreatedAt,latestWishId}`，不含正文 |
| PATCH /api/admin/wishes/{id}/read | 只将指定记录置为已读，返回实际数据库详情；不存在404，重复操作安全 |

除 `/csrf`、`/login` 外全部要求认证；匿名请求返回401，不重定向到HTML登录页。
对 `/api/admin` 下非 GET/HEAD/OPTIONS 操作验证 `X-CSRF-TOKEN`，因此登录、退出、标记已读均受保护。
登录后前端重新获取与新身份绑定的令牌；缺失、伪造或沿用匿名身份令牌返回400。
公开生日网站 CORS 来源不适用于管理接口，后台始终同源，不跨站传认证 Cookie。

分页参数：

- `page`：默认1，正整数。
- `pageSize`：默认20，范围1～100。
- `unreadOnly=true`：只看未读；false/未传表示不额外限制。
- `isRead=true`：只看已读；`isRead=false`：只看未读；未传表示全部。
- `unreadOnly=true&isRead=true` 冲突返回400；非法参数统一400验证响应。

列表返回：`{items,totalCount,currentPage,pageSize,totalPages}`。
每项为 `{wishId,createdAt,isRead,source,contentPreview}`，按 `CreatedAt DESC, WishId DESC` 排序。
SQL 仅返回 `LEFT(Content,100)` 预览，不传全部正文。
详情和标记已读回执为 `{wishId,content,createdAt,isRead,source}`。
时间在API中统一带UTC偏移，后台显示浏览器本地时间，原始UTC时间保留在元素提示中。
每次分页为当前数据库视图，并非跨多次请求冻结的快照。

## 数据访问与安全核对

继续复用 `SqlConnectionFactory`、连接池、Windows身份认证、超时与过滤索引需要的会话选项。
SqlClient 异步打开连接、读结果，使用 await using 释放，所有操作具有连接/命令/总超时。
页码转换为 BIGINT Offset，pageSize 参数严格限制；id使用BIGINT参数。
筛选SQL仅从三个固定字符串选择，不拼接任何用户输入。
未读条件使用固定 `IsRead = 0`，可利用既有 `IX_Wishes_Unread_CreatedAt` 过滤索引；
排序与既有 `IX_Wishes_CreatedAt_WishId` 一致，不添加或强制任何索引。
实际执行计划由SQL Server按数据量选择，本阶段没有声称对仅一条记录必然使用索引。

唯一新增业务写SQL为带 `WHERE WishId=@Id` 的 `UPDATE ... SET IsRead=1`，
通过 `OUTPUT INSERTED` 返回数据库实际结果，不影响其他编号；无 INSERT/DELETE/TRUNCATE/DDL。
公开提交仍由原服务处理，没有重写。本阶段未对真实连接执行该UPDATE。
SQL异常只记录错误编号或固定类别，不记录异常对象、SQL、连接字符串、密码或正文。
客户端接收固定安全提示与503/500等状态，不接收内部配置。

管理页面和响应使用 no-store、CSP、禁止嵌入、nosniff、no-referrer。
页面只从同源加载脚本/样式，无外部CDN、图片追踪或字体请求。
用户内容、来源、预览用 textContent 渲染，未使用用户输入拼接HTML。
服务端配置文件在 wwwroot 外，不能通过静态URL读取；管理HTML壳可匿名加载，但不包含任何愿望数据或凭据。
生产正式上线还需完整HTTPS与代理审查，本阶段未开放公网。

## 在线提醒与界面行为

独立奶油粉/玫瑰色界面，包含登录、四项统计、三种筛选、分页、详情、手动已读与退出。
密码支持显隐；登录中按钮禁用；写操作只由明确点击触发，无自动重试。
网络等待最多15秒；标记已读响应不能确认时提示重新打开详情核实，不伪造已读结果。

登录后每12秒只读查询统计，基于最新WishId的高水位判断新增。
页面隐藏、退出、会话过期时取消轮询；恢复可见时立即检查，无后台定时补发。
请求完成后再安排下一次检查，不堆积并发轮询。
每个浏览器标签会话按管理员名保存已见高水位（只有编号，无正文），避免同一编号重复提醒。
首次登录以当前摘要为基线，现有未读仍显示在统计/列表；提醒不自动展开正文、标记已读或播放声音。
旧轮询响应和旧会话延迟401不能覆盖已退出或重新登录后的状态。
关闭页面/电脑关机时不承诺提醒，已保存愿望仍留在SQL Server，下次上线可查看。

## 自动化与真实验证

| 检查 | 最终结果 |
| --- | --- |
| .NET编译 | 成功，0警告、0错误 |
| 后端测试 | 57项通过，包含原34项及新增23项；管理服务均替换为内存Fake |
| 前端测试 | 52项通过，包含原47项及新增5项轮询测试 |
| npm run build | 成功，29模块；JS 45.63 kB/gzip17.58，CSS31.41 kB/gzip8.78 |
| 管理浏览器测试 | 通过：登录失败/显隐/成功/过期/退出、统计、分页、筛选、详情、手动已读、XSS文本渲染 |
| 提醒测试 | 12秒隐藏暂停、可见恢复、高水位去重、退出停止、旧响应隔离通过 |
| 布局 | 320/390/1440px均无横向溢出，有桌面与手机截图 |
| 浏览器意外错误 | 0；模拟401等预期HTTP错误单独记录 |
| 浏览器真实API请求 | 0；所有管理请求在CDP层拦截，1次PATCH只修改浏览器测试内存 |
| 真实API只读检查 | health=200、database=healthy；/admin/和脚本200；匿名me/list=401；安全头有效 |
| 真实SQL只读检查 | BirthdayWebsiteDB=ONLINE；总数1、未读1、WishId=1且IsRead=0，时间/来源与原记录一致 |
| 原文件保护 | 45个受保护文件哈希不变；初始化SQL哈希仍为34655B75A410188E8BA298B0054709CB034B8FD7847C7B5F359BD75EA9279DDB |

Cookie撤销/旧Cookie重放、8小时过期、生产Secure、缺失配置、错误凭据、CSRF、匿名保护、
登录限流、分页约束、详情404、已读幂等与安全错误均通过隔离HTTP测试。
这些测试是实际ASP.NET Core认证管线加Fake数据服务，不是对真实数据库执行写入。
浏览器认证交互使用拦截响应；真实凭据登录及真实SQL已读更新没有执行。
真实SQL验证只读取统计/元数据，没有读取愿望正文。

运行：

```powershell
cd F:\ourweb
dotnet test BirthdayWebsite.sln --no-restore
cd frontend
npm test
npm run build
npm run test:browser:admin
```

测试证据：`.local/phase8-admin-browser-result.json`、`.local/phase8-live-readonly.json`、
`.local/phase8-database-readonly.txt`、`.local/phase8-protected-hashes.json`。
截图中的统计、正文、编号均为Mock，不代表真实数据库新增或修改：

- [登录页](screenshots/phase-8/01-login-desktop.png)
- [管理首页（Mock）](screenshots/phase-8/02-dashboard-mock.png)
- [愿望详情（Mock）](screenshots/phase-8/03-detail-mock.png)
- [手机页面（Mock）](screenshots/phase-8/04-dashboard-mobile-mock.png)

本次测试启动的API、静态服务和浏览器均已关闭。首次本机SDK构建时SDK提示自动建立开发证书；
没有执行证书信任命令，本阶段API仍只使用localhost HTTP。

## 用户手动事项与后续边界

1. 用上面的本机交互工具设置你自己的真实管理员凭据、检查本地文件权限并重启API。
2. 人工审阅界面和接口；需要真实管理员登录/数据库管理验收时另行安排。
   不要对WishId=1执行标记已读测试，不通过新增真实愿望验证本阶段功能。
3. 尚未实现多管理员、密码重置/找回、MFA、多实例共享会话、离线Web Push；当前要求的单管理员在线提醒已实现。
4. 音乐、正式情书/日期、HTTPS/代理、GitHub与公网部署留待后续。数据库备份和服务最小权限也未自动配置。

未执行任何真实写入、建库脚本、结构变更、Git提交/上传、隧道或部署。
本阶段完成后停止，等待人工审查。

参考：[Microsoft Cookie Authentication](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/cookie?view=aspnetcore-10.0)、
[CSRF防护](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0)、
[密码哈希](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/consumer-apis/password-hashing?view=aspnetcore-10.0)、
[Data Protection默认设置](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/default-settings?view=aspnetcore-10.0)。
