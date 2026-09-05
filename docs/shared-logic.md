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
| JSON 请求 | `src/providers/http-json.ts`：`requestJson`、`fetchProviderJson`、`retryAfterMs` | 统一超时、取消、重试、429 退避和结构校验；以自身 AbortController 状态兼容 Expo 包装的取消错误，外部取消优先透传；游戏提供 base URL、Schema 与场景文案 | `http-json.test.ts`、各 Provider 测试 |
| 错误边界 | `src/providers/errors.ts`：`ProviderError`、`providerErrorFromStatus`、`providerErrorToUserMessage` | 底层 code/cause 用于诊断；所有用户可见出口必须转换为可行动文案 | `consumer-copy-policy.test.ts`、各 Provider 测试 |
| LXNS OAuth 请求 | `src/providers/lxns-oauth-request.ts` 与 `lxns-oauth.ts` | 舞萌和中二共享 OAuth 请求与令牌轮换骨架；游戏差异通过参数和账号映射表达 | LXNS OAuth、登录和 Session 测试 |
| 示例满成绩 | `src/providers/maxed-records.ts` 的 `buildMaxedScoreRecords` | 由游戏测试 Provider 提供真实目录和映射函数，不复制通用生成循环 | `maxed-*-test-provider.test.ts` |
| Repository | `src/repositories/{catalog,resource,snapshot,user-library}-repository.ts` | Service 依赖接口；SQLite 实现留在 `storage/`，页面不直接写数据库 | Repository、存储迁移和用户曲库测试 |
| 缓存优先 | `src/services/cache-first.ts`：`cacheFirstLoad`、`staleCached`、`isCacheFallback` | 统一“本地首屏、后台刷新、失败保留旧数据”；调用方提供读写和游戏语义 | `cache-first.test.ts` |
| 快照公共工具 | `src/services/snapshot-cache-utils.ts`：`makeSnapshot`、`snapshotSource`、`createInflightGuard`、`clearResourcesByPrefix` | 统一快照来源、并发去重和资源前缀清理 | 各游戏缓存测试 |
| 曲库与别名 | `src/hooks/use-aliased-catalog.ts`：`loadAliasedCatalog`、`useAliasedCatalog` | 游戏提供目录、别名查询和合并函数；Hook 统一查询时序和来源 | 曲库与搜索测试 |
| 最终数据 Query | `src/services/game-data-query.ts`：`GAME_DATA_QUERY_VERSION`、`gameDataQueryKey`、`readSettledGameDataBundle` | 账号、游戏、Provider、会话模式共同组成键；键结构变化时统一提升版本 | 游戏数据与同步测试 |

## 状态与持久化

| 能力 | 权威入口与主要导出 | 使用边界 | 主要验证 |
|---|---|---|---|
| Session | `src/state/session-store.ts`：`useSession`、`restoreSession`、令牌轮换函数 | 当前账号、游戏、Provider 与会话集中管理；页面不得维护第二份账号真相 | Session、账号切换、OAuth 测试 |
| QueryClient | `src/state/query-client.ts`：`queryClient`、`releaseInactiveQueries` | 全应用唯一实例；只有内存警告清理非活动 Query | 生命周期与缓存测试 |
| 生命周期 | `src/state/app-lifecycle-core.ts`、`app-lifecycle.tsx`：`AppLifecycleProvider`、`useAppLifecycle`、`getForegroundAbortSignal`、`waitForForeground` | 短暂 inactive、后台、前台代次和 memory warning 分开处理；异步任务传递 AbortSignal | `app-lifecycle.test.tsx`、下载生命周期测试 |
| 空闲任务与导航转场 | `src/state/idle-tasks.ts`：`scheduleIdleTask(callback): { cancel() }`、`beginNavigationTransition()`、`setIdleTasksPaused(boolean)`；`src/hooks/use-navigation-transition-listeners.ts` | 根栈和 `MainTabStack` 注册转场起止；Provider 在 inactive/后台取消原生空闲回调，前台重新调度尚未取消的工作；所有转场结束后才执行，取消后不得恢复；不使用 InteractionManager 判断动画结束 | `idle-tasks.test.ts`、生命周期与标签驻留测试 |
| 弹层关闭动作 | `src/hooks/use-modal-close-action.ts`：`useModalCloseAction(setVisible)`、`useModalDismissal(visible, onDismiss?)` | 单一待执行动作，替换旧动作，卸载清空；iOS 等待原生关闭事件，Android 等待宿主移除；切换、选择与登录 Sheet 通过可选 `onDismiss` 接入 | `modal-close-action.test.tsx`、总览账号切换测试 |
| 普通筛选 Store | `src/state/create-filter-store.ts` 的 `createFilterStore` | defaults 生成 setter；`clearKeys` 决定清空范围，游戏保留筛选字段语义 | 各游戏 filter 测试 |
| 持久化随机筛选 | `src/state/create-random-charts-filter-store.ts` 的 `createPersistedRandomChartsFilterStore` | 统一水合、脏写保护和串行保存；游戏提供偏好 Store 与默认值 | 随机歌曲测试 |
| 多账号列表 | `src/storage/create-account-list-store.ts` 的 `createAccountListStore` | 统一解析失败清理、normalize、upsert 和空列表删键 | 各账号 Store 测试 |
| 偏好设置 | `src/storage/create-preferences-store.ts` 的 `createPreferencesStore` | 支持全局单键和按账号/游戏 scope；迁移通过 `onMissing` 完成 | 偏好及迁移测试 |
| 示例账号 | `src/storage/create-demo-account-store.ts` 的 `createDemoAccountStore` | 单个可删除示例档案的公共持久化工厂 | 示例账号 Store 测试 |
| SQLite 与存储统计 | `src/storage/rranker-database.ts`、SQLite Repository、`src/features/storage-management/game-storage-adapters.ts` | 数据库连接与 Schema 初始化串行；统计和清理均经同一游戏适配器 | `storage-management.test.ts`、`storage-management-screen.test.tsx` |

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

## 跨层硬约束

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

- 舞萌播放器复用 `chart-preview-shared/webview-player/playbackClock.ts` 的 `PlaybackClock`。播放器入口被应用 `tsconfig.json` 排除，`maimai-chart-preview-webview.test.ts` 单独检查入口及其依赖的未定义名称；该检查不替代完整播放器类型检查。修改播放器后必须执行 `npm run build:chart-preview`，验证生成的 `player.js` 与应用加载的 `player.bundle` 一致，并完成运行时验收。

- 成绩图预览只挂载当前页 WebView，其余页使用轻量占位；不得让多份大 HTML 常驻。
- 谱面确认和下载任务必须响应卸载、后台与 AbortSignal，不得在取消后继续写缓存或显示成功。
- `ChartPreviewWebviewPlan.signal` 和准备入口的可选 AbortSignal 沿公共暂存路径传递；同批异步写入全部结束后才允许清理失败会话。文件 `copy()`、`move()` 均需 await，不能用同步 mock 掩盖提前读取或清理。
- `saveChartPackage(fileName, output, signal?)` 在目录选择及复制后检查取消，调用方必须 await 保存再清理源目录；`useChartPackageDownload` 只在未取消且仍挂载时显示成功。成绩图导出仍经 `requestBestImageExportPermission`、`saveBestImageCapture`，相册权限和保存使用 `expo-media-library/legacy`。
- 作为下游 memo 依赖的数组或对象必须保持稳定引用，避免无意义重算和重渲染。

## 新增或修改功能时的检查顺序

1. 用 `rg` 搜索能力名、导出名和相邻游戏调用方，不从文件名猜签名。
2. 读取候选公共实现、类型、直接调用方和测试；确认缺省行为、错误边界和平台分支。
3. 能复用则通过适配器、配置、能力或插槽接入。需要扩展时优先增加可选语义并保持旧调用方缺省行为。
4. 新游戏先验证上游数据，再实现原始 Schema/Provider 与注册，随后实现规范化和展示适配器，最后接共享页面。
5. 至少覆盖歌曲、谱面、成绩映射，以及缺失数据、未游玩、满成绩和特殊难度等真实边界。
6. 按改动范围运行相关单元/UI/合同测试，再运行 lint、typecheck 和完整测试。Host 哈希与字符串金样出现差异时修正实现，不通过更新基线掩盖差异。
7. WebView、导出、原生手势、动画流畅度、生命周期和内存行为仍需对应平台真机验收，自动化通过不能替代该链路。
