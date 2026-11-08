# 第十阶段10.1：本地私有媒体接口

本阶段完成本机实现。四首歌、四张封面、歌单顺序、默认Cry For Me、15%音量、UI、
第一次合照彩蛋、五个场景、照片列车、文案和动画均保留。
没有连接真实数据库、执行愿望写入、操作WishId=1、创建云资源、隧道、DNS或上传。

## 实际接口与读取方式

GET或HEAD：

| 歌曲ID | 音频 | 封面 |
| --- | --- | --- |
| cry-for-me | /media/audio/cry-for-me | /media/covers/cry-for-me |
| aitaiwa | /media/audio/aitaiwa | /media/covers/aitaiwa |
| danger | /media/audio/danger | /media/covers/danger |
| kataomoi | /media/audio/kataomoi | /media/covers/kataomoi |

MediaCatalog在服务器端将四个固定ID映射到8个原始文件，不接受路径参数、任意文件名或目录浏览。
默认Development源目录为 `F:\ourweb\audio`，按后端项目ContentRoot的上两级解析。
保持所有原文件名称及内容，包括#、日文和全角标点。前端只知道ID、曲名与同源接口地址。

IPrivateMediaStore返回只读、可定位的流；LocalPrivateMediaStore只打开现有原文件，不写文件、不压缩。
媒体源拒绝wwwroot内部目录及所选文件/源目录的符号链接或重解析点。
未来可替换Blob实现，但必须真正支持范围读取/可定位流，不能用不可定位流伪装支持Range。

FileStreamResult由ASP.NET Core处理Content-Type、Content-Length、Last-Modified、HEAD、
Accept-Ranges、206及超出文件范围的416，并负责释放流。
当前支持单段及后缀字节范围；不自定义多段Range行为，使用框架标准处理。
音频类型为audio/mpeg，封面为image/jpeg。未授权请求在打开文件前被拒绝。
全部/media响应（含错误和206）应用private, no-store、Pragma:no-cache、nosniff及no-referrer。

## 本地授权边界

IMediaAuthorizer是独立媒体授权接口，不把现有管理员Cookie当作媒体通行证。
当前DevelopmentMediaAuthorizer必须同时满足：

- 环境严格为Development。
- Media:AllowDevelopmentLoopback=true（仅appsettings.Development.json启用）。
- 连接来源和目的IP均为回环；Host为localhost/127.0.0.1/::1。
- 不携带Forwarded、X-Forwarded-*、X-Original-*或CF-*转发/身份声明。
- Origin如存在必须是本机HTTP/HTTPS来源；拒绝Sec-Fetch-Site跨站请求。

不满足时返回401，且不读取媒体；Production即使手动开启测试开关也拒绝。
这是仅供本机测试的授权方式，不是生产身份系统，不可把Development服务通过隧道公开。
下一阶段需实现真正的Access JWT验证并替换授权实现，不应删除此失败保护或伪造请求头通过。
授权中间件在静态文件之前执行，现有管理员Cookie、CSRF、登录限流与数据库业务不变。

## Vite及构建保护

publicDir关闭默认公开/整目录复制行为，改用12项白名单：11张现有照片和favicon。
开发服务器通过受控中间件提供这些照片；dev/preview的/media同源代理只允许指向本机HTTP origin，
默认目标来自既定端口http://localhost:5270，不向前端传入任何后端密钥。
MEDIA_PROXY_TARGET仅为Node/Vite进程的本地测试配置，拒绝非回环目标。

旧/audio、/public/audio、编码后的audio与/@fs路径被封锁，并保留Vite敏感文件拒绝规则。
原 `frontend/public/audio` 中8个副本保持原样留在磁盘，但不会被Vite静态提供或复制。
原始audio与旧public/audio副本均加入.gitignore；本项目尚无已跟踪文件，不涉及Git历史删除。
未来若出现已有跟踪媒体，需要另行审查，不能认为忽略规则能自动清除历史。

构建完成后自动检查：音频目录、音视频扩展名、4个私人封面文件名，以及本机原始媒体哈希。
即使私人文件改名，只要完整字节一致也会被本机哈希检查拒绝。
无原始文件的干净源码检出仍执行目录/文件名/扩展名检查，白名单复制不依赖原始音频存在。
检查失败即构建失败，不应发布该输出目录。旧dist由正常Vite构建清理后重建，原始素材未删除。

当前dist共15个文件：index.html、JS/CSS、favicon和11张照片，**无歌曲或私人封面**。
其他不受控静态服务器不具备本项目的防护，不得绕过构建流程直接发布public或项目根目录。

## 播放器及愿望模块适配

保持原曲目顺序：Cry For Me → 会いたいわ → 迷人的危险 → カタオモイ。
不修改场景、文案、CSS、照片配置或彩蛋触发逻辑；同一个audio元素继续跨场景存在。
彩蛋仍从0秒开始，期间不改普通歌单索引/书签，关闭或重开照片不重启；结束后继续原有下一首逻辑。

媒体错误时保留当前曲目、模式、时间及普通书签；无自动重新请求或切歌。
用户明确点击播放时才重新加载当前源，并在metadata恢复后定位原进度。
由于原生audio不暴露所有HTTP状态，网络失败和401媒体失败统一走媒体错误恢复，不假装完成Access登录。
保留的是当前页面内的播放状态；未来Access整页登录跳转后的持久恢复需在真实认证接入阶段单独验证。
封面错误后也仅在用户明确重试时重新读取。

wishesApi.js仅将credentials从omit改为same-origin：同源Cookie可以携带，跨域不自动附带凭据。
原有一次POST、防重复、草稿、有效201回执、503/unknown核实锁、禁止重定向和自动重试全部保留。
本阶段没有实现Access登录流程，也未在前端保存Token/存储凭据。

## 编译与测试

| 检查 | 结果 |
| --- | --- |
| 最终后端独立编译 | 0警告、0错误 |
| 后端测试 | 85项通过：原57项+新增28项媒体测试 |
| 前端测试 | 67项通过：原64项+2项构建边界+1项错误进度恢复 |
| 前端构建 | 成功；32模块，JS54.68kB/gzip21.03，CSS35.35kB/gzip9.67 |
| 8个真实媒体GET/HEAD | 全部200，读取字节哈希与原始文件逐一相同 |
| Range | 起始、指定区间、后缀206、超范围416通过；HEAD无正文且长度正确 |
| 授权 | 非回环、非Development、关闭开关、伪造转发/CF头、外站Origin等被拒绝，存储读取次数为0 |
| Vite dev/preview | 均验证8个资源HEAD/206、旧路径及@fs拒绝、照片和图标完整 |
| 浏览器五场景 | 实际通过后端读取MP3/封面，默认播放降级、切歌、进度拖动、循环、彩蛋及照片归位通过 |
| 手机布局 | Edge模拟320/390及1440px；减少动态效果、子路径、完整情书/蛋糕/烟花/草稿通过 |
| 愿望浏览器回归 | 8次Mock POST，201/400/429/503/断网/超时/刷新保护通过；真实POST=0 |
| 原文件保护 | 16个原始/旧副本媒体哈希无变化；40个受保护需求、图片、数据库/管理及本地配置文件无变化 |

浏览器测试使用独立后端进程和随机回环端口，明确Database__Enabled=false，管理员凭据为空。
读取原始音乐是真实媒体GET/HEAD；愿望POST全部在浏览器拦截，不是数据库写入。
没有为本阶段启动真实数据库检查或向已有5270服务发送测试愿望。
Windows Edge实际解码并播放到音轨尾部触发ended；测试静音输出，不改变页面15%媒体音量。
真机iPhone/Android/微信的播放策略及声音体验仍需后续人工验证。

第一次默认目录编译因用户已有API进程锁住DLL，发生MSB3026/MSB3021/MSB3027。
未停止该进程；改为独立artifacts目录编译，最终结果为0警告0错误。
独立目录首次还原曾出现瞬时NuGet下载提示，随后还原成功；没有更改依赖版本或安装额外软件。

复现命令（PowerShell，项目根目录）：

```powershell
dotnet test BirthdayWebsite.sln --artifacts-path F:\ourweb\.local\phase10-1-artifacts -p:UseAppHost=false
dotnet build BirthdayWebsite.sln --artifacts-path F:\ourweb\.local\phase10-1-artifacts --no-restore -p:UseAppHost=false
cd frontend
npm test
npm run build
npm run check:private-media
npm run test:media
npm run test:browser
npm run test:browser:api
```

独立媒体浏览器脚本需要先生成上述artifacts中的API。
机器证据：`.local/phase10-1-media-boundary-result.json`、`.local/phase10-1-regression-result.json`、
`.local/phase10-1-api-browser-result.json`、`.local/phase10-1-before.json`。
本次启动的测试API、Vite、静态服务及浏览器已关闭，用户原有API未停止或重启。

## 全部修改文件

新增后端：

- backend/BirthdayWebsite.Api/Controllers/MediaController.cs
- backend/BirthdayWebsite.Api/Media/MediaCatalog.cs
- backend/BirthdayWebsite.Api/Media/MediaOptions.cs
- backend/BirthdayWebsite.Api/Media/IMediaAuthorizer.cs
- backend/BirthdayWebsite.Api/Media/DevelopmentMediaAuthorizer.cs
- backend/BirthdayWebsite.Api/Media/IPrivateMediaStore.cs
- backend/BirthdayWebsite.Api/Media/LocalPrivateMediaStore.cs
- backend/BirthdayWebsite.Api/Media/PrivateMediaMiddleware.cs
- backend/BirthdayWebsite.Api.Tests/MediaTests.cs

新增前端工具/测试：

- frontend/scripts/private-media.js
- frontend/tests/private-media.test.js
- frontend/tests/local-media-server.mjs
- frontend/tests/media-boundary-check.mjs

修改：

- .gitignore
- README.md
- backend/BirthdayWebsite.Api/Program.cs
- backend/BirthdayWebsite.Api/appsettings.Development.json
- frontend/package.json
- frontend/vite.config.js
- frontend/src/config/music.js
- frontend/src/js/components/music-engine.js
- frontend/src/js/components/music-view.js
- frontend/src/js/services/wishesApi.js
- frontend/tests/wishes-api.test.js
- frontend/tests/music.test.js
- frontend/tests/browser-check.mjs
- frontend/tests/api-browser-check.mjs

另新增本报告及docs/screenshots/phase-10-1下14张截图：
00-music-mobile、00-music-desktop、01-login-mobile、01-login-desktop、02-memories-mobile、
02-memories-320、03-letter-mobile、04-cake-mobile、04-cake-celebration、05-wishes-mobile；
api/下01-submitting、02-success-mock、03-service-error-mock、04-unknown-mock（均.png）。
API成功截图是Mock回执，不代表新增真实记录。dist、测试artifacts和临时结果均被Git忽略。

## 审查后本机运行与后续注意事项

当前用户原有5270 API仍可能加载旧DLL；本次独立测试通过不等于已替换它。
请在审查后由所有者停止旧API，然后在backend/BirthdayWebsite.Api目录执行
`dotnet run --launch-profile http`（不要用旧产物的--no-build），再在frontend运行npm run dev。
无需设置前端密码或存储密钥；Production媒体默认401是本阶段刻意保留的安全状态。

下一阶段才接入并验证Cloudflare Access JWT、源站防绕过、可信代理/HTTPS、Blob服务器身份、
私人缓存绕过和云端发布。不能把本地Development授权当作公网方案。
数据库/Azure SQL迁移、真正Access过期重登、真机验证及版权许可不在本阶段完成。
私有技术访问控制不等于已获得音乐和封面的传播授权。

本阶段完成后停止，等待人工审查。
