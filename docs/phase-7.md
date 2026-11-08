# 第七阶段：愿望信箱真实 API 接入

验收日期：2026-11-01。本阶段完成前端真实请求能力，但所有 POST 测试均为 Mock。
真实 API 只调用 GET /api/health，没有新增、读取正文、更新或删除任何数据库记录。
未修改后端、数据库结构、初始化 SQL、原始图片或 myneed.md。

## 修改文件

新增：

- `frontend/.env.example`：公开 API 地址示例。
- `frontend/.env.local`：本机地址，已被 Git 忽略，不进入提交。
- `frontend/src/js/services/wishesApi.js`：fetch、超时、响应验证、错误分类。
- `frontend/src/js/services/submissionJournal.js`：持久化待核实投递标记。
- `frontend/src/js/services/submissionController.js`：五状态、互斥、草稿和恢复逻辑。
- `frontend/src/js/services/wishSubmission.js`：复用现有 store 的全局服务实例。
- `frontend/tests/wishes-api.test.js`：请求与 HTTP 分支测试。
- `frontend/tests/wish-submission.test.js`：状态、防重复、草稿与恢复测试。
- `frontend/tests/api-browser-check.mjs`：浏览器请求拦截测试。
- `docs/phase-7.md`：本报告。
- `docs/screenshots/phase-7/01-submitting.png`
- `docs/screenshots/phase-7/02-success-mock.png`
- `docs/screenshots/phase-7/03-service-error-mock.png`
- `docs/screenshots/phase-7/04-unknown-mock.png`
- `docs/screenshots/phase-7/regression/`：八张五场景回归截图：
  `01-login-desktop.png`、`01-login-mobile.png`、`02-memories-320.png`、
  `02-memories-mobile.png`、`03-letter-mobile.png`、`04-cake-celebration.png`、
  `04-cake-mobile.png`、`05-wishes-mobile.png`。

修改：

- `frontend/src/config/site.js`：通过 Vite 环境变量读取 API，移除本机默认回退地址。
- `frontend/vite.config.js`：生产构建屏蔽本机及非 HTTPS 地址，保留相对 base。
- `frontend/src/js/scenes/wishes.js`：保留原界面，绑定全局提交状态和真实回执。
- `frontend/src/js/components/wish-feedback.js`：区分真实结果与明确标注的样式演示。
- `frontend/src/css/scenes/wishes.css`：投递、结果与回执样式，复用原设计。
- `frontend/tests/interactions.test.js`：成功反馈必须具有有效 201 回执。
- `frontend/tests/browser-check.mjs`：五场景回归适配配置保护，单独保存第七阶段证据。
- `frontend/package.json`：增加 `test:browser:api` 命令，无新增依赖。
- `README.md`：更新启动、配置、测试与当前边界说明。

`state.js`、`app.js` 保持原样，通过现有 store.patch/subscribe 扩展投递状态。
临时构建、日志、受保护文件哈希基线与机器测试结果放在已忽略的 `.local/`。
构建产物 `frontend/dist/` 被 Git 忽略。原 `.gitignore` 已覆盖 `.env.local`，无需修改。

## 配置与启动

从后端 `Properties/launchSettings.json` 确认 http profile 为 `http://localhost:5270`。
当前 `frontend/.env.local` 内容为：

```dotenv
VITE_API_BASE_URL=http://localhost:5270
```

新机器复制 `.env.example` 为 `.env.local` 后按实际启动地址填写。
仅允许公开 API 基地址，不放数据库连接字符串、密码或管理凭据。
配置更改后重启 Vite。通过 `import.meta.env.VITE_API_BASE_URL` 读取。

```powershell
cd F:\ourweb\backend\BirthdayWebsite.Api
dotnet run --no-build --launch-profile http
```

另开终端运行：

```powershell
cd F:\ourweb\frontend
npm run dev
```

前端为 `http://localhost:5173`，使用后端现有精确 Development CORS。
**未经新的写入授权，不得在这个真实本机页面点击提交有效愿望。**

Vite 保留 `base: './'`，API 使用独立绝对地址，照片和页面资源仍兼容 Pages 子路径。
生产 build 会将本机地址、非 HTTPS 地址及空地址置空，禁止投递；所以当前默认
`npm run build` 后的 `npm run preview` 只预览界面。未来发布时须显式提供正式 HTTPS
API 地址并重新构建；本阶段没有配置隧道或正式来源。Vite 环境变量属于公开构建内容。

## 实际 API 契约

请求严格为 `POST {API_BASE}/api/wishes`：

```json
{"content":"用户输入的愿望"}
```

使用 `Content-Type: application/json`；不发送 Source、时间、IsRead 或编号。
不携带 Cookie/浏览器认证凭据，不允许请求重定向，无自动重试。
前端拒绝空白、非字符串及超过 2000 个 UTF-16 代码单元的内容，不截断用户正文。

按现有后端真实定义，成功响应字段为：

| 字段 | 来源与验证 |
| --- | --- |
| wishId | 数据库生成，前端要求正的安全整数，不硬编码 |
| createdAt | 数据库 UTC 时间，保留服务器原始字符串，不用客户端时间代替 |
| isRead | 数据库默认值，要求 false |
| source | 服务端控制的来源字符串，不接受用户覆盖 |

仅 HTTP 201 且上述回执完整有效时显示真实成功；无效 JSON、缺失字段、非 UTC 时间等
均转为 unknown。未来编号超过 JavaScript 安全整数范围时会拒绝展示成功，需另行升级
API 编号的字符串契约，本阶段不更改后端。

## 五种状态与用户体验

| 状态 | 行为 |
| --- | --- |
| idle | 保留原输入、计数、草稿与信箱视觉；缺少地址时禁止发送 |
| submitting | 信件投递动画、明确提示、输入只读、按钮禁用；切换场景也保持全局互斥 |
| success | 仅有效 201；成功动画、真实编号/UTC 时间/来源；清除成功草稿，手动开始下一封 |
| error | 400 保留草稿并允许修改后手动重试；429 倒计时后才允许手动重试；503 暂停再投递并要求核实 |
| unknown | 网络异常、15 秒超时、响应损坏或不能证明未保存的响应；保留内容并持久锁定再投递 |

401/403/404/405/413/415 显示固定且不含敏感信息的拒绝提示，不直接显示原始服务端异常。
其他无法确认保存结果的 HTTP 响应（如 200、408、500、502、504）归入 unknown。
超时覆盖等待响应和读取响应体，AbortController 只能取消客户端等待，不能证明服务端未保存。

现有 SqlWishService 在事务提交确认阶段也可能出现 SQL/超时异常，因此 503 虽显示
服务不可用，仍禁止直接重发。这避免把“没有拿到提交确认”误当作“没有保存”。

429 优先读取可见的 Retry-After。后端当前 CORS 未暴露该响应头，真实跨域时采用
60 秒本地等待；服务器限流仍然有效。本阶段不为此修改后端。Mock 暴露该头并验证倒计时。

复用原信箱、信件整理、手机布局、反馈风格、字数提示和 sessionStorage 草稿。
原有样式演示保留并明确标注，不调用 API，也不改变真实投递状态。

## 防重复与持久保护

- 同一页面的全局 inFlight 在任何 await 前取得，场景卸载、重复点击、程序触发表单都不会并发发送。
- 支持 Web Locks 的浏览器额外使用同源跨标签页锁；其他浏览器保留页面内互斥和持久标记，
  不声称能对所有浏览器/多个设备提供全局幂等保证。
- 发送前将正文、尝试标记持久写入 localStorage 的 `birthday.wishSubmission.v1`；写入失败则不发送。
- 刷新/关闭后的 submitting 恢复为 unknown；unknown 和待核实 503 不过期、不自动重新投递。
- 只在获得有效 201 后清空草稿；恢复成功回执也要求保存的 HTTP 状态为 201。
- 没有后台队列、轮询重发、定时重试、打开页面补发或断网恢复补发。
- 普通草稿仍保存在 sessionStorage；待核实正文会额外保留在本浏览器 localStorage，
  不写应用日志、不上传到其他服务。清除浏览器站点数据会丢失这层保护。

## 测试结果

| 检查 | 结果 |
| --- | --- |
| npm run build | 成功，29 个模块；JS 45.63 kB / gzip 17.58 kB；CSS 31.41 kB / gzip 8.78 kB |
| npm test | 47 项通过，0 失败（包含原 7 项） |
| 后端现有隔离自动化测试 | 34 项通过；替换数据库服务，没有真实写入 |
| 浏览器 API 联调 | 通过；201/400/429/503、网络异常、真实前端超时、重复点击、切换场景、刷新恢复、草稿等 |
| 浏览器 Mock POST 数量 | 8；目标全部为 https://birthday-api.invalid/api/wishes，浏览器拦截处理 |
| 真实 API POST 数量 | 0；真实地址额外阻断，所有非本地静态 GET/指定 Mock 的请求禁止放行 |
| 五场景浏览器回归 | 登录、10 张照片放大归位/重播、开信、20 岁蛋糕、吹蜡烛、麦克风模拟与清理、草稿通过 |
| 布局与资源 | 320 / 390 / 1440 px、减少动态效果、Pages 子路径、图片加载通过 |
| 意外浏览器错误 | 0；断网/超时用例预期出现 4 条模拟网络错误，单独记录 |
| 真实健康检查 | HTTP 200，database=healthy；允许来源 http://localhost:5173 |
| 文件保护 | 44 个受保护文件哈希保持一致，覆盖原始需求/图片、后端源码配置及数据库文件 |

真实 GET 健康响应：

```json
{"status":"ok","service":"BirthdayWebsite.Api","timestampUtc":"2026-11-01T01:48:03.0872432+00:00","database":"healthy"}
```

运行测试命令：

```powershell
cd F:\ourweb\frontend
npm test
npm run build
npm run test:browser
npm run test:browser:api
```

API 浏览器脚本自己构建独立 `.local/phase7-mock-dist`，不覆盖默认生产产物；
使用独立浏览器配置和静态服务。已有五场景脚本只测试没有 API 地址的生产产物。
测试服务与本次启动的后端已关闭。`.local/phase7-api-browser-result.json` 和
`.local/phase7-regression-result.json` 保留机器结果。

截图中的成功编号、时间均为 **Mock 回执**，不是新增数据库记录：

- [投递中](screenshots/phase-7/01-submitting.png)
- [Mock 成功回执](screenshots/phase-7/02-success-mock.png)
- [Mock 503 与保护](screenshots/phase-7/03-service-error-mock.png)
- [Mock 网络异常待核实](screenshots/phase-7/04-unknown-mock.png)

## 人工事项与下一步

1. 现有后端没有已认证的投递结果查询或幂等接口，因此 unknown/503 无法由前端自行解除。
   必须由站点所有者在原请求处理完成后，通过另行授权的独立只读核实确认是否保存。
   若已保存，不得重发；只有确认未保存后，才可由维护者备份原正文、在同一前端来源的
   浏览器存储中移除 `birthday.wishSubmission.v1` 并刷新，核对草稿后手动重试。
   不提供用户随意确认的按钮，不因等待一段时间就推定未保存。本阶段没有执行该人工流程。
2. 本机前端已具备真实提交能力；从页面到数据库的实际有效 POST 验收需要新的明确授权。
   本阶段没有用真实写入验证新前端，也没有再次查询 WishId=1；所有行动均未修改它。
3. 日期、正式情书、合法音乐来源、正式 HTTPS API 地址、管理后台和身份认证继续留待后续阶段。
   本阶段未开放管理接口、配置隧道、部署或上传。

参考：[Vite 配置](https://vite.dev/config/)、[Vite 构建](https://vite.dev/guide/build)、
[Fetch 与取消请求](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)。
