# rRanker 公共逻辑与复用边界

## 使用原则

本文是公共入口的唯一文档索引，但不是代码副本。开始修改前，先按能力定位候选入口，再读取实际类型、导出、调用方和测试。代码与本文不一致时以代码为准，并在同一任务修正文档。

公共层有稳定语义时必须复用；公共层无法表达真实业务时，先判断能否扩展为跨游戏稳定能力或组合插槽。只有不存在稳定共性时才保留游戏专属实现，不得为了形式统一丢失游戏语义。

依赖方向如下：

```text
app 路由 / 游戏容器
  -> 游戏 Hook、Service、适配器和配置
  -> 公共领域契约、公共功能、公共组件
  -> React Native / Expo / 上游与存储实现
```

- 游戏组件不得 import 其它游戏的组件、样式常量或主题表；共性必须上提到 `game-content`、`domain` 或对应共享 feature。
- `components/game-content`、`features/chart-preview-shared`、`features/chart-download-shared` 和 `features/best-image` 的可复用核心不得 import 游戏组件。
- 共享渲染契约和组件不得通过 `if/switch (gameId)` 枚举现有游戏。差异通过适配器、判别联合、能力、主题值、配置或插槽表达。
- `GAME_OPTIONS`、`GAME_TOOLBOXES`、`GAME_STORAGE_ADAPTERS`、中央数据编排和游戏适配器属于组合边界，可以显式注册或分派游戏，但不得把分支扩散进共享渲染核心。

### 当前结构核验

- `components/game-content`、`features/chart-preview-shared`、`features/chart-download-shared` 和 `features/best-image` 当前没有引用游戏组件，也没有按具体 `gameId` 分支渲染。
- 当前跨游戏组件引用并未完全消除：`components/phira/PhiraSongRow.tsx` 直接使用 `PhigrosDifficultyBadge`；`components/phira/PhiraScoreCard.tsx` 直接使用 `PhigrosDifficultyBadge`、`PhigrosRateBadge`、`resolvePhigrosRate`、`PhigrosScoreValue` 和 `PhigrosXingBadge`。这些 Phigros 路径不是公共入口，禁止作为新代码的复用先例；后续触及这组实现时，应先把稳定语义上提到 `game-content` 或 `domain`。

## 领域与展示契约

| 能力 | 权威入口与主要导出 | 使用边界 | 主要验证 |
|---|---|---|---|
| 跨游戏内容模型 | `src/domain/game-content.ts`：`GameContentId`、`GameChartIdentity`、`GameSong`、`GameChart`、`GameScore`、`GameNoteGroup`、`GameContentAdapter` | 只承载稳定身份、排序、曲库映射和可展示语义；游戏字段保留在有类型的 `extension` | `game-content-adapters.test.ts`、`future-game-render-contract.test.tsx` |
| 展示模型 | `src/features/game-content/presentation.ts`：`MetricPresentation`、`BadgePresentation`、`ScoreCardPresentation`、`SongRowPresentation`、`BestSectionPresentation`、`ChartCardPresentation` | 页面容器生成 presentation；共享组件不读取游戏 Hook 或原始 Provider DTO | `game-content-adapters.test.ts`、`game-content-host-contract.test.tsx` |
| 游戏适配器 | `src/features/game-content/adapters/index.ts` 及同目录游戏适配器 | 在此完成原始歌曲、谱面、成绩和展示模型转换；允许适配器解释本游戏字段 | `game-content-adapters.test.ts` |
| 当前账号数据包 | `src/domain/game-data.ts` 的 `GamePayload`、`GameDataBundle`；`src/hooks/use-game-data.ts` | 判别联合保留各游戏载荷；Hook 是中央编排，不是无游戏分支的公共渲染组件 | 游戏 Provider、缓存和页面测试 |
| 游戏与能力注册 | `src/domain/game-bind-options.ts`、`game-profile.ts`、`game-mode-family.ts`、`game-toolbox.ts` | 新游戏或模式在注册表组合；页面通过查询函数消费，不复制注册信息 | `game-mode-family.test.ts` 及工具箱测试 |

## Provider、仓库与数据服务

| 能力 | 权威入口与主要导出 | 使用边界 | 主要验证 |
|---|---|---|---|
| Provider 契约 | `src/providers/contracts.ts`：`ProviderSession`、`AuthProvider`、`ScoreProvider`、`CatalogDrivenScoreProvider`、`CatalogProvider`、`DetailedCatalogProvider` | 每个游戏保留自己的 DTO 与 Schema；示例账号的曲库驱动成绩实现 `CatalogDrivenScoreProvider` | 各 Provider 测试、`maxed-*-test-provider.test.ts` |
| HTTP 请求 | `src/providers/http-json.ts`：`requestJson<T>(options)`、`requestBytes(options)`、`fetchProviderJson`、`retryAfterMs` | JSON 和原始字节复用同一超时、取消、重试、429 退避和错误归一化执行器；游戏提供 base URL、Schema 与场景文案 | 各 Provider 测试、`phigros-resources.test.ts` |
| 内容摘要 | `src/utils/resource-integrity.ts`：`sha256(bytes)`、`bytesToHex(buffer)`；`src/utils/crypto-subset.ts`：`uint8ArrayToWordArray(bytes)`、`bytesToBase64(bytes)` | 通过现有 Expo Crypto 和 CryptoJS 能力计算摘要、编码；字体缓存保留摘要兼容导出，游戏不得反向依赖字体功能 | 字体缓存、Phigros 资源与存档测试 |
| Phigros 发布事务 | `src/services/phigros-resources.ts`：`phigrosResources`、`load(signal?, check?)`、`withRelease(action, signal?, check?)`、`verifyPhigrosResource(bytes, asset)` | Phigros 各调用方共用唯一会话发布；校验所有必需元数据后原子替换，实际资源使用修订 URL 和大小/SHA-256 校验；失败强制绕过缓存重读一次，取消以消费者计数管理 | `phigros-resources.test.ts`、`phigros-catalog-notes.test.ts`、`phigros-score-revision.test.ts` |
| 错误边界 | `src/providers/errors.ts`：`ProviderError`、`providerErrorFromStatus`、`providerErrorToUserMessage` | 底层 code/cause 用于诊断；所有用户可见出口必须转换为可行动文案 | `consumer-copy-policy.test.ts`、各 Provider 测试 |
| LXNS OAuth 请求 | `src/providers/lxns-oauth-request.ts` 与 `lxns-oauth.ts` | 舞萌和中二共享 OAuth 请求与令牌轮换骨架；游戏差异通过参数和账号映射表达 | LXNS OAuth、登录和 Session 测试 |
| 示例满成绩 | `src/providers/maxed-records.ts` 的 `buildMaxedScoreRecords` | 由游戏测试 Provider 提供真实目录和映射函数，不复制通用生成循环 | `maxed-*-test-provider.test.ts` |
| Repository | `src/repositories/{catalog,resource,snapshot,user-library}-repository.ts` | Service 依赖接口；SQLite 实现留在 `storage/`，页面不直接写数据库 | Repository、存储迁移和用户曲库测试 |
| 缓存优先 | `src/services/cache-first.ts`：`cacheFirstLoad`、`staleCached`、`isCacheFallback` | 统一“本地首屏、后台刷新、失败保留旧数据”；调用方提供读写和游戏语义 | `cache-first.test.ts` |
| 快照公共工具 | `src/services/snapshot-cache-utils.ts`：`makeSnapshot`、`snapshotSource`、`createInflightGuard`、`clearResourcesByPrefix` | 统一快照来源、并发去重和资源前缀清理 | 各游戏缓存测试 |
| 曲库与别名 | `src/hooks/use-aliased-catalog.ts`：`loadAliasedCatalog`、`useAliasedCatalog` | 游戏提供目录、别名查询和合并函数；Hook 统一查询时序和来源；可选 `retry` 允许已自行恢复的服务关闭外层重试 | 曲库与搜索测试 |
| 最终数据 Query | `src/services/game-data-query.ts`：`GAME_DATA_QUERY_VERSION`、`gameDataQueryKey`、`readSettledGameDataBundle` | 账号、游戏、Provider、会话模式共同组成键；键结构变化时统一提升版本 | 游戏数据与同步测试 |

Phigros 曲库复用 `loadAliasedCatalog` / `useAliasedCatalog` 的来源与别名合并，
`use-phigros-catalog.ts` 的 `refreshPhigrosCatalog()` 统一主动更新入口。
`usePhigrosResourceSync()` 只在启动恢复到 Phigros、从其它游戏进入 Phigros 时检查；
总览手动同步直接调用同一刷新入口。查询键保持会话有效，标签切换不重复同步，曲库不持久化。
Phigros 关闭查询层重复重试，发布服务负责唯一的一次恢复重拉。
资源修订变化使中央 `useGameData` 的 Phigros 查询失效，成绩载荷的可选 `resourceRevision`
决定持久化快照是否仍匹配定数；离线可保留已有快照。新修订计算完成前不写入新成绩快照。
相关入口合同由 `phigros-resource-sync.test.tsx`、`use-phigros-catalog.test.tsx` 和
`phigros-score-revision.test.ts` 覆盖。

## 状态与持久化

| 能力 | 权威入口与主要导出 | 使用边界 | 主要验证 |
|---|---|---|---|
| Session | `src/state/session-store.ts`：`useSession`、`restoreSession`、令牌轮换函数 | 当前账号、游戏、Provider 与会话集中管理；页面不得维护第二份账号真相 | Session、账号切换、OAuth 测试 |
| QueryClient | `src/state/query-client.ts`：`queryClient`、`releaseInactiveQueries` | 全应用唯一实例；只有内存警告清理非活动 Query | 生命周期与缓存测试 |
| 生命周期 | `src/state/app-lifecycle-core.ts`、`app-lifecycle.tsx`：`AppLifecycleProvider`、`useAppLifecycle`、`getForegroundAbortSignal`、`waitForForeground` | 短暂 inactive、后台、前台代次和 memory warning 分开处理；异步任务传递 AbortSignal | `app-lifecycle.test.tsx`、下载生命周期测试 |
| 普通筛选 Store | `src/state/create-filter-store.ts` 的 `createFilterStore` | defaults 生成 setter；`clearKeys` 决定清空范围，游戏保留筛选字段语义 | 各游戏 filter 测试 |
| 持久化随机筛选 | `src/state/create-random-charts-filter-store.ts` 的 `createPersistedRandomChartsFilterStore` | 统一水合、脏写保护和串行保存；游戏提供偏好 Store 与默认值 | 随机歌曲测试 |
| 多账号列表 | `src/storage/create-account-list-store.ts` 的 `createAccountListStore` | 统一解析失败清理、normalize、upsert 和空列表删键 | 各账号 Store 测试 |
| 偏好设置 | `src/storage/create-preferences-store.ts` 的 `createPreferencesStore` | 支持全局单键和按账号/游戏 scope；迁移通过 `onMissing` 完成 | 偏好及迁移测试 |
| 示例账号 | `src/storage/create-demo-account-store.ts` 的 `createDemoAccountStore` | 单个可删除示例档案的公共持久化工厂 | 示例账号 Store 测试 |
| SQLite 与存储统计 | `src/storage/rranker-database.ts`、SQLite Repository、`src/features/storage-management/game-storage-adapters.ts` | 数据库连接与 Schema 初始化串行；统计和清理均经同一游戏适配器 | `storage-management.test.ts`、`storage-management-screen.test.tsx` |

### 诊断记录

- `services/runtime-diagnostics-recorder.ts` 的 `recordRuntimeDiagnostic(type, fields?)`
  返回 `Promise<void>`；同步分发到手动记录器，再调用简要诊断记录器，两者失败均不传播到业务。
  `recordRuntimeError(source, error, fatal?, context?)` 统一错误采集，兼容原三参数调用。
  可选 `RuntimeErrorContext` 包含 phase、operationId、pageIndex 和受限 errorCode。
  同一入口的 `nextRuntimeOperationId()` 分配进程内编号；`createRuntimeOperation(source)`
  返回编号及 `record(phase, fields?, generation?)`，按内容代次、阶段、页序号和结果去重，
  输出操作累计耗时。底层调用方只依赖该轻量入口，不引入日志存储或页面依赖。
- `services/runtime-logs.ts` 提供 `initializeRuntimeLogs()`、`recordRuntimeRoute(segments)`、
  `shareRuntimeLog(id)` 和唯一 `runtimeLogs` 控制器。控制器公开 `start()`、`stop()`、
  `setCapacity(1000 | 2000 | 5000)`、`subscribe()`、`getSnapshot()` 与 `snapshot(id)`。
  页面订阅状态，不直接写数据库；容量和 `enabled` 偏好复用 `createPreferencesStore`。
  `start()`、`stop()`、`setCapacity()` 均返回 `Promise<void>`，串行保存用户选择。
  状态中的 `enabled` 表示持久开关，`activeId` 表示当前记录，保存失败不自动关闭开关。
- `domain/runtime-log.ts` 定义类型与脱敏：字段白名单、基于类别的错误摘要、最多 30 个
  堆栈位置和单条 8 KiB 上限；不读取任意异常的序列化结果。路由传入 `useSegments`
  返回的模板，HTTP 入口记录固定场景名，不传入地址、账号或请求载荷。
  模板允许数字固定路径；控制器为普通事件补充当时的路由。HTTP 三个公共请求入口接受
  可选 `diagnosticScenario?: RuntimeRequestScenario`，调用方按明确用途传入枚举值；
  开始与各尝试结果共享 operationId，错误码使用公共归一化结果，主动取消不带错误堆栈。
  查询/变更终态错误补充 `phase: final`，只提取白名单错误码，不读取 Query Key 或任意 cause 链。
  `runtimeBuildContext(nativeBuild, configuredBuild)` 区分构建号的原生、配置和未知来源。
- `storage/rranker-database.ts` 的 `getRuntimeLogDatabase()` 管理独立日志连接；
  `RuntimeLogRepository` 统一事务创建、增量追加、容量裁剪、结束和恢复。成功创建第三份
  才淘汰最旧记录；每份独立保留最后 N 条。每次启动恢复开启偏好后创建新记录，
  包含当前记录在内保留两份；进程内重复初始化、页面切换及前后台切换不另建记录。
  控制器只在追加成功后更新内存条数和时间，不对每条事件调用 list；状态转换重新读取。
  Repository 快照复用 sequence 输出 summary 的 totalCount、retainedCount、trimmedCount、
  firstAt、lastAt 和 byType；后两项时间及类型统计只覆盖保留事件。控制器补充 snapshotAt，
  不修改已有 formatVersion、记录结构或数据库表，旧记录继续分享。
- 日志正文不属于缓存；分享副本复用 `expo-sharing` 和现有 `rranker-` 临时缓存规则。
  `runtime-diagnostics.ts` 的 `snapshotRuntimeDiagnostics(): Promise<RuntimeDiagnosticStore>`
  将读取排入既有串行队列，返回独立快照，保持最近三次启动/256 条事件的上限。
  `shareRuntimeLog(id): Promise<void>` 先同步固定所选日志，再立即排入简要诊断读取；
  完成的单个 JSON 文本增加 `diagnostics` 字段，不改变日志事件、统计、formatVersion 或存储。
  `exportRuntimeDiagnostics(): Promise<void>` 复用同一快照入口，只供无日志空态分享诊断信息。
  两种分享均在文件完成后打开系统面板，并防止各自操作期间的重复分享。
- 诊断页面继续通过 `useSyncExternalStore` 订阅唯一控制器，开关反映 enabled，
  运行状态结合 activeId、记录状态、ready、busy 与 failed，不从开启偏好推断正在记录。
  最新/上次标签沿 Repository 创建顺序；开关通过 `useAppTheme()` 复用个性化页的
  原生 Switch 轨道和滑块颜色，滚动区按压复用 `DetailGestureRoot` / `DetailPressable`。
  每份日志提供分享，只有加载成功的无日志空态提供“分享诊断信息”；失败走公共通知与重试。
- `runtime-logs.test.ts` 使用真实内存 SQLite 检查事务、保留、恢复、失败和脱敏，
  并覆盖公共 HTTP/查询和异常监听合同；`runtime-log-sharing.test.tsx` 覆盖合并分享、
  旧记录、并发与失败重试，`runtime-diagnostics.test.tsx` 覆盖快照队列隔离、脱敏和容量上限。
  `diagnostics-screen.test.tsx` 覆盖主题色、新旧标签、状态、空态与分享交互，
  `settings-navigation.test.tsx` 覆盖设置入口和个性化行为。
  `chart-preview-screen-shell-contract.test.tsx` 覆盖准备阶段、去重、后台取消及迟到回调；
  `best-image-diagnostics.test.tsx` 覆盖公共导出控制器的捕获、保存、取消和超时日志，
  `phigros-best-image-preview.test.tsx` 验证现有游戏经公共壳采集就绪，不记录页面内容。
  根路由错误边界、平台异常终止和原生分享必须另做真机验收。

## 共享 UI 与交互

| 能力 | 权威入口 | 使用边界 | 主要验证 |
|---|---|---|---|
| 列表页面 | `src/components/game-content/GameListPages.tsx`：`BestListPage`、`RecordsListPage`、`CatalogListPage`、`RemoteImageFlatList` | 页面容器提供查询状态、presentation、筛选头和 renderItem；列表统一窗口参数与可见图片持久化 | `game-content-host-contract.test.tsx`、P3 host contracts |
| 成绩卡与歌曲行 | `GameScoreCard.tsx`、`GameSongRow.tsx` | 游戏传入 presentation、主题样式和插槽；详情路由、封面失败回退和可访问名称由公共组件处理 | `future-game-render-contract.test.tsx`、P3 card contracts |
| 筛选与范围 | `FilterShell.tsx`、`FilterCheckboxList.tsx`、`RangeSelector.tsx` | 公共层提供壳、摘要、控件与手势；游戏只定义字段、上下界和匹配纯函数 | `filter-shell-host-contract.test.tsx`、各游戏 filter-bar 测试 |
| 搜索与徽章 | `GameSearchHeader.tsx`、`GameDifficultyBadge.tsx`、`FlowingGradientValue.tsx`、`TintedRatingTag.tsx` | 复用结构和动画机制，颜色、等级和正式术语由游戏 presentation 或 domain 主题提供 | P3 visuals/cards contracts |
| 歌曲详情 | `SongDetailHero.tsx`、`SongDetailChrome.tsx`、`SongDetailChromeStyles.ts`、`SongMetadataTable.tsx`、`GameNoteTable.tsx`、`ChartCarousel.tsx`、`GameChartResultCard.tsx`、`AutoScrollText.tsx` | 页面保留游戏数据与动作，公共层负责布局、动态物量分组、导航和可复用卡片 | `song-detail-chrome-contract.test.tsx`、P3 song-details contract |
| 滚动区按压 | `DetailPressable.tsx`：`DetailPressable`、`DetailGestureRoot` | iOS 滚动区交互使用 gesture-handler Pressable 并局部放入手势根；Android 使用 RN Pressable；悬浮按钮不扩大手势根 | 详情 UI 测试 |
| 查询状态与通知 | `QueryStateView.tsx`、`AppNotification.tsx` | 页面统一加载、空态、重试和顶部通知；禁止直接显示底层错误文本，禁止页面使用 RN Alert | `consumer-copy-policy.test.ts` 及页面测试 |
| 标签页驻留 | `CachedTabScreen.tsx`、`tab-list-cache.ts` | 短暂 inactive、普通后台和失焦保留已挂载画面；通过 active context 暂停查询、动画和图片落盘，不用 Freeze 卸可见树；只有内存警告才释放失焦页 | `cached-tab-screen.test.tsx`、`tab-animation-lifecycle.test.tsx` |
| 远程图片 | `RemoteImage.tsx`、`services/remote-image-cache.ts` | 图片统一选择 native、none 或受控 profile；只有带 gameId 且进入持久化 scope 的可见图片写受控缓存；失活只暂停落盘，不拆已显示 source | `remote-image-cache.test.ts`、`remote-image.test.tsx`、列表合同测试 |

## 共享功能族

| 功能族 | 公共入口 | 游戏侧职责 | 主要验证 |
|---|---|---|---|
| 谱面确认 | `src/features/chart-preview-shared/`：`ChartPreviewScreenShell`、资源暂存、URI 解析、桥接、注入工厂、计划执行器、播放时钟与全屏锁。`prepareChartPreviewWebviewFromPlan` 按清单落盘；`fileName` 支持 `skin/Tap2.png` 相对路径；远程 `url+bytes` 有限并发下载，可选 `remoteCacheDirectory` 先按大小跳过下载再写入本次 session | 提供图表解析、资源清单、HTML/脚本配置和场景文案。舞萌皮肤 PNG 缓存到 `rranker-chart-preview-remote` 后由 writer 写成 `skin-data.js` data URL（对齐 Phigros `music-data.js`）；Phigros 皮肤仍用 `./skin/` 相对路径 | `chart-preview-screen-shell-contract.test.tsx` 及各游戏预览测试 |
| 谱面下载 | `src/features/chart-download-shared/`：下载会话目录、取消错误、命名、保存与 `useChartPackageDownload` | 组装具体资源、压缩包结构和成功文案 | `chart-package-download-lifecycle.test.tsx` 及各游戏下载测试 |
| 成绩图 | `src/features/best-image/`：桥接、状态机、偏好、资源加载、HTML 运行时、选择器、控制器、屏幕壳和导出 | 构建游戏卡片/HTML、素材清单、样式选项和分区语义 | `best-image-screen-contract.test.tsx`、HTML 金样和游戏成绩图测试 |
| 存储管理 | `src/features/storage-management/`：缓存策略、文件边界、游戏适配器、统计、清理、维护和图标字体恢复 | 在注册适配器中声明本游戏查询键、资源和清理动作 | `storage-management.test.ts`、`storage-cache-policy.test.ts` |

Phigros 的 `domain/phigros-chart-preview.ts` 提供
`loadPhigrosChartPreviewResources(target, signal, read?)`，预览和兼容包下载共用发布恢复与字节校验。
其共同定位器 `resolvePhigrosChartPreviewAssetBundle(...)` 按 `.0`、无编号、唯一编号目录选择默认谱面；
已有默认目录缺少所选难度时仍报错，不从其它变体拼接，确保匹配默认音乐。
`PhigrosChartPreviewTarget` 可选 `variantIndex` 指定编号谱面，优先匹配同编号音乐；清单中没有
专属音乐条目时使用歌曲共用音乐。专属音乐重复、下载失败或校验失败不得触发共用音乐回退；
未指定编号时保持默认规则。`phigros-resources.test.ts` 覆盖共用音乐、专属音乐与缺失资源。
`loadPhigrosChartPreviewVariants(target, signal)` 复用发布服务，按所选难度枚举并数字排序编号。
预览路由通过 `usePhigrosChartVariantSelection(target)` 组合公共 `showActionNotification(input)`
的队列和 `dismissNotification(id)`：先提示里谱，再展示非 `.0` 选项，单谱不弹窗。
选择期间复用 `ChartPreviewScreenShell` 的 waiting 状态，公共渲染层不增加游戏分支。
卸载与后台撤销弹窗及请求；交互由 `phigros-chart-variant-selection.test.tsx` 覆盖。
预览将已验证的谱面文本、音乐 Base64 和曲绘 data URL 交给既有配置与暂存计划；
下载通过可选 `read(asset, index)` 接入 `downloadChartResource` 的原生文件、取消和进度，
返回字节通过校验后才进入 ZIP。共享预览/下载核心不识别 Phigros 修订或音符。
相关合同包括 `phigros-chart-preview-resources.test.ts`、`phigros-chart-preview-screen.test.tsx`、
`phira-compatible-chart-download.test.ts` 和 `chart-preview-screen-shell-contract.test.tsx`。

## 跨层硬约束

### 打包与生成数据

- `metro.config.js` 是依赖裁剪入口：保留 Ionicons 子集映射，移动端仅重定向当前 Zod
  包内部的语言集合入口到 `src/utils/zod-locales.ts`。业务继续从 `zod` 导入，不能
  另建 Schema 工厂或替换错误类；默认英文初始化由原库执行。若增加校验语言需求，
  必须先扩展这个集合和 `metro-code-subsets.test.ts`，不能假定全集仍在移动包中。
- `decodeMaimaiQrFromImageUri(uri, signal?)` 仍是上传图片二维码的公共服务，解码器
  按深路径导入并沿用 jpeg-js 的类型；取消、识别结果、错误和临时图片清理合同由
  `maimai-qr-image-decode.test.ts` 保护，上传组件不得复制识别链路。
- 舞萌数值字典与 PNG IDAT 压缩仅属于构建时数据表示；`SLIDE_TABLE`、`AREA_LOOKUP`
  的运行时类型和值保持完整。特效 `sourceSha256` 标识原始输入，`sha256` 标识生成内容，
  两者不得混用。`maimai-generated-data.test.ts` 校验数据与像素，加载仍经现有播放器
  及 `prepareChartPreviewWebviewFromPlan(plan)`，不增加网络资源或缓存执行器。

### 用户文案与错误

- 用户界面只表达对象、动作、结果、风险和恢复方式，不显示 Schema、Provider、WebView、SecureStore、SQLite、PKCE、Token、响应或状态机等实现术语。
- 游戏正式术语、品牌名、单位、用户输入、上游内容、查分器来源和必要署名必须保留。
- 页面、通知、无障碍文本、WebView 和导出内容不得直接显示 `error.message` 或 `String(error)`；统一使用 `providerErrorToUserMessage` 或场景化兜底。
- 注释只保留许可证/来源、自动生成标记，以及非显然的正确性、安全和性能约束。修改前端文案或注释时运行 `tests/consumer-copy-policy.test.ts`。

### 图片与缓存

- 受控远程图片缓存当前为 v3：总计 10 MiB，单项最多 10 KiB，单线程变换；当前游戏分得 70% 预算，其余按最近使用分配。
- 列表图片达到 50% 可见并持续 250 ms 后才进入持久化 scope；在线资源作为主路径，本地压缩文件只作回退。失活只暂停落盘，不把已显示 source 置空。
- 存储管理显示范围、统计范围和删除范围必须来自同一策略与适配器。不得清空整个 Expo 缓存目录，以免删除框架字体等非业务文件。

### WebView 与内存

- 舞萌与 Majdata 播放器复用 `chart-preview-shared/webview-player/playbackClock.ts` 的 `PlaybackClock`。
  `configuration.ts` 集中定义 `ChartPreviewInjectConfig` 和设置类型，注入模块保留兼容导出；
  `createChartPreviewInjectors<TConfig>(spec)` 负责序列化入口，转义脚本边界并原样保留 `$`，`prepareChartPreviewWebviewFromPlan(plan)`
  负责资源暂存和清理。舞萌通过计划中的 `fileName` 加入皮肤修订/正解音哈希，复用共享
  `remoteCacheDirectory` 的大小校验，不另建缓存执行器或清理范围。
  `skin-data.js` 的键仍为原始 S3 对象路径，语义别名仅在 Simai `skinSemantics.ts` 解释。
  Simai `resolveStarSkin(path, pink)` 由 `buildFrame` 的统一命令入口调用，只替换普通
  `star.png` / `star_double.png`；`SKIN_DISPLAY_SIZE` 保留粉色资源的原显示占位和 EX 对齐。
  `EACH_COLOR` 同时供 Each 着色与全部 HOLD 持续圈使用；Slide 的 JUST 资源选择和
  打击星型图层过滤留在 Simai 引擎。图片/视频共用 `MainRenderer` 的居中圆形背景绘制，
  不扩展共享设置协议。`maimai-chart-preview-visual-settings.test.ts` 覆盖这些渲染合同。
  本地原始 `sensor.webp` 以 `moduleId` 复用共享暂存清单，并由既有 writer 注入同一
  `skin-data.js`；判定区的中心/缩放校准留在 Simai `skinSemantics.ts`，判定点复用
  音符几何 `buttonPoint`，判定区与判定线共用圆环和点的绘制路径。
  模型、Simai 扩展、路径、SV、帧命令与皮肤加载位于 `features/simai-chart-preview/`；通用 `chart-preview-shared` 壳不解释音符。
  `npm run typecheck` 包含 `typecheck:maimai-player`，完整检查播放器入口和引擎。
  修改播放器后必须执行 `npm run build:chart-preview`，验证 `player.js` 与应用加载的
  `player.bundle` 一致，并完成运行时验收。相关合同包括 `chart-preview-screen-shell-contract.test.tsx`、
  `maimai-chart-preview-webview.test.ts`、`maimai-chart-preview-remote-assets.test.ts` 和
  `maimai-chart-preview-reference.test.ts`；浏览器检查不能代替 iOS/Android WebView 验收。

- 成绩图预览只挂载当前页 WebView，其余页使用轻量占位；不得让多份大 HTML 常驻。
- 谱面确认和下载任务必须响应卸载、后台与 AbortSignal，不得在取消后继续写缓存或显示成功。
- 作为下游 memo 依赖的数组或对象必须保持稳定引用，避免无意义重算和重渲染。

## Majdata 与 Simai 公共路径

- `http-json.ts` 的 `JsonRequestOptions<T>` 支持 `init` 与 `onResponse`；JSON、字节和
  `requestProviderResponse(options, read)` 共用取消、超时、重试、Schema 和错误归一化。
  `http-cookies.ts` 提供 `responseCookies`、`cookieHeader` 和会话校验；Cookie 仅发送到
  明确的来源与路径。`PasswordLoginPanel` 复用登录表单、取消和前后台流程，游戏只提供登录动作。
- `majdataContentAdapter` 保留 UUID 和原始难度索引；DTO 不进入共享卡片逻辑。
  `SimaiScoreCardStyles` 由舞萌 `ScoreRecordCard` 与 Majdata 成绩卡共同使用，原难度配色与
  成就徽章继续复用 `ScoreVisuals`，Easy 在 Majdata 适配层提供蓝色主题。
  `DxRatingCard.valueRows` 支持多项数值；不传时保持原有 Rating 布局。
- `features/simai-chart-preview/configuration.ts` 提供两种游戏统一的配置。资源 URL 由路由
  提供，Majdata 可注入按 HASH 缓存的 `parsedChart`；缺少指定难度会报错，不选择其它难度。
  `simaiStatistics(chart)` 对同一 Chart 展开判定单位，同时保留本体、Break、Mine、EX。
  六类显示按 Mine 优先，其次 Break；连接滑条一条分支计一个本体，头部独立计数。
- `domain/tolerance.ts` 的计算、单音符损失、物量分析和同类容错增加可选 DX / Classic
  模式参数，默认 DX。Classic 奖励按基础总分归一化，上限由实际物量计算；无 Break 的 DX
  上限 100%，空谱结果 0%。MINE 行逐子类计算，不能将混合 MINE 总数作为统一权重。
- `chart-download-shared/simai-package.ts` 的 `downloadSimaiPackage(request, options)`
  执行资源下载、打包、取消、临时目录清理和保存。舞萌保留 `.adx.zip`，Majdata 使用 `.zip`，
  完整文本与音频、原格式封面、可选视频均走相同入口。封面按实际文件签名保存为
  `bg.png` / `bg.jpg`；无法识别时中止并清理临时目录，避免生成播放器无法读取的封面。
- `snapshot-cache-utils` 的 `captureResourceWrites(scope)` 与 `invalidateResourceWrites(scope)`
  让缓存清理使已返回首屏的后台刷新也失效。游戏缓存清理在枚举和删除前提升代次。
  Majdata 详情复用 `cacheFirstLoad`，文本请求复用 `createInflightGuard`；图片仍遵守公共
  10 MiB、10 KiB、50% / 250 ms 可见性规则，没有另建图片缓存。

合同覆盖 `majdata.test.ts`、`majdata-cache.test.ts`、`majdata-ui.test.tsx`、安全仓库与
下载测试，以及完整舞萌解析、预览、共享 UI 测试。独立 C# 样本来自 MajSimai 与
MajdataPlay 原始计分方法，普通测试无需 `refer/` 或 .NET；原生账号、保存和播放仍须真机验收。

## 新增或修改功能时的检查顺序

1. 用 `rg` 搜索能力名、导出名和相邻游戏调用方，不从文件名猜签名。
2. 读取候选公共实现、类型、直接调用方和测试；确认缺省行为、错误边界和平台分支。
3. 能复用则通过适配器、配置、能力或插槽接入。需要扩展时优先增加可选语义并保持旧调用方缺省行为。
4. 新游戏先验证上游数据，再实现原始 Schema/Provider 与注册，随后实现规范化和展示适配器，最后接共享页面。
5. 至少覆盖歌曲、谱面、成绩映射，以及缺失数据、未游玩、满成绩和特殊难度等真实边界。
6. 按改动范围运行相关单元/UI/合同测试，再运行 lint、typecheck 和完整测试。Host 哈希与字符串金样出现差异时修正实现，不通过更新基线掩盖差异。
7. WebView、导出、原生手势、动画流畅度、生命周期和内存行为仍需对应平台真机验收，自动化通过不能替代该链路。
