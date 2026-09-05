# 舞萌谱面确认内核与验证

播放器为 TypeScript / Canvas 2D / WebView，音符表现以本地 MajdataViewX 为基准，
解析以其 NuGet 锁定的 MajSimai 2.2.2 commit 为基准。普通和 Buddy 的谱面、音乐
仍来自 LXNS；没有 majdatanet 联网入口。Expo 54、版本号与页面设置协议不变。

## 执行路径

`configuration.ts` → 共享配置注入/资源计划 → `webview-player/main.ts` →
`SimaiParser` → `prepareChart` → `buildFrame(nowMs)` → `MainRenderer`。

模型保存音符来源、实际起止时间、HS、是否使用 SV、Each 分组、分支延迟、总时长和
各段原始写法/时长。`ScrollTimeline` 积分 SV；TAP、HOLD、TOUCH 和 TOUCH HOLD
按视觉时间求位置，滑条路径按 ViewX 的实际时间推进。实际时间决定音乐、正解音、
完成提示和生命周期。连接滑条的书写分段时长保留，但 ViewX 的 `MakeConnSlide`
按合并路径长度匀速推进；自定义 BPM 先确定默认等待，`##` 才是显式延迟。

暂停、跳转、变速和 Buddy 两侧初始 BPM 不一致时，使用共享 `PlaybackClock` 和
同一实际时间轴重建画面；取消旧正解音调度。音符头（无头滑条除外）和长条结束生成
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
| 普通难度、无 Re:MASTER、Buddy | 共用解析器，页面包检查覆盖缺失难度回退及双侧初始 BPM 不同 |
| 非法输入 | `SimaiParseError` 保存行、列、偏移与原句；准备路径失败同样记录来源，通过既有 error 桥接显示场景化提示 |

用例与独立输出在 `apps/mobile/tests/fixtures/maimai-*-cases.json` 和
`maimai-*-reference.json`。`scripts/maimai-reference/README.md` 给出原始 C# 复现命令。
这些用例覆盖所列类别，不代表枚举了所有扩展语句的排列组合；未知语句会报错，不静默丢弃。

## 素材语义与审计

S3 基址为 `https://rranker-maimai-data.cn-nb1.rains3.com/chart-preview`。
清单内 147 张 PNG 全部读取成功，总计 2,043,610 字节；`answer.wav` 为 35,816 字节，
RIFF/WAVE 头有效。内容修订为 `b6c5b699892e3811`。每个对象的 URL、尺寸、SHA-256
和非零透明边界完整记录于 `maimai-chart-preview-skin-manifest.generated.ts`。

| 语义 | 对象与变换 |
|---|---|
| TAP、星星、Mine、Break、EX | 对应 TapSkins/StarSkins 族；原图中心锚点、100 PPU；EX 与本体同尺寸、角度和缩放 |
| HOLD 本体、点亮与 EX | HoldSkins 族；122×200，顶部和底部各 58 px（0.29），中段拉伸；EX 共用切片变换 |
| TOUCH 花瓣 | TouchSkins 族；四瓣依次在右/上/左/下，旋转 90/180/270/360 度；重叠边框使用同位置计数 |
| TOUCH HOLD | TouchHoldSkins 族；0/1/2/3 在右上/右下/左下/左上，旋转 135/45/-45/-135 度；边框按持续时间遮罩 |
| TOUCH HOLD 地雷边框 | 语义 `touchhold_mine_border.png` 映射到现有对象 `TouchHoldSkins/touchhold_break_mine.png`，不修改线上名字 |
| Each、轨道箭头、WIFI、完成提示 | NoteGuideSkins、SlideSkins、WifiSkins、SlideOKSkins；路径表统一箭头、星星和完成提示；左右完成提示在镜像时换向，文字不作位图反射 |
| 判定特效 | 八张 ViewX 原始特效 PNG、Prefab 和动画曲线随 bundle 加载；HOLD 10 次/秒、0.3 秒粒子；烟花颜色与径向遮罩按原 Shader 移植 |

`skinSemantics.ts` 是本地别名与锚点/切片契约。四张带文件名对照图位于
`apps/mobile/build/maimai-skin-audit/contact-1.png` 至 `contact-4.png`，已检查花瓣编号、
Each、EX、Break、Mine、左右完成提示和 WIFI 原生弯折形状。只排除无调用的
`hold_off.png`、`touchhold_off.png`，其余 145 个 S3 贴图随预览暂存。

缓存继续使用共享计划执行器；文件名为 `skin/修订_扁平对象名`，正解音文件名含内容哈希。
同大小旧修订不会复用新修订身份。共享执行器仍按文件大小校验；运行时核对图片实际尺寸。
S3 贴图仍由 `skin-data.js` 注入；缺少必需资源或尺寸错误时阻止播放。

S3 皮肤记录为项目所有者自行绘制。新增的 ViewX 内置特效另行保留上游版权及 GPL
许可，原始生成输入和 PNG 位于 `scripts/maimai-reference/Effects/`；不得把它们记为
用户原创。完整许可与组合源码要求见根 `THIRD_PARTY_NOTICES.md`。

## 运行与复现

在 `apps/mobile` 执行：

```powershell
node scripts/audit-maimai-skin.mjs
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
`check-maimai-player.mjs` 校验实际 `player.bundle` 与 `player.js` 一致，再检查实际页面的
播放、暂停、跳转、循环操作、变速、水平镜像、图片背景、全屏与退出停音；包含普通谱面
和 Buddy。谱面/音乐请求由测试数据拦截，音频调度使用真实 AudioContext 节点；
这不是 LXNS 在线曲库或人耳音画同步验收。

本地工程检查：lint 无警告/错误，应用与完整播放器 typecheck 通过；Vitest 1404 项通过、
5 项跳过，Jest 534 项通过。共享屏幕、资源、注入和生命周期合同包含在完整测试内。
`git diff --check` 通过，生成的 `player.js` 与 `player.bundle` SHA-256 相同。
单屏和 Buddy 页面无运行异常，变速分别取消 3/7 个旧正解音节点，退出后所有音频节点停止。
本次公共路径核验没有新增跨游戏组件引用、共享层反向依赖或共享渲染中的游戏分支；
搜索 `chart-preview-shared` 的解析/皮肤能力后，舞萌的 simai、SV、路径和贴图变换保留在
专属目录，共享层继续承担计划执行、注入、屏幕壳、桥接与时钟。

## 验收边界

- 已有原始 MajSimai/C# 解析、标准/自定义/连接路径数据对照和本播放器截图；当前环境
  没有可运行的 Unity/ViewX，尚无同皮肤、同谱面、同一时刻的双端截图差分，不能宣称视觉完全一致。
- Canvas 烟花采用 512 像素着色缓存与 128 段径向渐变；色相绑定谱面时间以支持拖动重建。
  Canvas 与 Unity 的滤波、混合及粒子相位仍需实际连续画面对照。
- iOS、Android WebView 真机播放、后台返回、反复循环边界、变速听感、视频背景、
  内存峰值与帧率尚未验收。桌面浏览器帧数不能作为手机性能结论。
- 未执行原生 Release 构建、提交、push 或线上资源变更。
