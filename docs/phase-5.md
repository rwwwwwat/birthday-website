# 第五阶段：SqlClient 联通与愿望提交服务

## 实现

- 在现有API结构中复用WishesController、IWishService、DatabaseOptions。
- 保留UnavailableWishService作为Database.Enabled=false时的拒绝服务实现。
- 新增SqlConnectionFactory、SqlWishService、SqlDatabaseHealthProbe及安全异常处理。
- SqlClient每次租用连接池连接时设置过滤索引要求的七项会话选项。
- 池容量上限50；连接/命令各5秒，操作总超时10秒；取消请求传播，不自动重试写入。
- 不执行数据库结构初始化。原数据库脚本SHA-256保持
  `34655B75A410188E8BA298B0054709CB034B8FD7847C7B5F359BD75EA9279DDB`。

## 本阶段文件清单

新增：

- `BirthdayWebsite.sln`
- `backend/BirthdayWebsite.Api/Data/SqlConnectionFactory.cs`
- `backend/BirthdayWebsite.Api/Models/WishContentRules.cs`
- `backend/BirthdayWebsite.Api/Models/WishCreatedResponse.cs`
- `backend/BirthdayWebsite.Api/Services/SqlWishService.cs`
- `backend/BirthdayWebsite.Api/Services/DatabaseUnavailableException.cs`
- `backend/BirthdayWebsite.Api/Services/IDatabaseHealthProbe.cs`
- `backend/BirthdayWebsite.Api/Services/SqlDatabaseHealthProbe.cs`
- `backend/BirthdayWebsite.Api/Middleware/SafeExceptionHandler.cs`
- `backend/BirthdayWebsite.Api/appsettings.Local.json`（仅本机，Git忽略）
- `backend/BirthdayWebsite.Api.Tests/BirthdayWebsite.Api.Tests.csproj`
- `backend/BirthdayWebsite.Api.Tests/UnitTest1.cs`（实际类名WishContentTests）
- `backend/BirthdayWebsite.Api.Tests/ConnectionConfigurationTests.cs`
- `backend/BirthdayWebsite.Api.Tests/ApiFactory.cs`
- `backend/BirthdayWebsite.Api.Tests/ApiTests.cs`
- `docs/phase-5.md`

修改：

- `backend/BirthdayWebsite.Api/BirthdayWebsite.Api.csproj`
- `backend/BirthdayWebsite.Api/Program.cs`
- `backend/BirthdayWebsite.Api/Controllers/WishesController.cs`
- `backend/BirthdayWebsite.Api/Controllers/HealthController.cs`
- `backend/BirthdayWebsite.Api/Data/DatabaseOptions.cs`
- `backend/BirthdayWebsite.Api/Models/CreateWishRequest.cs`
- `backend/BirthdayWebsite.Api/Models/HealthResponse.cs`
- `backend/BirthdayWebsite.Api/Services/IWishService.cs`
- `backend/BirthdayWebsite.Api/Services/UnavailableWishService.cs`
- `backend/BirthdayWebsite.Api/appsettings.json`
- `backend/BirthdayWebsite.Api/appsettings.Local.example.json`
- `backend/BirthdayWebsite.Api/BirthdayWebsite.Api.http`
- `docs/verify-api.ps1`
- `README.md`

未修改前端、数据库脚本、原始需求和图片；没有删除原有代码文件。

## 本地连接配置

`backend/BirthdayWebsite.Api/appsettings.Local.json` 已生成并被Git忽略。
它通过Windows身份连接本机SQLEXPRESS的BirthdayWebsiteDB，不含SQL账号密码。
`Database.Enabled=true` 启用真实服务，默认公开appsettings.json为false，避免未配置环境意外启用。
环境变量 `ConnectionStrings__BirthdayDatabase` 可覆盖连接字符串，
`Database__Enabled` 可覆盖开关。TrustServerCertificate仅在Development被允许。
本地配置不复制到发布产物；后续部署必须重新确定证书、Host和CORS来源。

## 接口

### POST /api/wishes

仅接受 `{"content":"愿望正文"}`。拒绝空、纯Unicode空白、非字符串、缺失字段、
格式错误及额外字段（包含客户端Source/CreatedAt/IsRead）。最大2000个UTF-16代码单元，
例如1000个普通补充平面Emoji占2000单元；不Trim、不截断。请求体上限16 KiB。

参数化INSERT只传Content与服务器固定Source。CreatedAt、IsRead不出现在INSERT列中，
由数据库SYSUTCDATETIME()和0的默认约束生成。OUTPUT INSERTED读取真实生成值，
结果读取完毕且显式事务提交成功后返回201。响应包含wishId、createdAt（UTC）、isRead、source，
不回显正文。未开放公共详情接口，所以不提供虚假的Location地址。

400为验证失败；413为正文过大；429为限流；503为数据库不可用或操作超时。
错误使用ProblemDetails/ValidationProblemDetails，附traceId，不附SQL或异常细节。
每个实际连接IP每分钟最多5个提交请求，不排队；无效提交同样占额度。
不信任客户端X-Forwarded-For。未来隧道部署时需专门配置可信代理。

网络或超时发生在提交确认附近时，可能无法确定写入最终状态，因此不自动重试。
当前没有幂等键机制；前端接入与重试策略需在后续阶段设计。

### GET /api/health

真实SQL连接及SELECT 1成功时200：status=ok、database=healthy。
连接失败或超时则503：status=degraded、database=unavailable。
均不返回实例、账号或连接字符串。健康检查不读写Wishes内容。

### 仍关闭的接口

GET /api/admin/wishes、GET /api/admin/wishes/unread-count、
PATCH /api/admin/wishes/{id}/read仍统一401；管理员登录预留仍503。
没有公共愿望列表或详情；不存在已完成的管理员认证。

## 测试结果（2026-10-31）

- API编译通过，0警告、0错误。
- 34项自动化测试全部通过：8项规则/配置单元测试，26项隔离HTTP测试。
- 每个HTTP测试均替换IWishService和IDatabaseHealthProbe；201只验证替身服务的响应契约。
- 覆盖Unicode空白、UTF-16边界、超长Emoji、非法JSON、额外字段、保存失败503、
  健康200/503、请求413、限流429/Retry-After、精确CORS及管理访问限制。
- 真实本机API健康检查：HTTP200，database=healthy，证明SqlClient正常连接并完成SELECT 1。
- 仅修改测试进程的连接环境变量指向不可用本机端口后，真实健康检查返回503，未修改SQLServer。
- 本机API无效参数返回400；管理接口401；两项CORS允许本地来源，非信任来源不返回允许头。
- SQL只读计数：测试前0条、测试后0条。没有执行真实POST有效愿望。
- 初次VSTest被沙箱通信限制中止，沙箱外重新运行后34项通过。
- 临时API测试进程均在验证后关闭。没有全局安装或升级软件。

## 尚未完成及需要确认的事项

- 真实INSERT/OUTPUT/提交的端到端验收尚未执行，需要所有者单独批准。
- 建议验收内容：一次有效POST，愿望内容明确标记为验收测试；预期新增1条持久记录，
  检查201、UTC时间、IsRead=0和固定Source，再只读核查元数据与记录数；不自动删除记录。
- 前端真实提交接入、幂等策略、管理员认证/后台/在线提醒、正式隧道与公网部署均未执行。
- 当前API使用启动进程的Windows身份；未来后台服务账号需要单独配置最小权限。
- 代码与配置文件明细见本次交付报告；第三阶段文档保留为历史记录。

## 参考

- https://learn.microsoft.com/en-us/sql/connect/ado-net/sql-server-connection-pooling
- https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit?view=aspnetcore-10.0
