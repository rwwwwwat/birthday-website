# 第十阶段10.2：Cloudflare Access身份验证与后端安全接入

本阶段只修改本地代码、测试及文档。尚未创建Access应用或Tunnel，未配置DNS、Azure、远程仓库或公网部署。测试证明本地JWT验证逻辑正确，不能据此声称已经完成真实Cloudflare身份验证。

## 1. 实现范围

在ASP.NET Core入口增加`PrivateSiteMiddleware`，顺序为异常处理 → 私人网站身份验证 → 状态页/请求限制/媒体保护 → 路由/认证/CSRF → 静态文件/Controller。所有请求均受入口验证，包括HTML、JS/CSS、11张照片、8个媒体接口、愿望API、后台页面及管理API、健康检查。没有匿名数据库健康入口；未通过验证的未知路径同样不返回私人资源。

Production缺少有效配置时，所有受保护请求返回401；不降级匿名。验证后的邮箱不在白名单返回403。拒绝响应是固定ProblemDetails，不跳转登录页，不把登录HTML伪装成音乐或图片。HEAD不返回错误正文。

构建后的前端由后端同源提供。Production必须设置`PrivateSite:FrontendRootPath`，Development默认使用项目`frontend/dist`。额外限制前端文件路径：仅首页、favicon、11个已知照片文件、assets中的JS/CSS，误配目录也不能暴露服务器JSON配置。原有`wwwroot/admin`也位于入口保护之后。音乐不进入dist，原始媒体仍由ID白名单服务读取。

## 2. JWT验证

使用成熟的`Microsoft.IdentityModel.JsonWebTokens`8.16.0及IdentityModel验证API；该版本已由现有依赖间接使用，本阶段显式声明直接依赖，没有自行实现签名算法。

- 只读取单一`Cf-Access-Jwt-Assertion`请求头，不相信邮箱或转发头。
- 限制JWT大小16KiB，拒绝加密令牌、缺失kid及过长kid。
- 仅接受RS256、RSA至少2048位公钥；拒绝none、HS256、RS512等其他算法。
- 验证实际签名、精确Issuer和Audience；不宽松忽略Audience尾斜杠。
- 必须有Expiration；验证过期及令牌包含的Not Before，ClockSkew为0，因此服务器时间必须准确。
- 不信任令牌自带的公钥URL，只使用服务器配置派生的官方JWKS地址。
- JWT有效后要求恰好一个非空、合法且在白名单内的email声明。
- 不记录JWT、Cookie、完整认证请求、公钥原始响应或认证异常对象；固定响应不泄露验证细节。

`TeamDomain`仅允许一个团队标签的`https://<team>.cloudflareaccess.com`（也可配置裸主机名）。拒绝HTTP、其他域名、非443端口、用户信息、路径、查询及片段，防止任意JWKS地址访问。

## 3. JWKS获取与缓存

地址为`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`。专用HttpClient不跟随重定向、不发送或保存Cookie，不转发请求JWT。下载包括读取正文总超时5秒，正文最多64KiB、最多32把公钥；无合格公钥或重复kid视为失败。

公钥缓存15分钟。并发请求通过单一刷新锁合并；已知且未过期的公钥继续进行完整签名验证。首次遇到未知kid可立即刷新一次，后续未知kid刷新间隔至少30秒；网络或格式错误也等待30秒再尝试。没有过期公钥兜底、没有网络失败绕过。未过期已缓存公钥可在短暂网络故障期间继续验证；过期后获取失败则拒绝。配置固定读取，修改后需要重启。

## 4. 双邮箱与管理员权限

配置必须恰好两个不同的完整邮箱。比较仅去除首尾空白并统一大小写，不允许整个邮箱域、通配符、显示名称、空值或归一化后重复。不会擅自去除邮箱中的点或加号别名。真实邮箱没有写入代码或示例。

Access身份存放在单独HttpContext feature，不写入管理员`HttpContext.User`。管理接口仍使用原来的AdminCookie认证、密码哈希、8小时绝对会话、服务端退出撤销、CSRF及登录限流。Access通过但未登录管理员仍返回401；仅持有管理员Cookie却没有Access身份也被入口拒绝。本阶段没有增加管理员账号，没有改写管理员业务或SQL服务。

## 5. 环境隔离

Production无论配置怎样的开发开关，都不能使用本机绕过。未配置、无效配置、伪造邮箱头、缺少JWT均拒绝。不存在Production测试密钥或可开启测试认证的环境变量。

Development须同时启用`CloudflareAccess:AllowDevelopmentLoopback`及原有`Media:AllowDevelopmentLoopback`，并满足来源和目的IP、Host均为回环、无转发/Cloudflare代理头、Origin为回环且不是外站请求。局域网连接不能绕过。即便本机请求，只要显式携带了无效JWT，也不能回退开发认证。

自动化测试替身位于测试程序集；原有API/Admin测试仅替换入口身份验证器以继续隔离验证原业务。新增Production认证测试使用真实RSA签名及真实JWT验证器，JWKS由内存HTTP传输替身提供，数据库服务均为替身，不联系Cloudflare或真实数据库。

## 6. 配置方式与当前缺项

新增`backend/BirthdayWebsite.Api/appsettings.Access.example.json`，全部真实参数为空。可以由所有者在服务器建立`appsettings.Access.Local.json`，或使用以下环境变量：

```text
CloudflareAccess__TeamDomain
CloudflareAccess__Audience
CloudflareAccess__AllowedEmails__0
CloudflareAccess__AllowedEmails__1
PrivateSite__FrontendRootPath
ASPNETCORE_ENVIRONMENT=Production
```

当前尚未提供TeamDomain、应用AUD及两个真实邮箱，未创建真实Access本地配置。`.gitignore`原有`appsettings.*.Local.json`已覆盖该文件，项目发布规则也排除本地配置，无需放宽忽略规则。示例可跟踪，实际配置不可上传。前端不保存Access Token、数据库配置或管理员凭据。

Development启动方法保持现有`dotnet run --launch-profile http`。构建前端后，本机API也可提供完整网站。运行中的旧5270进程没有被终止；人工审查后须由所有者重新启动，旧进程不能证明新逻辑生效。

## 7. 前端兼容及缓存

愿望请求继续使用`credentials: same-origin`、`redirect: error`、`cache: no-store`，正式前端与API应使用同一HTTPS源；Vite开发代理仅用于本机。401明确提示重新验证、403提示使用允许邮箱，均保留草稿，不自动重发。超时、网络错误、重定向或无法确认的响应仍进入unknown保护，不解除提交锁。

音频与封面同源加载，由浏览器携带适用Cookie；浏览器不应自行构造或持有Access JWT。音乐加载失败保留原普通/彩蛋进度，提示检查网络或重新验证后手动播放，不自动循环重试、不重建播放器。原默认歌曲、15%音量、四首歌/封面、第一次合照彩蛋及歌单恢复逻辑未改写。

入口统一设置`Cache-Control: private, no-store`，另有Pragma、nosniff及no-referrer；覆盖允许和拒绝响应、照片、媒体及Range响应。后续还必须在Cloudflare配置整站缓存绕过，避免边缘规则覆盖源站策略；不得开启Cache Everything或将私人媒体另行公开。

## 8. 测试结果与复现

- 后端编译：0警告、0错误。
- 后端：131项通过、0失败、0跳过；包含原85项及新增46项，不删除原测试。
- 前端：69项通过、0失败；包含原67项及新增401/403提示与同源Cookie测试。
- 前端构建成功，32个模块；构建资源检查通过，dist没有歌曲或私人封面。
- Production测试覆盖缺失/格式/签名/算法/kid/Issuer/Audience/有效期错误、第三邮箱/空邮箱/缺失邮箱、两个允许邮箱、伪造头、缺失配置、静态文件绕过、全部11照片/4音频/4封面拒绝、管理权限分离、缓存/刷新/故障/并发及日志不含Token/Cookie。
- 有效JWT下媒体206、416与GET/HEAD正常；Development本机与非本机隔离保持。
- 媒体边界浏览器测试通过：dev和preview的8资源HEAD/GET/206，旧audio及原始文件直链阻断，11张照片保留。
- 愿望浏览器测试通过：8次POST均被拦截到`.invalid`模拟地址，真实POST为0；成功、防重复、草稿、unknown、429/503及刷新锁正常。
- 管理后台浏览器测试通过：35次请求、1次PATCH均为浏览器模拟，真实管理API请求为0；登录/退出/过期、分页、CSRF、提醒和320/390/1440布局正常。
- 五场景同源浏览器回归通过：实际MP3解码与时长、四张封面、自动播放被阻止后的用户点击降级、15%音量、切歌和循环、第一次合照从0开始彩蛋、关闭/重开不重启、结束继续歌单并保留书签、不立即重复、手动退出彩蛋均正常。照片列车与10张照片放大归位、开信/逐字/回看、20岁蛋糕、按钮/合成麦克风吹气与权限拒绝/释放、愿望草稿和unknown保护、320/390/1440布局、减少动态效果、同源刷新及子路径测试均通过。API请求0、JS和资源错误0。截图位于`docs/screenshots/phase-10-2/`；这些是桌面Edge手机尺寸模拟及合成麦克风测试，不是两部真手机或真实麦克风验收。

浏览器测试迁移到后端同源时，首次发现测试错误地期待另一个预览地址读取之前地址的sessionStorage；已将测试改为分别在两个源通过UI保存草稿，再验证各自刷新/子路径保留，没有改动产品草稿逻辑或放宽断言。

保护文件哈希与本阶段开始时快照对比：原始`audio/`8个文件、旧`frontend/public/audio/`8个副本、原始/前端照片、`myneed.md`、配置中的正式日期/情书/祝福、场景和CSS、SQL服务、管理员静态文件及本地配置均无变化。数据库脚本SHA-256仍为`34655B75A410188E8BA298B0054709CB034B8FD7847C7B5F359BD75EA9279DDB`。没有连接真实SQL Server，没有修改或查询WishId=1；本阶段未运行任何真实写入请求。忽略规则实测覆盖`audio/`、旧公开音频副本、dist及`appsettings.Access.Local.json`。

在项目根目录运行隔离后端测试及编译，避免覆盖用户正在运行的5270进程文件：

```powershell
dotnet test BirthdayWebsite.sln --artifacts-path F:\ourweb\.local\phase10-2-artifacts --no-restore -p:UseAppHost=false
dotnet build BirthdayWebsite.sln --artifacts-path F:\ourweb\.local\phase10-2-artifacts --no-restore -p:UseAppHost=false
cd F:\ourweb\frontend
npm test
npm run build
npm run test:media
npm run test:browser
npm run test:browser:api
npm run test:browser:admin
```

浏览器使用独立动态回环端口及专用Edge配置目录，显式禁用数据库并清空管理员凭据，不接触现有5270服务。测试结果JSON位于被忽略的`.local/phase10-2-*-result.json`，截图可供人工审查。

## 9. 完整代码与文档变更清单

新增：

- `backend/BirthdayWebsite.Api/Security/CloudflareAccessOptions.cs`
- `backend/BirthdayWebsite.Api/Security/ISiteAccessVerifier.cs`
- `backend/BirthdayWebsite.Api/Security/ICloudflareSigningKeys.cs`
- `backend/BirthdayWebsite.Api/Security/CloudflareSigningKeys.cs`
- `backend/BirthdayWebsite.Api/Security/CloudflareAccessVerifier.cs`
- `backend/BirthdayWebsite.Api/Security/PrivateSiteMiddleware.cs`
- `backend/BirthdayWebsite.Api/Security/PrivateFrontendAssets.cs`
- `backend/BirthdayWebsite.Api/Media/SiteMediaAuthorizer.cs`
- `backend/BirthdayWebsite.Api/appsettings.Access.example.json`
- `backend/BirthdayWebsite.Api.Tests/CloudflareAccessTests.cs`
- `backend/BirthdayWebsite.Api.Tests/IsolatedSiteAccess.cs`
- `docs/phase-10-2.md`

修改：

- `backend/BirthdayWebsite.Api/Program.cs`
- `backend/BirthdayWebsite.Api/BirthdayWebsite.Api.csproj`
- `backend/BirthdayWebsite.Api/appsettings.Development.json`
- `backend/BirthdayWebsite.Api.Tests/ApiFactory.cs`
- `backend/BirthdayWebsite.Api.Tests/AdminApiTests.cs`
- `frontend/src/js/services/wishesApi.js`
- `frontend/src/js/components/music-view.js`（仅网络/身份失效提示）
- `frontend/tests/wishes-api.test.js`
- `frontend/tests/local-media-server.mjs`
- `frontend/tests/browser-check.mjs`
- `frontend/tests/api-browser-check.mjs`
- `frontend/tests/media-boundary-check.mjs`
- `frontend/tests/admin-browser-check.mjs`
- `README.md`

生成的验证截图共18张：主目录10张（音乐手机/桌面、登录手机/桌面、回忆手机/320、情书手机、蛋糕、庆祝、信箱），api目录4张（投递中/成功模拟/服务错误模拟/unknown模拟），admin目录4张（登录/列表/详情/手机列表模拟）。构建、测试缓存及本机结果文件位于已忽略目录，不是发布素材。原始素材、确认的文案日期、五场景、CSS、管理员前端和业务服务、SQL脚本均保持不变。

## 10. 后续真实Cloudflare配置步骤（仅说明，未执行）

1. 所有者提供域名、团队域名、Access应用AUD及两个邮箱，经批准后创建覆盖整站全部路径的Self-hosted Access应用。Allow策略只列两个完整邮箱，不设置照片、JS、媒体或API的Bypass规则。
2. 将真实配置安全放入源站环境变量/本地配置，Production启动；验证未配置时401，再用真实Access登录验证签发的JWT、双邮箱及过期退出行为。
3. 配置获批准的命名Tunnel及正确团队/AUD的Protect with Access作为额外防线；应用仍保留独立JWT验证。不能只依赖Tunnel或转发邮箱头。
4. 部署同源前端、API、照片和私有媒体，避免公开GitHub Pages、对象存储链接、备用源站域名、部署槽或预览URL形成旁路。关闭不必要的源站公网入口，只允许受控Tunnel/网络通道，绝不暴露SQL Server1433。
5. 源站链路须安全处理HTTPS、Host和明确受信任的代理；当前没有盲目信任X-Forwarded-*。现有管理员Production HTTPS/Secure检查未弱化，Tunnel的外部HTTPS到内部HTTP需后续严格限定代理配置后验证，不能为了运行切换Development。
6. 配置Cloudflare整站缓存绕过并检查所有资源响应，确认Cookie、Range、Access重验证、手机拖动、管理员Cookie和CSRF。禁止记录JWT/Cookie，妥善保护本地配置。
7. 验证真正的第三邮箱、直接源站、源站备用地址均不能取资源；保留独立管理员认证，再经用户明确授权进行真实愿望写入和双手机验收。

JWT是可在有效期内使用的身份凭证，X-Forwarded-For、邮箱头和请求IP不是身份凭证。应用验证不等于源站网络已封闭，也不能保证已泄露的有效Token无法被重放；HTTPS、访问策略、会话和入口限制必须共同落实。

当前SQL仍为本机Windows认证，云端数据库迁移、生产连接证书及媒体持久化尚未实施，不能宣称可直接正式上线。私人身份验证仅限制访问范围，不自动赋予音乐或封面的版权传播许可。

官方参考：[Cloudflare Access JWT验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)。
