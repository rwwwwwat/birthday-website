# 第六阶段：五场景视觉与交互验收

日期：2026-11-01（Asia/Hong_Kong）。本阶段仅修改前端、测试和交付说明。
账号按最新指令为“宝宝”，口令1002，使用原有userphoto.jpg；生日年龄20。
myneed.md原文保持不变，最新用户指令优先于其中的旧账号。

## 实现情况

| 场景 | 已实现 |
|---|---|
| 公主身份验证 | 原有头像、固定账号宝宝、数字键盘、密码显隐、错误提示、爱心绽放/气球升起/星光过场 |
| 我们的回忆 | 首张合照突出、十张照片沿SVG心形路径依次运动停靠、完成光波、逐张放大和动画归位、重播 |
| 写给大王的信 | CSS信封、火漆发光、翻盖、信纸升起放大、逐字显示、跳过逐字、重新拆信与回看 |
| 生日蛋糕 | 原生SVG双层奶油草莓蛋糕、20数字蜡烛、动态火焰、许愿、按钮/麦克风吹灭、烟雾/暗场/星光/限时烟花及祝福 |
| 愿望信箱 | CSS立体信箱、2000 UTF-16单元计数、会话草稿保留、整理动效、未开放反馈及重试、明确标注的送达样式预览 |

恋爱日期保持null，明确显示待确认；生日日期未推断。
正式情书没有提供，独立文案位于frontend/src/config/copy.js，仅使用标注的示例祝福，没有编造真实回忆。
site.js保留兼容的letter字段，并引用独立文案。
音乐播放器沿用原组件，src=null、默认音量0.15，未下载或请求歌曲。

## 交互与生命周期

保留createStore/patch/subscribe架构及原有状态字段，增加阅读进度、许愿状态。
场景作用域统一清理计时器、Web Animations、监听器和弹窗。
麦克风只有点击后才调用getUserMedia；数据只进入本地Web Audio分析器，不录制、不上传、不保存。
设置环境音校准、能量阈值、持续时间和基础宽频能量门限，15秒未检测到则停止；
退出场景、页面隐藏、pagehide、手动停止或蜡烛熄灭时停止轨道并关闭AudioContext。
异步授权晚于离开场景时，也立即停止刚返回的媒体轨道。
真实吹气与环境声音的区分仍需在实际手机上调校，按钮备用方式始终可见。

草稿保存于sessionStorage，切换场景及同源刷新后保留；存储不可用则降级为内存草稿。
关闭标签页后浏览器可能清除会话存储。
提交按钮仅做本地整理动效，随后明确显示“投递通道尚未开放，没有发送”。
成功样式仅位于展开后的演示区域，始终明确写明未发送，不会在实际提交状态中伪报成功。
前端没有fetch、XMLHttpRequest或MediaRecorder调用，没有API接入。

## 验证

- npm run build：通过。原生JS产物约35.37 kB（gzip约13.97 kB），CSS约30.51 kB（gzip约8.59 kB）。
- npm test：7项通过（原有2项状态测试及新增日期/持续吹气/反馈真实性规则测试）。
- dotnet test BirthdayWebsite.sln --no-restore：34项通过，测试使用替身，不连接SQL Server。
- Edge实际浏览器验证：正常动效和prefers-reduced-motion两种模式。
- 320×844、390×844、1440×1000：五场景无横向页面溢出。
- 十张照片逐个使用实际鼠标事件点击、打开、关闭并归位；图片均成功解码。
- 信封、逐字、跳过、重播与切换中清理通过。
- 点击吹灭、拒绝麦克风、授权挂起后离开、麦克风工作时离开、合成宽频声音吹灭均通过。
- 草稿跨场景/同源重载保留，预览反馈明确标注，无任何API请求。
- 构建产物在/birthday-test/子路径下正常运行，无SPA回源依赖。
- 控制台异常和资源加载错误：0。
- 原图/public图片/dist图片11张逐一哈希相同。
- myneed.md、原图、backend源码与database文件共44个受保护文件哈希不变。
- 所有静态测试服务和独立Edge进程在测试结束后关闭。

本轮没有启动后端业务服务、连接SQL Server或提交愿望，因此没有触碰WishId=1。
没有上传、Git提交、配置隧道或公网部署，也没有引入新的前端运行依赖。

## 浏览器截图

- [登录手机](screenshots/phase-6/01-login-mobile.png)
- [登录桌面](screenshots/phase-6/01-login-desktop.png)
- [照片心形列车](screenshots/phase-6/02-memories-mobile.png)
- [320px照片场景](screenshots/phase-6/02-memories-320.png)
- [展开的信件](screenshots/phase-6/03-letter-mobile.png)
- [20岁蛋糕](screenshots/phase-6/04-cake-mobile.png)
- [熄灭后祝福](screenshots/phase-6/04-cake-celebration.png)
- [信箱及反馈预览](screenshots/phase-6/05-wishes-mobile.png)

## 修改/新增文件清单

以下为本阶段前端文件（原有文件修改，其余新增）：

- frontend/index.html
- frontend/package.json
- frontend/src/config/copy.js
- frontend/src/config/site.js
- frontend/src/css/base.css
- frontend/src/css/scenes/cake.css
- frontend/src/css/scenes/letter.css
- frontend/src/css/scenes/login.css
- frontend/src/css/scenes/memories.css
- frontend/src/css/scenes/wishes.css
- frontend/src/css/style.css
- frontend/src/js/app.js
- frontend/src/js/components/blow-detector.js
- frontend/src/js/components/cake-art.js
- frontend/src/js/components/decor.js
- frontend/src/js/components/draft.js
- frontend/src/js/components/fireworks.js
- frontend/src/js/components/lifecycle.js
- frontend/src/js/components/navigation.js
- frontend/src/js/components/photo-viewer.js
- frontend/src/js/components/relationship.js
- frontend/src/js/components/wish-feedback.js
- frontend/src/js/scenes/cake.js
- frontend/src/js/scenes/letter.js
- frontend/src/js/scenes/login.js
- frontend/src/js/scenes/memories.js
- frontend/src/js/scenes/wishes.js
- frontend/src/js/state.js
- frontend/tests/browser-check.mjs
- frontend/tests/interactions.test.js

另新增本报告docs/phase-6.md及上述截图；.local中保留测试产物、独立浏览器缓存和哈希基线，不进入Git。
后端、数据库脚本、原始照片和原始需求文档未修改。

## 如何本地检查

在frontend目录运行npm run dev可在localhost:5173体验。
npm run build后运行npm run test:browser可使用本机现有Edge执行静态产物测试和截图；
测试自建随机本机端口，不依赖或启动API，不做网络提交。无需安装浏览器或新增依赖。
浏览器脚本当前面向此Windows工作区的现有Edge路径。

## 下一阶段

1. 审阅视觉与动效；提供恋爱日期、正式情书及照片说明，确认合法音乐来源。
2. 单独进入前端API接入，保留真实成功确认、失败草稿和明确重试策略；本阶段不开放。
3. 在真实iPhone/Android/微信中验证权限弹窗、吹气灵敏度及声音环境。当前自动化使用合成音源，不代表已验证真实麦克风硬件。
4. 管理后台、线上提醒、Cloudflare隧道与公网发布继续留待后续授权。
