# Simai 谱面确认内核与验证

播放器为 TypeScript / Canvas 2D / WebView，音符表现以本地 MajdataViewX 为基准，
解析以其 NuGet 锁定的 MajSimai 2.2.2 commit 为基准。舞萌普通和 Buddy 的谱面、音乐
仍来自 LXNS；Majdata Net 的谱面、音乐、封面与视频由游戏资源适配层提供。
两者使用同一内核与页面设置协议，通用播放壳不解释 Simai 或构造游戏资源地址。

## 执行路径

`configuration.ts` → 共享配置注入/资源计划 → `webview-player/main.ts` →
`SimaiParser` → `prepareChart` → `buildFrame(nowMs)` → `MainRenderer`。

模型保存音符来源、实际起止时间、HS、是否使用 SV、Each 分组、分支延迟、总时长和
各段原始写法/时长。`ScrollTimeline` 积分 SV；TAP、HOLD、TOUCH 和 TOUCH HOLD
按视觉时间求位置，滑条路径按 ViewX 的实际时间推进。实际时间决定音乐、正解音、
完成提示和生命周期。连接滑条的书写分段时长保留，但 ViewX 的 `MakeConnSlide`
按合并路径长度匀速推进；自定义 BPM 先确定默认等待，`##` 才是显式延迟。

暂停、跳转、变速和 Buddy 两侧初始 BPM 不一致时，使用共享 `PlaybackClock` 和
同一实际时间轴重建画面；取消旧正解音调度。准备阶段只解码音频，用户点击播放时再恢复 AudioContext，避免自动播放权限使页面停留在加载中。音符头（无头滑条除外）和长条结束生成
预览正解音，1 ms 内合并事件；保留音乐、正解音音量和原有音频补偿设置。

## 语法与独立对照

| 范围 | 实现与证据 |
|---|---|
| TAP/HOLD/SLIDE/WIFI/TOUCH/TOUCH HOLD、短 HOLD | 原始 C# 输出逐音符比较类型、位置、属性、实际时间与长条时长 |
| `b`、`x`、`m`、`f`、`$`/`$$`、`!`/`?`/`@` | 覆盖头/轨道独立属性及 TOUCH 家族组合，包含时长后缀修饰 |
| `/`、紧凑同时押、反引号伪同时押、`*` 分叉、连接滑条 | 统一模型与分组；C# 对照分支时间，独立 ViewX 对照连接后的箭头/分区 |
| BPM、分拍、`[#秒]` HOLD、自定义 BPM、显式等待 `##` | C# 基准覆盖实际时间；滑条 `[#秒]` 额外保留 LXNS 兼容写法，锁定 MajSimai 不接受该写法 |
| `<HS*>`、`<SV*>`、`c`、`{#秒}`、`||s 分子/分母`、注释 | 比较 HS/SV 属性、积分与时间；包括零/负 HS、零/负 SV、变 BPM |
| `A/B/C/P/Q/K` 自定义路径 | 八个合法路径、一个非法路径对照 ViewX；支持直接 K、控制点、连接及旋转圆弧 |
| 普通难度、无 Re:MASTER、Buddy | 共用解析器，页面包检查覆盖指定难度缺失报错及双侧初始 BPM 不同 |
| 非法输入 | `SimaiParseError` 保存行、列、偏移与原句；准备路径失败同样记录来源，通过既有 error 桥接显示场景化提示 |

用例与独立输出在 `apps/mobile/tests/fixtures/maimai-*-cases.json` 和
`maimai-*-reference.json`。`scripts/maimai-reference/README.md` 给出原始 C# 复现命令。
这些用例覆盖所列类别，不代表枚举了所有扩展语句的排列组合；未知语句会报错，不静默丢弃。

## Majdata 七难度、物量与计分

共享实现位于 `src/features/simai-chart-preview/`。Majdata 的原始难度 0～6 严格映射
到 `inote_1`～`inote_7`；预览接收详情缓存的同一 `parsedChart`，不会改播其它难度。
游戏资源由 `app/songs/chart-preview.tsx` 提供，运行时不推算歌曲 ID 或资源地址。
通用 WebView 壳继续只负责资源、桥接、设置和生命周期。
详情物量在页面转场结束后按可见难度读取；解析结果由资源仓库按完整歌曲 UUID、HASH
与原始难度索引保存，详情、容错计算和预览共用模型。共享请求按消费者取消，清理缓存和
修订变化后旧请求不能回填。该缓存不改变本地收藏、练习或标签的身份。

`statistics.ts` 从 Chart 生成 TAP / HOLD / SLIDE / TOUCH / BREAK / MINE 六类物量。
Touch Hold 计 HOLD，星头计 TAP；头部与本体分别计数，一条连接分支只有一个滑条判定单位。
Mine 优先于 Break 显示，但 `scoring` / `mines` 保留各计分类别，避免丢失混合 Mine 权重。

计分对照 `scripts/maimai-reference/MajdataScoreReference.cs` 的原始 MajdataPlay
`UpdateNoteScoreCount` 方法；只调整可见性，并用空类型提供原方法的类型分派。
来源与完整原文件 SHA-256 记录在 `majdata-source.json`。`majdata-score-reference.json`
包含各本体、Break 与每种判定的实际输出；`majdata-simai-reference.json` 由 MajSimai
独立生成，覆盖混合 Mine、分叉、连接、Touch Hold、EX、特殊节拍、HS/SV 和第七难度样本。

```powershell
dotnet run --project scripts/maimai-reference/Reference.csproj -- parse tests/fixtures/majdata-simai-cases.json tests/fixtures/majdata-simai-reference.json
dotnet run --project scripts/maimai-reference/Reference.csproj -- score tests/fixtures/majdata-score-reference.json
```

`check-maimai-player.mjs` 同时检查普通、Buddy、Majdata 已解析第七难度，以及缺失难度报错。
`check-maimai-visuals.mjs` 保留扩展音符固定时刻、设置、背景和播放检查；这些是本播放器的
Canvas 检查，不代替 Unity / ViewX 同时间双端截图及手机音画同步验收。

## 素材语义与审计

S3 基址为 `https://rranker-maimai-data.cn-nb1.rains3.com/chart-preview`。
清单内 155 张 PNG 全部读取成功，总计 3,091,140 字节；`answer.wav` 为 35,816 字节，
RIFF/WAVE 头有效。内容修订为 `83a00350faddc68d`。每个对象的 URL、尺寸、SHA-256
和非零透明边界完整记录于 `maimai-chart-preview-skin-manifest.generated.ts`。

| 语义 | 对象与变换 |
|---|---|
| TAP、星星、Mine、Break、EX | 对应 TapSkins/StarSkins 族；原图中心锚点、100 PPU；EX 与本体同尺寸、角度和缩放 |
| 粉色星星 | 开关开启时，普通 `star.png` / `star_double.png` 在音符头、移动星星及 WIFI 中统一映射到 `star_pink.png` / `star_pink_double.png`；保留 Each、Break、Mine、EX 专用贴图。原图分别为 1254×1254、126×126，显示占位分别为 1.26×1.26、1.22×1.26 世界单位 |
| HOLD 本体、点亮与 EX | HoldSkins 族；122×200，顶部和底部各 58 px（0.29），中段拉伸；EX 共用切片变换 |
| TOUCH 花瓣 | TouchSkins 族；四瓣依次在右/上/左/下，旋转 90/180/270/360 度；重叠边框使用同位置计数 |
| TOUCH HOLD | TouchHoldSkins 族；0/1/2/3 在右上/右下/左下/左上，旋转 135/45/-45/-135 度；边框按持续时间遮罩 |
| TOUCH HOLD 地雷边框 | 语义 `touchhold_mine_border.png` 映射到现有对象 `TouchHoldSkins/touchhold_break_mine.png`，不修改线上名字 |
| Each、轨道箭头、WIFI、完成提示 | NoteGuideSkins、SlideSkins、WifiSkins、SlideOKSkins；路径表统一箭头、星星和完成提示；左右完成提示在镜像时换向，文字不作位图反射 |
| 判定特效 | 八张 ViewX 原始特效 PNG、Prefab 和动画曲线随 bundle 加载；渲染跳过普通、Break、Touch 星型层，保留非星型层和独立烟花；HOLD/TOUCH HOLD 持续圈统一为 Each 金色 `#fff55d`，保持 10 次/秒、0.3 秒粒子 |
| Slide 判定文字 | 不区分模式使用六种方向 `just_*_p.png`，显示 JUST PERFECT；区分模式使用不带 `_p` 的 CRITICAL PERFECT 及 Break 闪烁贴图，隐藏模式不绘制 |
| 判定点与判定线 | 按 S3 `outline.png` 的 6 px 线宽、约 29 px 点径及 100 PPU 绘制；落点复用 `buttonPoint`，圆环半径由落点取得 |
| 判定区 | 原始 `assets/maimai-chart-preview/sensor.webp`，2048×2048；图案中心为 (1025.5, 997)，197 PPU，八个 E 区中心对齐 `touchPoint` 的 3.1 半径；再叠加同一判定线和判定点 |

`skinSemantics.ts` 是本地别名与锚点/切片契约。四张带文件名对照图位于
`apps/mobile/build/maimai-skin-audit/contact-1.png` 至 `contact-4.png`，已检查花瓣编号、
Each、EX、Break、Mine、左右完成提示和 WIFI 原生弯折形状。只排除无调用的
`hold_off.png`、`touchhold_off.png`，其余 153 个 S3 贴图随预览暂存。

缓存继续使用共享计划执行器；文件名为 `skin/修订_扁平对象名`，正解音文件名含内容哈希。
同大小旧修订不会复用新修订身份。共享执行器仍按文件大小校验；运行时核对图片实际尺寸。
S3 贴图仍由 `skin-data.js` 注入；缺少必需资源或尺寸错误时阻止播放。
审计脚本只对 PNG 解码，正解音单独验证；可追加 S3 对象路径参数以审计新增贴图，
随后执行 `generate-maimai-skin-manifest.mjs` 生成带真实尺寸、摘要及透明边界的清单。
本地 `sensor.webp` 同样通过共享计划暂存并注入 `skin-data.js` 的 WebP data URL；
原图保持不变，位置与缩放校准由 `SENSOR_TRANSFORM` 统一表达，随画布尺寸与像素比缩放。

图片和视频背景共用 `MainRenderer` 的绘制入口，按 `min(边长/媒体宽, 边长/媒体高)`
完整容纳并水平、垂直居中。圆形裁剪中心为窗口中心、直径等于窗口边长；未覆盖区域和
圆外背景为纯黑，保留 45% 暗化。遮罩只作用于媒体，音符和判定层正常叠加；图片缓存
在媒体或窗口尺寸变化时重建。普通、全屏与 Buddy 每个方形播放窗应用相同规则。

内嵌特效生成时只重新压缩 PNG 的 IDAT，原始素材保留在生成输入中；其它 PNG 块、
解压数据、色彩信息与像素不变。清单的 `sourceSha256` 标识原始 PNG，`sha256` 标识
实际内嵌 PNG。路径表使用数值字典生成，模块初始化时还原完整精度的表及判定区域；
`maimai-generated-data.test.ts` 覆盖全部 568 条路径、176 组区域和八张特效图。

S3 皮肤记录为项目所有者自行绘制。新增的 ViewX 内置特效另行保留上游版权及 GPL
许可，原始生成输入和 PNG 位于 `scripts/maimai-reference/Effects/`；不得把它们记为
用户原创。完整许可与组合源码要求见根 `THIRD_PARTY_NOTICES.md`。

## 运行与复现

在 `apps/mobile` 执行：

```powershell
node scripts/audit-maimai-skin.mjs
node scripts/generate-maimai-skin-manifest.mjs
node scripts/generate-maimai-effects.mjs
npm run build:chart-preview
node scripts/check-maimai-visuals.mjs <Playwright模块绝对路径>
node scripts/check-maimai-player.mjs <Playwright模块绝对路径>
npm run lint
npm run typecheck
npm test
git diff --check
```

浏览器脚本使用安装的 Chrome，无 Expo Web、无常驻服务，结束时关闭浏览器。
省略模块参数时使用当前环境可解析的 `playwright`；它不是应用运行依赖。

`check-maimai-visuals.mjs` 输出七类谱面 × 六个时刻的 42 张截图及连续播放记录，
覆盖入场、HOLD 本体/EX、花瓣合拢、WIFI、连接转折和 SV。输出在
`apps/mobile/build/maimai-visual-check/`，`results.json` 记录时刻和叠加统计。
同一脚本另输出 9 张设置截图，覆盖粉色单双星、移动星星、WIFI、专用星星、JUST 及
金色持续圈；横向、纵向、正方形媒体在 320/540 窗口中各以图片和真实视频帧绘制，
输出 12 张截图并检查中心、圆外、上下/左右留黑像素，比较图片与视频结果。
`check-maimai-player.mjs` 校验实际 `player.bundle` 与 `player.js` 一致，再检查实际页面的
播放、暂停、跳转、循环操作、变速、水平镜像、图片背景、全屏与退出停音；包含普通谱面
和 Buddy，以及 Majdata 已解析第七难度和缺失谱面报错。谱面/音乐请求由测试数据拦截，音频调度使用真实 AudioContext 节点；
这不是 LXNS 在线曲库或人耳音画同步验收。

`maimai-chart-preview-visual-settings.test.ts` 检查粉色资源替换、原占位和 EX 对齐、
六种方向的判定提示、镜像、背景绘制/缓存及打击特效。HOLD 粒子回归覆盖普通和 Break
的 HOLD/TOUCH HOLD，验证拖动重建、结束排空和特效开关。共享屏幕、资源、注入与
生命周期合同随完整单元/UI 测试执行；检查结果以当前命令输出和本地运行记录为准。

公共入口保持 `prepareChartPreviewWebviewFromPlan(plan): Promise<ChartPreviewWebviewPlanResult>`，
新增皮肤仍由现有清单、暂存与 writer 注入，不增加缓存执行器或共享游戏分支。

## 验收边界

- 已有原始 MajSimai/C# 解析、标准/自定义/连接路径数据对照和本播放器截图；当前环境
  没有可运行的 Unity/ViewX，尚无同皮肤、同谱面、同一时刻的双端截图差分，不能宣称视觉完全一致。
- Canvas 烟花采用 512 像素着色缓存与 128 段径向渐变；色相绑定谱面时间以支持拖动重建。
  Canvas 与 Unity 的滤波、混合及粒子相位仍需实际连续画面对照。
- iOS、Android WebView 真机播放、后台返回、反复循环边界、变速听感、视频背景、
  内存峰值与帧率尚未验收。桌面浏览器帧数不能作为手机性能结论。
- 未执行原生 Release 构建、提交、push 或线上资源变更。
