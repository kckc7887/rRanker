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
| 舞萌 | 水鱼或 LXNS 账号成绩、LXNS 曲库、DXRating 标签 |
| CHUNITHM | LXNS 成绩、曲库、个人资料与合集 |
| Phigros | Kyou 认证与云存档、发布资源中的曲库和定数 |
| ADOFAI | TUF 玩家、最佳成绩和关卡 |
| Muse Dash | 玩家、相册、最佳与歌曲明细 |
| Phira | 玩家、谱面、成绩与排行榜 |
| osu! 四模式 | OAuth、玩家成绩、谱面集及回放 |
| Majdata Net | Cookie 账号、成绩、歌曲摘要与 Simai 文本 |
| Rizline | 设备登录、存档与发布资源曲库 |

舞萌、CHUNITHM、Phigros、Muse Dash 的示例账号是可开关的产品功能，与真实账号使用相同展示路径。

HTTP 请求使用 `totalAttempts` 表示总尝试次数。认证、轮询、取消和有副作用的 POST 按各自实际请求规则执行。上游现行 API、谱面和回放格式由对应 Provider 或引擎解析。

查询通常先显示当前本地缓存，再后台刷新。失败回退保留原提供方和抓取时间，不能标成刷新成功。`cache-first.ts` 提供这条公共路径；共享请求独立取消消费者，最后一个消费者离开才取消底层工作。需要批量明细的页面使用现有有界查询，Majdata 实际歌曲请求共用四路队列。

清理缓存或解绑先使对应写入代次失效，随后取消查询并删除缓存。SQL 提交和会话提交前检查请求是否仍有效，迟到结果不能重新填回已清理的数据。

## 状态与持久化

`session-store.ts` 保存当前游戏、账号、会话映射和派生的活动视图。`session-provider-resolver.ts` 缓存实际 Provider，`session-providers.ts` 构造游戏所需依赖。绑定和轮换由 `session-credential-service.ts` 提交；共享凭据变化同步到关联账号。异步取消、重新绑定和凭据轮换均在最终提交处检查当前身份。

| 数据 | 当前存储 |
|---|---|
| 会话 | SecureStore 凭据、KV v4 账号索引；恢复失败不冒充空账号 |
| ScoreHub | v3 账号索引、分片安全令牌 |
| 可选账号档案 | 所属账号 Store 的当前目录格式 |
| 偏好 | `createPreferencesStore` 或所属 Store，按键串行写入 |
| 成绩、资源 | `SqliteSnapshotRepository`；成绩 schema 5，资源使用所属模块版本 |
| 个人曲库 | `SqliteUserLibraryRepository`，schema 4，条目、标签与预设 |
| 运行日志 | 独立日志数据库及当前诊断文件 |
| 图片和游戏资源 | 对应文件缓存与发布修订目录 |

所有应用数据只支持当前版本和结构。成功读取后发现不支持的内容，重建对应键或表；存储 I/O 失败继续报错，不触发清空。会话索引失效重建为空账号，单个失效凭据只移除关联账号。个人曲库只重建所属表；快照和资源缓存只删除失效条目，条件删除避免误删等待期间的新缓存。

个人曲库备份格式为 `rranker-user-data`、版本 3，条目必须包含 `gameId`。导入先解析当前格式，旧备份直接拒绝；合并或替换在同一 SQLite 事务内提交条目和预设，失败回滚。备份不包含登录凭据和成绩缓存。

业务数据库的 schema 初始化、事务和写入共用 `runDatabaseWrite`。日志使用独立连接与队列，业务回滚不影响日志。队列任务不能再次进入同一队列。

主题与展示偏好使用 `preferences-write-coordinator.ts` 合并当前选择和串行落盘，失败保留待写内容。上传好友码的选择通过 `UploadPrefsStore` 按好友码保存；UI 的 `selectedAccountIds` 是派生视图。

诊断记录由 `runtime-diagnostics.ts`、`runtime-diagnostics-recorder.ts` 与日志仓库管理。记录默认关闭，开启后按容量保留；诊断文件的 pending/previous 替换是当前写入协议。分享副本写入临时缓存，正文保存在文档目录。生产诊断页面使用现有的记录、读取、清理和分享入口。

## 资源、图片与成绩图

Phigros、Rizline 和 Kyou 分别读取所属资源组的 `latest.json`，校验 schemaVersion 2 指针、清单 SHA-256 和对象摘要。清单位于 `manifests/<sha256>.json`，媒体按固定分类目录和内容哈希存放。Phigros 保留逻辑 `path`，通过 `objectKey` 定位实际资源；Rizline 曲库直接保存对象路径；Kyou 清单将表名映射到对象路径、大小和摘要。发布流程由 [rRankerResourcePublisher](https://github.com/kckc7887/rRankerResourcePublisher) 管理。

下载取消后不提交临时文件，缓存命中复用当前资源。预览与谱面下载调用同一资源读取入口。Rizline 曲库缓存格式为 2；读取到其他格式时仅重建该曲库缓存，I/O 失败保留现有数据。

`RemoteImage` 使用显式 `cacheProfile`：thumbnail、artwork、native 或 none。在线图显示成功后才生成压缩缓存；不可见页面不开始新落盘，缓存解码失败时移除该压缩条目。Web 使用平台支持的图片路径。

成绩图各游戏使用公共预览、导出与 WebView 管理逻辑。素材、字体和布局由各自功能模块提供；捕获、保存或分享失败通过公共错误文案反馈。内存警告可卸载预览，再由用户降低分辨率后重新加载。

## 谱面与下载

四套生成播放器为 maimai、Phigros、osu!、Rizline。生成源位于各自 `webview-player`，生成物供宿主注入；共享 UI 与手势位于 `chart-preview-shared/webview-player`。

`chart-preview-screen-shell.tsx` 管理资源准备、WebView、前后台暂停、取消、seek 和释放。`chart-preview-bridge.ts` 只解析当前事件和设置信封，宿主命令由公共 serializer 生成。控制设置、播放状态和时间回传通过同一桥接路径。

Simai 的解析、时间轴、几何与渲染位于 `simai-chart-preview/engine`，预览与统计共用。Phigros/Phira 共用 PGR、RPE 配置与资源路径；osu! 使用当前谱面、皮肤和回放解析；Rizline 使用发布清单定位的谱面与音频。不可见或释放的播放器撤销帧、音源、监听器和所属临时资源。

普通谱面确认采用固定标题、固定播放画面和下方独立滚动区。曲名与难度数值同行显示，曲名宽 12 个汉字，超长往返滚动；难度使用游戏侧传入的 `PreviewDifficulty.value` 和配色，缺失数值显示“—”。舞萌路由传递定数，osu! 路由传递星数与难度名，其余复用准备阶段元数据。画面保留游戏比例并限制在标题下方可用高度的 55%，Buddy 保留双侧布局；实时详情保持单行和固定高度，超宽横向滚动。

四套播放会话各自持有公共 `PlaybackLoop`，沿用原有时间单位和播放时钟，在自然结束前执行 AB 回跳。普通和全屏复用端点与热度区间，暂停、倍速和全屏切换保留标记，重载会话清除标记。全屏共用扁平控制卡片，方形锁定按钮与控制器右侧对齐，位于控制器上方 16px；整页非控件区域可唤出控制器，操作结束后重新计时 5 秒；锁定时只显示解锁入口。退出恢复普通模式滚动位置，Rizline 保持竖屏，其余沿用横屏。

原生下载和进度使用 `chart-download-shared`。谱面包准备由各游戏功能模块完成，公共下载层不生成游戏业务数据。

KALEIDXSCOPE 的日程、课题和手工进度位于 `domain/kaleidx-scope.ts`、`state/kaleidx-scope-progress.ts` 与工具页面；进度按账号保存，课题跳转使用实际舞萌详情目标。

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

postinstall 按实际源码调用点应用 decode-uri-component、Metro image-size、Xiaomi WebView 和 Expo FileHandle 的运行/构建补丁。

### CI 与发布

`.github/workflows/quality.yml` 的 `changed-scope` 区分文档与功能变更。功能变更执行 lint、五组类型检查、单元/UI、生成物和 CI 脚本行为测试。`quality-gate` 汇总结果：必要作业失败、取消或意外跳过会失败，文档快速路径允许预期跳过。

四个原生构建作业互斥：正式仓库分支 push/手动触发走 Android/iOS 正式构建；向 master 提交的 fork PR 走双端测试构建。保留当前签名与发布条件，fork 作业不取得发布凭据。

Android 在同一作业内构建四个 ABI，校验 Manifest、签名和产物，安装 x86_64 APK 走生产路由冒烟，再上传最终产物。手动原生诊断入口位于 `android-recovery.yml`。

对外 APK 名为 `rRanker-arm64.apk`、`rRanker-armeabi.apk`、`rRanker-x86.apk`、`rRanker-x86_64.apk`；构建归档名保留版本、提交与运行标识。`resource-release.yml` 仅处理正式 Release 的 published 事件，通过 `RESOURCE_PUBLISHER_TOKEN` 向发布仓库的 `apk.yml` 发送 Release ID，并查询该次运行结果。令牌仅需发布仓库 Actions 读写权限，S3 凭据由发布仓库持有。发布仓库验证全部附件后更新 rranker 桶的四个 `release/rRanker-<ABI>.apk` 固定地址。

iOS 正式构建在同一 TestFlight 队列串行分配编号、签名、校验 IPA 并上传 App Store Connect。平台最低版本、Android 优化模式和原生插件以 Expo 配置为准。

单元、UI 和浏览器证据不能替代新 APK、iOS 设备、真实账号或云端 CI 的实际验证。
