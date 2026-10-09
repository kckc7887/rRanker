# rRanker 技术架构

## 工程与入口

移动应用位于 `apps/mobile`，使用 Expo 54、React Native 0.81、React 19、Expo Router 6、TypeScript 5.9。入口是 `expo-router/entry`，启用 New Architecture。Node 最低版本为 22.13。

| 目录 | 内容 |
|---|---|
| `apps/mobile/app` | 文件路由、根布局与标签页 |
| `apps/mobile/src/domain` | 游戏模型、计算、筛选与持久化格式 |
| `apps/mobile/src/providers` | 上游请求、认证和响应转换 |
| `apps/mobile/src/storage` | SQLite、KV 与 SecureStore 读写 |
| `apps/mobile/src/services` | 取数、资源下载、会话提交与上传 |
| `apps/mobile/src/state` | Zustand 状态、QueryClient 与生命周期 |
| `apps/mobile/src/hooks` | 查询及页面动作 |
| `apps/mobile/src/components`、`screens` | 共享组件和游戏页面 |
| `apps/mobile/src/features` | 成绩图、谱面预览、下载及工具功能 |
| `apps/mobile/scripts` | 播放器生成、素材生成与依赖功能补丁 |
| `apps/mobile/modules` | 应用专用 Expo 原生模块 |
| `.github` | CI、原生构建和手动设备诊断 |

## 启动与导航

`app/_layout.tsx` 装配生命周期、启动恢复、QueryClient、主题、通知和导航。`useAppStartup` 恢复主题、图标字体与账号；主题读取最多等待 1.5 秒，未完成的操作继续执行。可选账号来源读取失败只影响对应来源，可由现有恢复入口重试。调试偏好默认关闭，恢复完成后才允许添加示例账号。

`useAppRuntime` 处理路由记录、展示数据恢复、存储维护和前后台动作。后台取消前台工作、暂停上传等待和查询；回到前台后恢复仍活动的未完成查询、待保存偏好和凭据。短暂 `inactive` 不释放页面；内存警告才清理非活动查询与图片内存。

主标签为总览、最佳、成绩、曲库、设置。`CachedTabScreen` 保留已挂载页面，通过活动上下文暂停不可见页面的查询通知和重工作。账号元数据由根部 `AccountMetadataObserver` 同步。

详情路由统一为 `/songs/[songId]`。`domain/detail-target.ts` 的 `decodeDetailTarget(params)` 要求显式 `gameId`；舞萌使用 `chartType`、`levelIndex`，osu! 使用模式和 `beatmapId`，其他游戏使用自己的当前目标字段。跨游戏跳转先选择账号，再显示目标；无效参数显示空态。链接通过 `detailTargetHref` 生成。

## 游戏取数

`hooks/use-game-data.ts` 通过 `services/game-data-query.ts` 与 `services/game-data-loaders.ts` 取得各游戏的实际载荷。QueryClient 保存在 `state/query-client.ts`，展示转换位于 `features/game-content/adapters`。

| 游戏 | 主要来源与数据 |
|---|---|
| 舞萌 | 水鱼或 LXNS 账号成绩、LXNS 曲库、DXRating 标签；歌曲详情的五维难点先读舞萌资源缓存，与 LXNS 普通谱面及难度逐项核对，缺失时读取发布桶 `DXTag/all.json` |
| CHUNITHM | LXNS 成绩、曲库、个人资料与合集 |
| Phigros | Kyou 认证与云存档、发布资源中的曲库和定数 |
| ADOFAI | TUF 玩家、最佳成绩和关卡 |
| Muse Dash | 玩家、相册、最佳与歌曲明细 |
| Phira | 玩家、谱面、成绩与排行榜 |
| osu! 四模式 | OAuth、玩家成绩、谱面集及回放 |
| Majdata Net | Cookie 账号、成绩、歌曲摘要与 Simai 文本 |
| Rizline | 设备登录、存档与发布资源曲库 |

舞萌、CHUNITHM、Phigros、Muse Dash 的示例账号是可开关的产品功能，与真实账号使用相同展示路径。

Majdata 详情在当前可见难度的物量计算中，复用已下载的 Simai 文本，通过 `features/simai-difficulty` 在端内计算 DXTag 五维难点。该模块保留 DXTag 的解析、时值、几何与固定标尺，支持七个谱面槽位。结果与预览解析模型、物量一起按歌曲 ID、谱面 hash 和难度缓存；无法分析时保存 `null`，详情不显示雷达或分析提示。解析缓存必须包含 `difficultyScores`，结构不支持时只重建对应条目，并复用原始文本缓存；I/O 失败继续报错。请求共享、取消及清缓存后的写入保护沿用 Majdata 资源入口。

HTTP 请求使用 `totalAttempts` 表示总尝试次数。认证、轮询、取消和有副作用的 POST 按各自实际请求规则执行。上游现行 API、谱面和回放格式由对应 Provider 或引擎解析。

查询通常先显示当前本地缓存，再后台刷新。失败回退保留原提供方和抓取时间，不能标成刷新成功。`cache-first.ts` 提供这条公共路径；共享请求独立取消消费者，最后一个消费者离开才取消底层工作。需要批量明细的页面使用现有有界查询，Majdata 实际歌曲请求共用四路队列。舞萌五维难点整库写入 `maimai:dxtag:all` 资源缓存，与当前 LXNS 曲库逐项核对歌曲、SD/DX 类型及难度，排除宴谱。覆盖完整则持续复用，不设时间有效期；覆盖不足时读取 `DXTag/all.json`，更新失败保留缓存及原抓取时间并标记暂存结果。

清理缓存或解绑先使对应写入代次失效，随后取消查询并删除缓存。SQL 提交和会话提交前检查请求是否仍有效，迟到结果不能重新填回已清理的数据。

ADOFAI 个人曲库按收藏关卡 ID 加载详情，复用单关卡查询缓存与三路有界加载，单项失败保留收藏及标签。ADOFAI 随机池补页随前后台和页面焦点取消，迟到结果不提交；恢复后仅补未完成页。

舞萌、中二、Phigros、Muse Dash 随机页分别展示曲库和成绩失败并提供重试，有缓存时继续使用。无成绩缓存时仍可普通抽取，成绩显示缺失；启用成绩筛选则暂停抽取。Muse Dash 的专辑和定数缺失时等待或重试，角色与精灵资料失败不阻断随机池。

## 状态与持久化

`session-store.ts` 保存当前游戏、账号、会话映射和派生的活动视图。`session-provider-resolver.ts` 缓存实际 Provider，`session-providers.ts` 构造游戏所需依赖。绑定和轮换由 `session-credential-service.ts` 提交；共享凭据变化同步到关联账号。异步取消、重新绑定和凭据轮换均在最终提交处检查当前身份。

| 数据 | 当前存储 |
|---|---|
| 会话 | SecureStore 凭据、KV v4 账号索引；恢复失败不冒充空账号 |
| ScoreHub | v3 账号索引、分片安全令牌 |
| 可选账号档案 | 所属账号 Store 的当前目录格式 |
| 偏好 | `createPreferencesStore` 或所属 Store，按键串行读写与失效重建 |
| 成绩、资源 | `SqliteSnapshotRepository`；成绩 schema 5，资源使用所属模块版本 |
| 个人曲库 | `SqliteUserLibraryRepository`，schema 4，条目、标签与预设 |
| 运行日志 | 独立日志数据库及当前诊断文件 |
| 图片和游戏资源 | 对应文件缓存与发布修订目录 |

所有应用数据只支持当前版本和结构。成功读取后发现不支持的内容，重建对应键或表；存储 I/O 失败继续报错，不触发清空。会话索引失效重建为空账号，单个失效凭据只移除关联账号。个人曲库只重建所属表；快照和资源缓存只删除失效条目，条件删除避免误删等待期间的新缓存。

`key-value-storage.ts` 提供按存储实例和键串行的完整操作队列，账号目录、示例账号、临时账号和偏好共用。ScoreHub 成功读取到失效令牌后仅移除对应账号索引；所有读取与索引提交完成后才清理无用引用，I/O 失败保留目录。正常安全写入采用 SDK 返回结果，提交异常保留回滚保护。

个人曲库备份格式为 `rranker-user-data`、版本 3，条目必须包含 `gameId`。导出通过仓库的 `readBackup` 在同一次队列任务读取条目和预设。导入先解析当前格式，旧备份直接拒绝；合并或替换在同一 SQLite 事务内提交条目和预设，失败回滚。备份不包含登录凭据和成绩缓存。

业务数据库的 schema 初始化、事务、写入和个人曲库外部读取共用 `runDatabaseWrite`。日志使用独立连接与队列，业务回滚不影响日志。队列任务不能再次进入同一队列。

主题与展示偏好使用 `preferences-write-coordinator.ts` 合并当前选择和串行落盘，失败保留待写内容。上传好友码的选择通过 `UploadPrefsStore` 按好友码保存；UI 的 `selectedAccountIds` 是派生视图。

诊断记录由 `runtime-diagnostics.ts`、`runtime-diagnostics-recorder.ts` 与日志仓库管理。记录默认关闭，开启后按容量保留；诊断文件的 pending/previous 替换是当前写入协议。分享副本写入临时缓存，正文保存在文档目录。生产诊断页面使用现有的记录、读取、清理和分享入口。

## 音游地图

音游地图沿用 `/tools/arcade-finder` 路由，上方地图、下方统一搜索、默认折叠筛选与独立列表。iOS 使用 `react-native-maps@1.20.1` 的 MapKit；Android ARM 使用 `expo-gaode-map@2.3.1`，x86、x86_64、Web 以及未配置地图的客户端使用列表。平台自动链接排除 Android 的 React Native Maps 和 iOS 的高德模块。`modules/arcade-map-support` 提供原生地点搜索、Android 架构与 Key 配置状态，并保留高德 SDK 所需的 R8 规则；安装依赖时的高德补丁阻止不支持架构在 Expo 模块启动期间恢复 SDK。

正式 Android 构建将仓库 Secret `AMAP_ANDROID_KEY` 传给 `app.config.js`，由高德插件写入原生配置。Key 不通过日志或客户端 `extra` 传递。高德服务说明经用户同意后才装配地图，同意状态由 SDK 持久化；拒绝仍可使用列表。定位沿用系统定位入口，地图操作不依赖定位授权。拖图停止 500 毫秒后，与当前查询中心的累计距离达到查询半径的 10%（最少 300 米）才查询；没有查询中心时直接查询。轻微移动保留当前请求和选中机厅，刷新及失败期间保留新范围内已有结果，并按新中心更新距离。卡片移动地图不重新查询；页面离开与后台状态取消请求，迟到结果不提交。

地图缩放与查询半径独立。首次定位和搜索选址使用约 2 公里的视野，再次定位和点击附近列表机厅只移动中心，保留当前缩放。公共地图提供放大、缩小与定位图标按钮，定位期间显示进度。放大和缩小按当前原生相机逐级调整，不改变中心或触发附近查询；Android 使用高德的缩放级别，iOS MapKit 使用相机高度。

Nearcade 机厅由 `services/nearcade-client.ts` 读取；GPS、内部地点、机厅和查询中心统一使用 WGS84。国内 MapKit、高德及 Nearcade 的 GCJ-02 坐标边界共用 `domain/arcade-coordinates.ts` 和 `gcoord@1.0.7`：相机与图钉传入原生地图前转换，拖图中心和原生地点搜索结果转回 WGS84。Nearcade 上游地区标识用于保留海外 WGS84 坐标。距离按查询中心计算，缺失距离显示“—”；营业时间按周一开始、关门小时可达 47 的格式解释，并包含前一日延续的营业时段。Android 生产路由设备检查包含 x86 列表降级；ARM 地图鉴权与 iOS 原生手势、定位仍须设备验证。

输入停止 350 毫秒后，`useArcadeSearch` 独立加载 Nearcade `/shops` 的跨城机厅和原生地点候选。机厅每页 20 条，地点最多 10 条；机型过滤传入附近与跨城查询，距离仅限制附近查询。iOS 地点搜索通过 `MKLocalSearch`，Android 通过高德输入提示，缺少坐标的地点选中后调用原生地理编码。两类结果分别显示失败和重试，选择后清空输入、收起键盘并查询新中心附近机厅；选中机厅保留为图钉和卡片。取消会中止 MapKit 搜索，高德回调释放后忽略迟到结果；原生查询超时为 12 秒。系统定位授权产生的短暂失活保留 GPS 意图，退到后台或离开页面则使其失效。

## 资源、图片与成绩图

Phigros、Rizline 和 Kyou 分别读取所属资源组的 `latest.json`，校验 schemaVersion 2 指针、清单 SHA-256 和对象摘要。清单位于 `manifests/<sha256>.json`，媒体按固定分类目录和内容哈希存放。Phigros 保留逻辑 `path`，通过 `objectKey` 定位实际资源；Rizline 曲库直接保存对象路径；Kyou 清单将表名映射到对象路径、大小和摘要。发布流程由 [rRankerResourcePublisher](https://github.com/kckc7887/rRankerResourcePublisher) 管理。

Phigros 物量读取发布资源 `metadata/note_counts.tsv`，按歌曲与 EZ、HD、IN、AT 难度装配 `chart.notes`。每格为 `[Tap,Hold,Drag,Flick]`，谱面根节点 `blockAreaList` 非空时追加数组长度作为 BLOCK。详情只在 BLOCK 大于零时显示该列，总计只累加四种音符。

下载取消后不提交临时文件，缓存命中复用当前资源。预览与谱面下载调用同一资源读取入口。Rizline 曲库缓存格式为 2；读取到其他格式时仅重建该曲库缓存，I/O 失败保留现有数据。

`RemoteImage` 使用显式 `cacheProfile`：thumbnail、artwork、native 或 none。在线图显示成功后才生成压缩缓存；不可见页面不开始新落盘，缓存解码失败时移除该压缩条目。Web 使用平台支持的图片路径。

成绩图各游戏使用公共预览、导出与 WebView 管理逻辑。素材、字体和布局由各自功能模块提供；捕获、保存或分享失败通过公共错误文案反馈。内存警告可卸载预览，再由用户降低分辨率后重新加载。

## 谱面与下载

四套生成播放器为 maimai、Phigros、osu!、Rizline。生成源位于各自 `webview-player`，生成物供宿主注入；共享 UI 与手势位于 `chart-preview-shared/webview-player`。

`chart-preview-screen-shell.tsx` 管理资源准备、WebView、前后台暂停、取消、seek 和释放。`chart-preview-bridge.ts` 只解析当前事件和设置信封，宿主命令由公共 serializer 生成。控制设置、播放状态和时间回传通过同一桥接路径。

播放器设置的存储读取失败进入重新加载流程并保留原偏好，成功读到损坏内容才重建对应键。舞萌、Majdata、Phigros、Phira、osu! 谱面包通过 `saveChartPackage` 保存，取消信号贯穿目录选择与最终写出检查。

Simai 的解析、时间轴、几何与渲染位于 `simai-chart-preview/engine`，预览与统计共用。Phigros/Phira 共用 PGR、RPE 配置与资源路径；osu! 使用当前谱面、皮肤和回放解析；Rizline 使用发布清单定位的谱面与音频。不可见或释放的播放器撤销帧、音源、监听器和所属临时资源。

舞萌与 Majdata 的 Simai 播放器保持保护套不额外高亮、绝赞滑轨使用绝赞配色。PGR 噪域显示默认开启，判定范围显示默认关闭，两项沿用公共桥接持久化并独立控制；青色框使用启用期间的区域变换与合成边界，不随视觉噪声或渐入渐出变化。RPE 不提供噪域选项。

普通谱面确认采用固定标题、固定播放画面和下方独立滚动区。曲名与难度数值同行显示，短曲名按内容宽度排列、标签紧随其后，长曲名在最多 12 个汉字宽度内往返滚动；难度使用游戏侧传入的 `PreviewDifficulty.value` 和配色，缺失数值显示“—”。舞萌路由传递定数，osu! 路由传递星数与难度名，其余复用准备阶段元数据。画面保留游戏比例并限制在标题下方可用高度的 55%，Buddy 保留双侧布局；舞萌实时详情固定两行，首行显示 BPM、拍位置和 FPS，次行显示 COMBO、BREAK，行内超宽横向滚动；所有谱面确认页隐藏原生及内部滚动条，保留滑动。

四套播放会话各自持有公共 `PlaybackLoop`，沿用原有时间单位和播放时钟，在自然结束前执行 AB 回跳。普通和全屏复用端点与热度区间，暂停、倍速和全屏切换保留标记，重载会话清除标记。全屏共用扁平控制卡片，方形锁定按钮与控制器右侧对齐，位于控制器上方 16px；整页非控件区域可唤出控制器，操作结束后重新计时 5 秒；锁定时只显示解锁入口。退出恢复普通模式滚动位置，Rizline 保持竖屏，其余沿用横屏。

原生下载和进度使用 `chart-download-shared`。谱面包准备由各游戏功能模块完成，公共下载层不生成游戏业务数据。

KALEIDXSCOPE 的日程、课题和手工进度位于 `domain/kaleidx-scope.ts`、`state/kaleidx-scope-progress.ts` 与工具页面；进度按账号保存，课题跳转使用实际舞萌详情目标。

实力分析路由按当前游戏装配舞萌或 Phigros 页面，账号切换重新挂载。舞萌使用当前账号全部普通谱面成绩、当前曲库与 DXTag 特征，统一以 SSS+（100.5%）为达标条件；逐维取达标谱面最高 10 个正值求平均，并从适级曲库推荐能提升薄弱维度的谱面。计算位于 `domain/maimai-strength-analysis.ts`，分析结果不单独持久化。`useMaimaiStrength` 复用成绩和曲库查询，并通过 `useMaimaiDxTag` 与详情页共享整库查询。LXNS 曲库快照更新时重新核对缓存覆盖；五维按谱面文件 ID 和难度取值，缺失项排除计算。查询沿用前后台生命周期、取消及资源缓存写入保护。页面展示简短的能力倾向标签、可点击雷达与练习谱面；练习谱面统一使用现有成绩卡，无成绩字段显示 `-`，曲绘遵循成绩卡设置。页面仅在加载或失败时显示状态并提供重试。

## 验证与构建

以下命令在 `apps/mobile` 运行：

| 命令 | 验证内容 |
|---|---|
| `npm ci --no-audit --no-fund` | 安装锁定依赖并执行现有功能补丁 |
| `npm run lint` | 应用、测试与配置 lint |
| `npm run typecheck` | 应用及四套播放器类型检查 |
| `npm test` | 单元与 UI 行为测试 |
| `npm run check:generated` | 四套播放器生成物一致性 |
| `npm run build:chart-preview` | 生成 maimai 播放器 |
| `npm run build:phigros-chart-preview` | 生成 Phigros 播放器 |
| `npm run build:osu-chart-preview` | 生成 osu! 播放器 |
| `npm run build:rizline-chart-preview` | 生成 Rizline 播放器 |
| `npm run prebuild:android` | 生成 Android 工程配置 |

测试验证实际输入输出、交互、取消、存储往返和 I/O 失败。外部 HTTP、原生 SDK、文件系统和浏览器环境可模拟；生产代码不提供测试替换、统计或 reset 接口。

postinstall 按实际源码调用点应用 decode-uri-component、Metro image-size、Xiaomi WebView、Expo FileHandle 和高德架构隔离的运行/构建补丁。高德原生构建沿用宿主 NDK 版本；R8 按官方配置保留 SDK，并对合包未提供的 `GnssSoftLocator`、`FastMath` 忽略缺失类告警。

### CI 与发布

`.github/workflows/quality.yml` 的 `changed-scope` 区分文档与功能变更。功能变更执行 lint、五组类型检查、单元/UI、生成物和 CI 脚本行为测试。`quality-gate` 汇总结果：必要作业失败、取消或意外跳过会失败，文档快速路径允许预期跳过。

四个原生构建作业互斥：正式仓库分支 push/手动触发走 Android/iOS 正式构建；向 master 提交的 fork PR 走双端测试构建。保留当前签名与发布条件，fork 作业不取得发布凭据。

Android 在同一作业内构建四个 ABI，校验 Manifest、签名和产物，安装 x86_64 APK 走生产路由冒烟，再上传最终产物。手动原生诊断入口位于 `android-recovery.yml`。

对外 APK 名为 `rRanker-arm64.apk`、`rRanker-armeabi.apk`、`rRanker-x86.apk`、`rRanker-x86_64.apk`；构建归档名保留版本、提交与运行标识。`resource-release.yml` 仅处理正式 Release 的 published 事件，通过 `RESOURCE_PUBLISHER_TOKEN` 向发布仓库的 `apk.yml` 发送 Release ID，并查询该次运行结果。令牌仅需发布仓库 Actions 读写权限，S3 凭据由发布仓库持有。发布仓库验证全部附件后更新 rranker 桶的四个 `release/rRanker-<ABI>.apk` 固定地址。

iOS 正式构建在同一 TestFlight 队列串行分配编号、签名、校验 IPA 并上传 App Store Connect。平台最低版本、Android 优化模式和原生插件以 Expo 配置为准。

单元、UI 和浏览器证据不能替代新 APK、iOS 设备、真实账号或云端 CI 的实际验证。
