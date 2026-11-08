# 第十阶段10.3：Azure Blob私有音乐存储本地接入

## 交付边界与前置检查

本阶段完成本地代码与隔离测试，**没有创建Azure资源、上传文件或完成真实Azure集成验收**。未部署网站、创建Tunnel、修改DNS/SQL Server，未发送真实愿望POST/PATCH/DELETE，未操作WishId=1。

当前PowerShell的PATH及常见Azure CLI安装位置未找到az，未安装软件。因此`az account show`、`az account list`、`az storage account list`无法执行，登录、订阅和既有Storage Account均为**尚未确认**，不能推断没有订阅或没有已有资源。未读取或输出Token、Key或凭据。

项目没有已确认的未来托管平台、Azure区域、订阅、Storage Account名称或预算。云端操作已停止，需所有者提供这些信息，并在资源创建及8文件上传方案明确后分别批准；本报告不是资源创建授权。

## 存储架构与配置

浏览器继续只请求同源`/media/audio/{id}`、`/media/covers/{id}`。入口顺序保持：整站Access JWT验证 → 媒体授权 → Controller → IMediaStorage。未来Cloudflare Access/Tunnel只改变访问入口，不替代后端JWT验证。前端没有Azure账户、真实Blob地址、SAS或Key。

新增IMediaStorage分离GetInfoAsync元数据与OpenReadAsync范围读取。LocalMediaStorage包装原IPrivateMediaStore/LocalPrivateMediaStore，复用ID映射、原始文件路径与重解析点保护，不删除旧实现。AzureBlobMediaStorage使用官方Azure.Storage.Blobs **12.30.1**、Azure.Identity **1.21.0**。

| 环境/Provider | 行为 |
| --- | --- |
| Development，Provider为空或Local | 原本地audio源；仍需10.2的严格本机开发授权或有效JWT |
| Development，AzureBlob且配置有效 | Entra开发身份读取Blob，没有文件回退 |
| Production，AzureBlob且配置有效 | Azure Blob读取，必须先通过Access；不会读本地音频 |
| Production为空、Local、未知Provider或Blob配置缺失/无效 | 授权请求媒体503；未授权请求仍先返回401/403 |

真实配置可放入被忽略且禁止发布的`backend/BirthdayWebsite.Api/appsettings.Media.Local.json`，以新增`appsettings.Media.example.json`为参考，或使用环境变量：

```text
MediaStorage__Provider=AzureBlob
AzureBlob__ServiceUri=https://<ACCOUNT>.blob.core.windows.net
AzureBlob__ContainerName=birthday-private-media
AzureBlob__ManagedIdentityClientId=<可选，用户分配托管身份的Client ID>
```

ServiceUri只接受Azure公有云标准HTTPS账户根地址、443端口，无路径、用户信息、查询或片段。拒绝SAS、HTTP及任意外站地址。容器严格限定birthday-private-media。中国区/其他主权云及自定义域名不在当前允许范围，需要另行审查，不默默接受未知源。

本阶段没有生成真实本地Azure配置。现有`.gitignore`的`appsettings.*.Local.json`已覆盖媒体配置；csproj原有发布排除规则也有效。音频、旧public/audio、dist继续忽略，`.gitignore`无需修改。

## Azure身份与权限

DefaultAzureCredential用于无存储Key的Entra认证。Development保留CLI、PowerShell/Visual Studio等开发身份链；Production排除开发工具、交互、Broker和Environment客户端密钥认证，使用平台Workload Identity/Managed Identity，不使用长期Storage Account Key。托管平台尚未确定，因此未启用或创建任何托管身份。可选Client ID仅指定用户分配托管身份，不是密钥。

上传身份后续仅授予目标容器范围Storage Blob Data Contributor；运行身份仅Storage Blob Data Reader，两者分离。资源创建及角色分配所需控制平面权限另行审批，不能为了读取把Owner或Contributor授予运行身份。容器范围角色可按官方RBAC方式授予。[官方角色范围说明](https://learn.microsoft.com/en-us/azure/storage/blobs/assign-azure-role-data-access?tabs=azure-cli)

代码没有上传、建容器、生成SAS、读取账户Key或匿名Blob下载逻辑。Azure SDK客户端使用Bearer身份，诊断不记录正文，重试次数设为0，网络超时10秒，传递请求取消信号。敏感SDK异常被转换为固定媒体错误，不返回Blob主机名、SQL、Key、Token或原始错误正文。

网站Access与Azure Entra是不同边界：网站用户凭Access进入，后端凭自身读取身份访问Blob；浏览器不获得此身份。管理员Cookie、CSRF、会话、登录限流未弱化，女朋友没有被自动增加为管理员。

## Range与流式实现

GET/HEAD路由、歌曲ID及播放器URL完全保留。非法ID在存储调用之前404。GetPropertiesAsync读取长度、ETag和Last-Modified，不下载文件正文。

- HEAD：200，完整Content-Length/Content-Type、Accept-Ranges: bytes、无正文、无Blob GET；按HTTP语义忽略HEAD中的Range。
- GET无Range：200，通过BlobDownloadOptions.Range请求整段表示，边读取边向浏览器发送，不预载完整音频。
- 单段bytes起止、开放末尾、后缀Range：正规化到文件边界，206，正确Content-Range和Content-Length，只向Blob请求对应offset/count。
- 无法满足、格式错误、数字溢出、不支持的单位或多段请求：本接口返回416，Content-Range为bytes */总长度，正文长度0，不执行Blob下载。本实现只支持单段Range。
- If-Range匹配ETag/修改时间时继续206；不匹配发送当前完整表示200。Blob下载使用If-Match锁定元数据对应ETag，防止混合不同版本的长度与数据。
- Blob元数据404返回404；HEAD错误可能没有解析出的ErrorCode，按HTTP状态处理，不误判503。读取权限、服务异常、版本变化、网络/身份故障在响应发送前均返回通用503，没有本地回退。

流转发仅使用64KiB缓冲区，并严格限制传输count；不使用DownloadContent、整首MemoryStream或整首byte[]。Azure SDK DownloadStreamingAsync直接接收精确HttpRange，无需把远程流伪装成可定位的完整内存文件。[官方.NET流式下载与Entra接入说明](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-download)

**中途断网的实际限制：** HTTP响应已经发送200/206和部分字节后，服务器无法把状态改为503；此时终止连接，浏览器按媒体错误处理。若在正文开始前失败，则返回503。播放器保留现有曲目/彩蛋及进度，等待用户手动恢复，不伪造播放成功或自动切歌。不能声称任何中途错误都能改写为503。

音乐、封面及错误响应继续private, no-store；生产Cloudflare仍需整站缓存绕过。后续上传时也应在Blob对象设置对应Content-Type及private, no-store，不开启公开静态网站/CORS直链方案。

## 8文件上传计划与完整性

来源仅`F:\ourweb\audio`，实际歌曲使用用户已确认的现有版本，没有更换Cry For Me、曲目顺序或彩蛋条件。

| 歌曲ID | 类型 | 原文件名 | 稳定Blob名称 | 字节数 |
| --- | --- | --- | --- | ---: |
| cry-for-me | audio/mpeg | Cry For Me.Feat. 愛海.-Michita#2CbowT.mp3 | audio/cry-for-me.mp3 | 12,122,113 |
| cry-for-me | image/jpeg | Michita feat. AMIのPurenessからの楽曲Cry For Me (feat. 愛海)をAmazon Musicで.jpg | covers/cry-for-me.jpg | 539,139 |
| aitaiwa | audio/mpeg | 会いたいわ-iri#jkFrL.mp3 | audio/aitaiwa.mp3 | 10,735,408 |
| aitaiwa | image/jpeg | ＜コラム＞iriが『Mステ』初出演、バイラルヒット「会いたいわ」がもたらした“揺るぎない自信” _ Special _ Billboard JAPAN.jpg | covers/aitaiwa.jpg | 172,760 |
| danger | audio/mpeg | 迷人的危险-Dance+Flow#bgzW.mp3 | audio/danger.mp3 | 8,243,327 |
| danger | image/jpeg | 迷人的危險 - dance flow_ Song Lyrics, Music Videos & Concerts.jpg | covers/danger.jpg | 73,478 |
| kataomoi | audio/mpeg | カタオモイ-Aimer#gfokU.mp3 | audio/kataomoi.mp3 | 8,297,742 |
| kataomoi | image/jpeg | ”カタオモイ” by Aimer - トラック・歌詞情報 _ AWA.jpg | covers/kataomoi.jpg | 77,495 |

合计40,261,462字节，约38.40MiB / 0.03750GiB。完整路径、大小和8个SHA-256保存在`docs/phase-10-3-media-manifest.json`。所有条目均为NOT_UPLOADED，RemoteSHA256为null，不把本地哈希误当成云端校验成功。

原始8文件和旧public/audio副本均未改名、删除、压缩或覆盖。与本阶段开始快照逐一比对，原始/前端照片、frontend/src（包括日期、正式情书、播放器、五场景）、原始/旧副本媒体没有变化。SQL脚本SHA-256仍为34655B75A410188E8BA298B0054709CB034B8FD7847C7B5F359BD75EA9279DDB。

## 自动化与浏览器测试

| 检查 | 结果 |
| --- | --- |
| 后端编译 | 0警告、0错误 |
| 后端测试 | 171项通过，0失败、0跳过；原131项保留，新增40项 |
| 前端测试 | 原69项全部通过，未删除或改写产品测试 |
| 前端构建 | 成功，32模块；dist只有页面、JS/CSS、favicon及11张照片，无歌曲或私人封面 |
| Blob SDK Mock测试 | 8映射200/HEAD与SHA-256一致；精确起止/后缀/开放末尾206；非法/超范围/多段416；无正文下载；404/403/500/ETag变化安全处理 |
| 认证 | 没JWT401、第三邮箱403、过期JWT401、伪造邮箱头401；存储调用次数0；原管理员/CSRF测试通过 |
| Production安全失败 | 空配置、Local、空URI、HTTP、SAS查询、恶意域名均503；原文件存在也不回退 |
| 本地完整性与扫描 | Manifest8个SHA-256匹配；前端源码/构建文本/配置示例的存储Key、SAS、私钥模式扫描通过；本地配置被Git忽略 |
| 媒体边界 | Vite dev/preview的8资源GET/HEAD/206、旧直链阻断、11照片完整；真实写入0 |
| 五场景与播放器 | 实际本地MP3解码、时长、四封面、15%音量、自动播放降级、暂停/继续/进度/循环、彩蛋关闭重开/结束恢复、照片列车、开信、蛋糕/吹气、草稿、减少动态效果、320/390/1440与子路径通过；API请求0，控制台/资源错误0 |
| 愿望与后台浏览器 | 8次Mock POST、35次Mock管理请求（含1次Mock PATCH），真实API写入0；unknown、防重复、草稿、分页/提醒/退出通过 |

新测试使用真实Azure SDK、真实本地RSA JWT验证器，Blob HTTP传输、Entra Credential、JWKS和数据库均为测试替身；不依赖Azure资源、Azurite或真实数据库。认证测试替身仅存在测试程序集。原Cloudflare测试的媒体fixture明确使用测试专用LocalMediaStorage；新增测试使用实际Production DI选择逻辑验证不能回退。

“匿名Blob直链拒绝”目前只验证Mock私有容器契约和后端始终使用Bearer；**未验证真实账户的AllowBlobPublicAccess或真实匿名直链**。上传后的独立云端SHA-256、真实Entra/RBAC、真实Access、Azure端拖动延迟、Safari/iPhone/Android播放仍为待验收项。浏览器回归使用Edge手机尺寸模拟及本地文件源，不能冒充Safari或真机Blob验收。

本次复用了现有浏览器脚本，因此刷新了`docs/screenshots/phase-10-2/`的18张测试截图；同一批证据另复制到`docs/screenshots/phase-10-3/`。机器结果副本为`.local/phase10-3-*-result.json`，保留原JSON的源截图目录字段以便追溯，不伪造为另一次云端运行。既有场景、音乐及管理UI未修改。

测试中先发现Mock的404正文/头不一致，修正后进一步确认SDK在HEAD失败时ErrorCode可为null；最终按404状态兼容。另修正StringSegment的大小写比较参数类型，最终编译0警告0错误。没有通过删除断言或测试获得通过。

复现（先构建前端，以便原认证测试验证真实dist文件）：

```powershell
cd F:\ourweb\frontend
npm test
npm run build
cd F:\ourweb
dotnet test BirthdayWebsite.sln --artifacts-path F:\ourweb\.local\phase10-3-artifacts -p:UseAppHost=false
dotnet build BirthdayWebsite.sln --artifacts-path F:\ourweb\.local\phase10-3-artifacts --no-restore -p:UseAppHost=false
cd frontend
npm run test:media
npm run test:browser
npm run test:browser:api
npm run test:browser:admin
```

测试服务使用独立动态回环端口，显式Database=false、空管理员凭据、Local Provider。用户现有5270 API未停止或替换；运行中的旧API需要所有者审查后重新启动才能加载本阶段代码。

## 资源规划与费用构成（待批准）

| 项目 | 计划/当前状态 |
| --- | --- |
| 订阅/租户 | 未确认 |
| 区域 | 未确认，应与未来后端尽量同区，需用户选择 |
| 托管平台/身份 | 未确认，不擅自假定App Service |
| Storage Account名称 | 未确认；需全局唯一小写字母数字3–24字符 |
| 类型 | Standard GPv2 / StorageV2，Blob，Hot |
| 冗余 | Standard_LRS |
| 容器 | birthday-private-media，Private |
| 账户安全 | AllowBlobPublicAccess=false，HTTPS only，TLS最低1.2；建议禁用Shared Key，使用Entra |
| 浏览器访问 | 仅经后端，不给SAS、不公开Blob URL，不为播放器启用Blob跨域访问 |
| 上传权限 | 单独上传身份，容器范围Storage Blob Data Contributor |
| 运行权限 | 未来应用身份，容器范围Storage Blob Data Reader |
| 预算/收费审批 | 未确认，未发生资源创建/上传 |

不提供虚构固定月费。预估须按最终区域、币种、订阅折扣及预算表核算：

- 存储容量：约0.03750GiB × 所选区域Hot LRS容量单价/月；软删除、版本等保留内容会增加容量。
- 请求：初始8文件上传及8文件独立校验；运行时HEAD/GetProperties和GET/Range读取。每次拖动可能增加请求，当前不做公共缓存。
- 流量：Blob到后端，以及后端到用户的适用出站/跨区费用；完整读取8资源一次约40.26MB，按实际播放次数和字节范围累计，不是假定包月免费。
- 其他：未来后端托管、监控日志、可选Private Endpoint/网络组件、数据库属于额外预算，未创建且不能混称为Blob免费项目。

具体金额待区域/平台/订阅确认后使用[Azure Blob官方定价](https://azure.microsoft.com/en-us/pricing/details/storage/blobs/)和计算器形成审批表。不能把资源很小等同于全部架构免费。

## 后续真实云端操作步骤（本次未执行）

1. 所有者确认CLI安装/可执行路径，完成Azure登录；只读核对订阅与Storage Accounts，不输出Token/Key。若需安装CLI，另行授权，不在本阶段自行安装。
2. 确认订阅、租户、区域、账户名、托管平台、身份及预算，再展示明确创建计划与费用构成，获得资源创建批准。
3. 按批准方案创建或复用StorageV2/Hot/LRS，核对HTTPS、TLS≥1.2、账户禁匿名、容器Private。Entra/RBAC按容器分离上传与读取身份，不给后端写权限。若需Private Endpoint等额外收费网络组件，单独审批。
4. 再次向用户展示本报告8文件清单、大小及哈希、目标账户/容器、权限和预计影响，得到**文件上传批准**。没有批准不得执行下一步。
5. 上传前重新计算8个SHA-256并与清单匹配，只用固定Blob名称和正确Content-Type，不上传其他目录/配置/数据库文件。采用条件创建防止默默覆盖已有Blob，遇到已存在对象先报告。
6. 用独立读取请求下载到私有临时目录或流式计算SHA-256，逐个比较，不以Blob元数据里自报的哈希代替独立校验；生成单独真实上传/下载校验报告。不修改原始文件。
7. 以无身份HTTP请求验证真实Blob直链被拒绝，检查没有公开容器、SAS或其他备用公开路径；保存只含安全状态的证据。
8. 配置后端Entra运行身份和被忽略的媒体配置，保持Production、Access JWT及管理员认证；验证200/HEAD/206/416和权限撤销/过期/503，检查日志与无公共缓存。最终进行Safari/iPhone、Android Chrome及真实网络中断恢复验收。
9. Tunnel、源站网络封闭、生产数据库迁移和真正公网部署仍按后续阶段单独授权；不可为方便测试切换公开Development或暴露1433。

私人访问控制不自动取得音乐/封面传播授权。原始素材保持，本阶段无公开发布。

## 完整修改文件清单

新增：

- backend/BirthdayWebsite.Api/Media/IMediaStorage.cs
- backend/BirthdayWebsite.Api/Media/LocalMediaStorage.cs
- backend/BirthdayWebsite.Api/Media/MediaStorageOptions.cs
- backend/BirthdayWebsite.Api/Media/AzureBlobMediaStorage.cs
- backend/BirthdayWebsite.Api/Media/MediaStreamResult.cs
- backend/BirthdayWebsite.Api/appsettings.Media.example.json
- backend/BirthdayWebsite.Api.Tests/AzureBlobMediaTests.cs
- docs/phase-10-3.md
- docs/phase-10-3-media-manifest.json
- docs/screenshots/phase-10-3/下18张测试截图（与本轮复用脚本输出一致）

修改：

- backend/BirthdayWebsite.Api/BirthdayWebsite.Api.csproj（官方Azure SDK直接依赖）
- backend/BirthdayWebsite.Api/Program.cs（媒体配置/DI，入口认证顺序不变）
- backend/BirthdayWebsite.Api/Controllers/MediaController.cs（元数据、显式单段Range与流结果）
- backend/BirthdayWebsite.Api.Tests/CloudflareAccessTests.cs（仅fixture存储注入及新增测试可选配置钩子，原断言保留）
- frontend/tests/local-media-server.mjs（改为10.3隔离产物，显式Local/禁SQL）
- README.md
- docs/screenshots/phase-10-2/下原18张浏览器测试证据被本轮脚本刷新；不是原始素材。

未修改前端产品源码、歌曲/封面/照片原文件、10.2认证实现、管理员业务/界面、SQL服务及建库脚本、数据库记录、Git远程或系统配置。构建与还原产物位于忽略目录，未创建提交或上传。完成本地交付后停止，等待人工审查及云资源审批。
