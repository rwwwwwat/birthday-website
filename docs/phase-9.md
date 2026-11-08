# 第九阶段：音乐系统与纪念内容

2026-11-01。本阶段仅修改前端、测试和项目说明，未连接或修改真实数据库。
五场景、登录名“宝宝”、头像、十张照片、20岁蛋糕、公开API和管理员后台保留。

## 素材确认与清单

首次检查发现本机Cry For Me并非此前指定的TWICE版本，暂停后经用户明确回复
“现有版本就可以”，本阶段改用 **Michita feat. 愛海《Cry For Me》** 及其原有封面。
没有将它标记为TWICE，也未下载、替换、重命名或修改原始音频。

普通歌单顺序：Cry For Me → 会いたいわ → 迷人的危险 → カタオモイ → 循环。
默认歌曲优先，其余沿用检查时目录清单顺序，不推断发行或故事顺序；可在独立配置中调整。
《迷人的危险》也可在收藏中手动选择，同时作为第一次合照的独立彩蛋音轨。

| 歌曲 / 文件 | Windows读取时长 | 字节数 | 封面 |
| --- | --- | --- | --- |
| Cry For Me / `Cry For Me.Feat. 愛海.-Michita#2CbowT.mp3` | 303.046秒 | 12,122,113 | ① |
| 会いたいわ / `会いたいわ-iri#jkFrL.mp3` | 268.382秒 | 10,735,408 | ② |
| 迷人的危险 / `迷人的危险-Dance+Flow#bgzW.mp3` | 206.080秒 | 8,243,327 | ③ |
| カタオモイ / `カタオモイ-Aimer#gfokU.mp3` | 207.438秒 | 8,297,742 | ④ |

四首均为MP3、320kbps、44.1kHz、双声道。浏览器解码器给出的尾部时长可能有不足一秒差异，
播放器显示原生媒体时间，不硬编码歌曲长度。四首均在浏览器中实际解码、播放并验证时长。

| 编号 | 原始封面文件名 | 尺寸 | 字节数 |
| --- | --- | --- | --- |
| ① | `Michita feat. AMIのPurenessからの楽曲Cry For Me (feat. 愛海)をAmazon Musicで.jpg` | 2560×2560 | 539,139 |
| ② | `＜コラム＞iriが『Mステ』初出演、バイラルヒット「会いたいわ」がもたらした“揺るぎない自信” _ Special _ Billboard JAPAN.jpg` | 1280×1280 | 172,760 |
| ③ | `迷人的危險 - dance flow_ Song Lyrics, Music Videos & Concerts.jpg` | 600×600 | 73,478 |
| ④ | `”カタオモイ” by Aimer - トラック・歌詞情報 _ AWA.jpg` | 800×800 | 77,495 |

元数据：Cry For Me标题为Cry For Me、艺术家Michita、专辑Cry For Me (Feat. 愛海)；
Aimer标题为カタオモイ、艺术家Aimer、专辑デイドリーム。
iri和Dance Flow文件未读到标题/艺术家/专辑标签，展示名依据原文件名，封面依据文件名和画面对应。
没有根据空标签编造发行信息。四张封面均可解码，8个原文件无相同SHA-256，没有缺少配对文件。

原始 `audio/` 保留，8个文件按原名复制到 `frontend/public/audio/`，副本SHA-256全部匹配。
完整机器清单、可读标签和哈希保存在被忽略的 `.local/phase9-media-inventory.json`。
文件名中的 `#` 等使用encodeURIComponent编码，避免被误当URL片段，兼容Pages子路径。

## 音乐状态机

保留 `createMusicPlayer` 入口和原 `music.start()` 调用，仍由app.js在场景之外创建一次。
全站只有一个实际音频元素，切换场景不重建；切换音轨前暂停旧源，没有双播放器叠放。

| 模式 / 状态 | 行为 |
| --- | --- |
| normal | 保存普通歌单索引及每首歌的进度书签；结束后下一首，末首后回首首 |
| special | 保存普通位置，彩蛋从0秒播放；播放期间不更新普通索引或书签 |
| paused | 明确暂停；普通登录/自动播放调用不覆盖用户暂停意图 |
| loading / playing | 只依实际媒体播放结果更新界面与原有musicEnabled状态 |
| blocked | 浏览器拒绝播放，显示手动入口，不假装播放成功 |
| error | 固定错误提示，无定时重试或无限自动跳歌 |

进入网页只尝试一次默认曲播放，音量始终设置为15%。若受限，在首次有效点击/Enter/空格交互
中提供至多一次自动降级尝试；登录按钮复用入口但不会反复尝试。
仍受限时用户可明确点击播放，不通过静音、循环重试或浏览器配置绕过策略。
播放Promise用版本号防止过期结果覆盖新曲/暂停；媒体事件也核对实际paused属性。

第一次合照：在照片查看器接受打开操作后、等待图片解码之前同步触发彩蛋，保持用户交互上下文。
关闭照片、切场景均不停止/重置音轨；彩蛋播放中重开照片不会从头播放。
彩蛋结束后从被打断的普通位置向后找到下一首，若恰好又是《迷人的危险》则跳过，避免连续重复。
下一首如有普通书签则继续该书签；被打断曲的书签保留。
彩蛋完成后必须至少有一首普通曲自然结束才重新允许照片彩蛋，避免马上反复触发。
用户手动上一首、下一首、选择封面可以立即退出彩蛋；明确点击合照也会启动其专属音乐。

右上角平时仅显示小封面和当前曲名，点击展开286px（手机）/310px（桌面）收藏面板。
包括当前大封面、四张可选小封面、当前曲高亮、暂停/继续、上一首/下一首和可拖动进度。
点击外部、收起按钮或Escape可关闭，面板限制高度并可内部滚动，不占据常驻场景空间。
没有添加外部音源、CDN、音乐SDK或新依赖；封面懒加载，减少动态效果设置保留。

## 纪念日期与内容

- 恋爱开始日：2026-06-27，按香港日历计算，包含首日。
- 2026-06-27为第1天，2026-11-10为第137天，由日期差计算，不硬编码天数。
- 回忆页每分钟刷新一次日期文字；页面恢复可见时也立即更新，不必重新载入网页。
- 生日：2026-11-10；农历标签按用户提供显示“十月初二”，不擅自做日期换算；年龄20岁。
- 正式情书逐段原样替换到copy.js，保留信封、火漆、逐字、跳过、重看与场景间状态。
- 完整生日祝福独立配置，吹灭后的烟雾、暗场、烟花保留；烟花结束后展开全文。
  减少动态效果时跳过等待并显示祝福。

照片仍为原顺序十张，分类、标题、说明和音乐彩蛋关联统一保存在photos.js：

| 分类 | 文件 |
| --- | --- |
| 第一次合照 | firstphoto.jpg（关联danger彩蛋） |
| 比心报备 | other4.jpg、other6.jpg、other7.jpg、other8.jpg、other9.jpg |
| 一起吃过的饭 | other1.jpg、other2.jpg、other3.jpg、pther5.jpg |

“比心报备”包含日常报备照片，不将面具照或挂件照描述为比心动作。
说明只描述画面，不添加拍摄日期、地点或未经提供的故事。
分类按钮突出对应照片，其余照片变淡，保持完整十张心形轨迹与放大归位功能。

## 修改文件清单

新增：

- `frontend/src/config/music.js`：四首曲目、封面、歌单顺序与特殊曲ID。
- `frontend/src/js/components/music-engine.js`：独立音乐状态机。
- `frontend/src/js/components/music-view.js`：小型播放器与收藏界面。
- `frontend/src/css/music.css`：播放器视觉与移动布局。
- `frontend/tests/music.test.js`：12项音乐/日期/文案测试。
- `frontend/public/audio/`：上述4个MP3和4张JPG的同名完整副本。
- `docs/phase-9.md`：本报告。
- `docs/screenshots/phase-9/`：10张截图：
  `00-music-mobile.png`、`00-music-desktop.png`、`01-login-mobile.png`、
  `01-login-desktop.png`、`02-memories-mobile.png`、`02-memories-320.png`、
  `03-letter-mobile.png`、`04-cake-mobile.png`、`04-cake-celebration.png`、`05-wishes-mobile.png`。

修改：

- `frontend/src/js/components/music.js`：保持原入口，转发至播放器视图模块。
- `frontend/src/config/site.js`：纪念日期、农历标签与音乐配置。
- `frontend/src/config/copy.js`：正式情书和生日祝福。
- `frontend/src/config/photos.js`：三类照片及对应配置。
- `frontend/src/js/components/photo-viewer.js`：接受打开后触发回调。
- `frontend/src/js/scenes/memories.js`：日期自动更新、分类、彩蛋触发。
- `frontend/src/js/scenes/cake.js`：生日标签和祝福展开时机。
- `frontend/src/css/style.css`：导入音乐样式。
- `frontend/src/css/scenes/memories.css`：分类样式。
- `frontend/src/css/scenes/cake.css`：生日标签及祝福段落排版。
- `frontend/tests/browser-check.mjs`：真实音频与五场景回归、Range支持、子路径检查。
- `README.md`：当前内容、音乐版本、配置及部署前事项。

没有修改app.js、state.js、愿望API请求模块、管理员页面/认证、后端源代码或数据库脚本。
临时浏览器配置、构建产物和哈希证据继续放在已忽略目录中，无上传或提交。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| npm run build | 成功，32模块；JS55.05kB/gzip21.30kB，CSS35.35kB/gzip9.67kB |
| npm test | 64项全部通过（原52项+本阶段12项） |
| 后端隔离回归 | 57项通过，不连接真实数据库 |
| 原始文件保护 | 68个受保护文件哈希无变化，覆盖原始素材、需求、后端、数据库脚本 |
| 音频资源 | 8份副本逐个哈希匹配；无重复文件；四首真实MP3、四张封面加载通过 |
| 音乐交互 | 默认曲、策略拒绝/真实交互降级、15%音量、切歌、暂停/继续、普通歌单循环通过 |
| 彩蛋 | 零秒开始、重复打开不重置、关闭仍播放、结束回歌单、书签保留、跳过立即重复、手动退出通过 |
| 五场景回归 | 登录、十张照片动画/放大归位/重播、开信逐字/全文/回看、20岁蛋糕/烟花/完整祝福、愿望草稿通过 |
| 麦克风 | 拒绝授权、延迟授权清理、退出清理、合成声音吹灭通过；没有录音上传 |
| 布局 | Edge模拟320/390/1440px、播放器边界、减少动态效果通过，无横向溢出 |
| Pages子路径 | /birthday-test/ 的照片、音频（含#文件名）与封面加载通过 |
| 控制台与API | 无JS/资源错误；apiRequests为空，没有真实愿望或管理写入 |

浏览器使用现有Edge、新建隔离用户目录和本机随机端口静态服务，没有启动真实后端。
测试通过浏览器静音输出参数避免发声；页面媒体元素仍为volume=0.15，没有靠muted绕过自动播放限制。
自动播放测试采用更严格的用户激活策略；结束事件通过将真实音频定位到尾部实际播放产生，
不是用伪造ended事件替代音频解码。结果见 `.local/phase9-regression-result.json`。
验证完成后关闭本次服务与测试浏览器。

运行方式：

```powershell
cd F:\ourweb\frontend
npm test
npm run build
npm run test:browser
```

[手机播放器](screenshots/phase-9/00-music-mobile.png) ·
[桌面播放器](screenshots/phase-9/00-music-desktop.png) ·
[正式情书](screenshots/phase-9/03-letter-mobile.png) ·
[生日祝福](screenshots/phase-9/04-cake-celebration.png)

## 尚待人工确认

1. 真机iPhone Safari、Android和微信内置浏览器的自动播放/后台恢复、听感及音量仍需人工验收。
   本阶段是Windows Edge的真实解码与手机尺寸模拟，不声称完成真实手机测试。
2. 请审阅三类照片归属、实际歌单顺序、正式文案和播放器大小；均可通过独立配置调整。
3. 本地使用现有版本不等于获得公开传播许可；公开发布前须确认四首音频及封面的相应授权。
   本阶段不部署、不上传，也没有购买或自动下载资源。

没有任何数据库操作，WishId=1未被触碰。完成后停止，等待人工审查。

参考：[MDN媒体播放与自动播放限制](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)、
[自动播放指南](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)。
