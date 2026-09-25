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

### 结构检查

`npm run check:architecture`（`scripts/check-architecture.mjs`）解析 `src` 与 `app` 下的全部生产 `.ts`/`.tsx`
（import、export、`require` 与字符串字面量参数的动态 `import()`），按显式登记表判定模块归属并套用依赖矩阵，
通过时打印扫描文件数、`src + app` 范围与规则摘要：

- 归属登记在 `scripts/lib/architecture-modules.mjs` 的 `GAME_MODULES`：每个游戏模块声明自己拥有的组件目录
  （`components/<dir>/`）、页面文件（`screens/<File>.tsx`）与别名前缀；别名只作用于 `MODULE_SCOPED_LAYERS`
  的 `domain`/`features`/`hooks`/`providers`/`services`，比较时忽略大小写与短横线（`muse-dash` 与 `MuseDash` 等价）。
  `SHARED_COMPONENT_DIRS`、`SHARED_SCREENS` 登记公共组件目录与公共页面文件。**未登记的组件目录或页面文件直接失败**，
  因此新增游戏即使页面名与游戏 ID 不同（例如 `TufScreens`）也必须登记，不会因命名差异漏检。
- 依赖矩阵在 `scripts/lib/architecture-boundaries.mjs`：未登记的模块归属、`src` 反向依赖路由层、
  跨游戏模块依赖（任一侧属于游戏界面：组件目录、游戏页面与 `features/**` 游戏模块）、
  公共核心反向依赖游戏模块、领域层反向依赖 UI（`components`/`features`/`hooks`/`screens`/`theme`）、
  领域层非类型导入依赖 `state`/`storage`/`services`/`providers`（类型导入单独允许）、
  状态层反向依赖 `components`/`screens`、存储执行核心（`storage/**` 与 `features/storage-management/**`）
  反向依赖 `components`/`hooks`/`screens`、Provider 层反向依赖 `components`/`features`/`hooks`/`screens`/`state`。
- 共享渲染核心（`SHARED_RENDER_ROOTS`：`components/game-content/`、`features/best-image/`、
  `features/chart-download-shared/`、`features/chart-preview-shared/`）不得按具体游戏 ID 分支：
  比较或 `switch` 游戏身份选择器（`game` / `gameId` / `kind`）与游戏 id 字面量都会被拦；
  `SHARED_DISPATCH_ALLOWED` 里的组合边界保留显式分派权限（`features/game-content/adapters/`、
  `domain/game-bind-options`、`domain/game-profile`、`domain/game-mode-family`、`domain/game-data`、`domain/game-content`）。
- 路由层 `app/**` 是组合边界：允许选择游戏页面与按游戏分派，但 `src` 不得反向依赖 `app`。
- 尚未迁出的既有跨层引用以**过渡例外**（`TRANSITION_EXCEPTIONS`）登记在同一个文件里，精确到文件与规则，
  每条都写明原因与删除条件；命令行会打印生效的例外数量，以及已经不再命中、可以删除的条目，避免例外静默累积。
- 允许/拒绝源码合同由 `tests/architecture-boundaries.test.ts` 覆盖（审查列出的边界反例、共享渲染分派负例、
  未登记组件目录与页面文件的负例、再导出/相对路径/动态导入/require 绕行负例、全具名 `type` 导入负例，
  以及合法组合必须通过）。`tests/shared-entrypoint-boundaries.test.ts` 另外钉住公共入口清单
  （`AccountSwitchSheet`、`BoundAccountGroupedList`、`ProviderLoginSheet`、`MaimaiFilterBar`、
  `features/best-image/build-best-image-html.ts`）不得直接依赖游戏模块，且过渡例外表不得为它们保留条目。
  结构检查不能替代对新间接依赖和业务分支的审查。

## 领域与展示契约

| 能力 | 权威入口与主要导出 | 使用边界 | 主要验证 |
|---|---|---|---|
| 物量分组展示形状 | `src/domain/game-content.ts`：`GameNoteValue`、`GameNoteGroup` | 只描述「键 + 标签 + 若干数值」的展示形状，各游戏自行构造；消费方是 `features/game-content/presentation.ts` 的 `NoteGroupPresentation`、`features/game-content/adapters/adofai.ts`、`features/game-content/adapters/phira.ts` 与 `domain/majdata.ts` 的 `majdataNoteGroup(counts)` | `majdata.test.ts` |
| 展示模型 | `src/features/game-content/presentation.ts`：`TextEffect`、`MetricPresentation`、`BadgePresentation`、`ScoreCardPresentation`、`SongRowPresentation`、`BestSectionPresentation`、`ChartCardPresentation`、`NoteGroupPresentation`、`SongDetailRoute` | 页面容器生成 presentation；共享组件不读取游戏 Hook 或原始 Provider DTO；`SongDetailRoute` 是 `domain/detail-target.ts` 的 `DetailTargetRoute` 别名 | `game-content-adapters.test.ts`、`game-content-host-contract.test.tsx` |
| 游戏适配器 | `src/features/game-content/adapters/index.ts` 及同目录各游戏适配器：`presentMaimaiScore`、`presentPhigrosScore`、`presentChunithmScore`/`presentChunithmSong`、`presentPhira*`、`presentRizline*`、`presentStandardSong`、`presentTuf*`/`formatTufAccuracy`、`presentMuseDash*`/`formatMuseDashScore`/`formatMuseDashAcc`/`isNumericMuseDashLevel` | 只做「游戏真实模型 → 展示模型」转换：原始 DTO、领域类型与字段解释留在各游戏领域层与 Provider；这里不承载归一化存储或缓存语义 | `game-content-adapters.test.ts` |
| 详情定位 | `src/domain/detail-target.ts`：`DetailTarget`（`MaimaiDetailTarget`/`ChartIndexDetailTarget`/`PhiraDetailTarget`/`TufDetailTarget`/`OsuDetailTarget`）、`DetailTargetRoute`、`DetailTargetParams`、`decodeDetailTarget(gameId, params)`、`encodeDetailTarget(target)`、`detailTargetHref(route)`、`DetailTargetErrorCode` | `/songs/[songId]` 的唯一语义来源：URL 槽位按游戏校验（非法、缺失、重复或跨游戏槽位都返回可判别的错误），页面与共享卡片只消费已校验 target，不各自解释参数 | `detail-target.test.ts`、`detail-target-navigation.test.tsx` |
| 当前账号数据包 | `src/domain/game-data.ts`：`GamePayload`、`GamePayloadKind`、`GAME_PAYLOAD_KIND_BY_GAME_ID`、`GamePayloadOf<G>`、`GameDataBundleFor<G>`、`GameDataBundle`、`gameDataBundle<G>()`、`gameAccountMetadata<G>()`；`src/hooks/game-data-loaders.ts`：`GAME_DATA_LOADERS`、`GameDataLoader`、`GameDataLoaderContext`、`GameDataLoadResult`、`selectGameDataLoader`、`loadGameDataBundle` | `GAME_PAYLOAD_KIND_BY_GAME_ID` 是 `satisfies Record<GameId, …>` 的穷尽映射（保留测试 id 为 `null`），`gameDataBundle({ gameId, payload })` 在调用点即校验身份与载荷对应；`GAME_DATA_LOADERS` 也是 `Record<GameId, GameDataLoader>` 穷尽映射，`selectGameDataLoader` 对未登记游戏直接抛错，缺省没有舞萌回退分支。加载器只读取与装配，不持有查询客户端：发布数据包、读写其它实体与失效都经 `GameDataLoaderContext` 的 `publish` / `readEntityValue` / `publishEntityValue` / `invalidateEntityValue` 端口，后台刷新句柄经 `GameDataLoadResult.background` 交回适配层登记 | `game-data.test.ts`、`game-data-loader-registry.test.tsx`、`game-registry.type-check.ts`、`game-data-refresh-contract.test.ts` |
| 游戏与能力注册 | `src/domain/game-bind-options.ts`：`SUPPORTED_GAME_IDS`、`OSU_MODE_GAME_IDS`、`RESERVED_GAME_IDS`、`GAME_IDS`、`GameId`、`GAME_OPTIONS`、`PROVIDER_IDS`、`INTERNAL_PROVIDER_IDS`；`src/domain/game-registry.ts`：`gameRegistrationSnapshot`、`gameRegistrationIssues`、`assertGameRegistryComplete`；`src/domain/game-profile.ts`：`GameProfile`、`GameCapabilities`、`getGameProfile` | `GameId` 只有这三份列表一个来源，正式游戏、osu! 四模式与保留测试 id 分类登记；登记校验要求正式游戏都有添加入口、展示资料与工具箱，保留测试 id 不得进入添加入口，查分器在不同游戏不得登记不同绑定方式；`GameCapabilities` 当前只有真实被消费的 `hasTools`，由 `getGameToolbox(id).tools.length > 0` 派生 | `game-registry.test.ts`、`game-registry.type-check.ts`、`game-bind-options.test.ts`、`game-toolbox.test.ts`、`game-data.test.ts`、`overview-capability-contract.test.tsx` |

刷新结果与缓存来源分开表达：`src/domain/refresh-result.ts` 的 `RefreshResult<T, Target>` 是
`{ status, value, metadata, requested, completed, failures }`，`RefreshStatus` 为
`success` / `partial` / `failed` / `cancelled` / `noop`；`SnapshotMetadata`（`provider` / `label` /
`fetchedAt` / `revision`）只描述「谁在什么时候抓到的」，不表达新鲜度或刷新是否成功。
构造入口按终态分开（`successfulRefresh`、`partialRefresh`、`failedRefresh`、`cancelledRefresh`、
`noopRefresh`），并强制 `completed ⊆ requested`、`partial` 必须带失败项、无可用数据时不得带快照元数据。
`RefreshFailure` 的 `code` 是机器判定字段（是否重新登录只看它）、`target` 供只重试失败项使用、
`diagnostic` 只进诊断链路、`retryable` 决定是否属于可重试项；`refreshSucceeded`、`refreshRetryTargets`、
`refreshNeedsLogin`、`refreshFailureFromError` 是消费入口，`refreshedFetchedAt(result, previousFetchedAt)`
表达写回时间规则：只有 `success` / `noop` 推进抓取时间。缓存读取用 `cachedSnapshotSource(source)` 只补过期标记、
保留原提供方与抓取时间；`snapshotMetadataOf` 拒绝把 `cache` 当作提供方；
`assertFreshSnapshotSource(source)` 让缓存命中或网络兜底不能被当成刷新结果落盘。
中二个人数据（`services/chunithm-personal-service.ts` 的 `refresh()`，返回
`RefreshResult<ChunithmPersonalSnapshot, ChunithmPersonalPart>`）按 `player` / `scores` / `bests`
三个分项汇总：全部分项成功才用新抓取时间走 `successfulRefresh`，部分成功走 `partialRefresh` 并保留旧元数据与过期标记，
失败项带 `target` 供只重试失败项，取消返回 `cancelledRefresh`。
合同见 `refresh-result.test.ts`、`cache-first.test.ts`、`chunithm-personal-service.test.ts`、
`chunithm-personal-refresh.test.ts`、`rizline-refresh-result.test.ts`。

`GameOption.icon` / `familyIcon` 与 `ProviderOption.icon` 保持 `ImageSourcePropType`。
`GAME_OPTIONS` 通过静态图片导入提供包内模块 ID，`findGame(id)` / `findProvider(id)`
仍是图标查询入口；选择、登录、账号分组及缺省头像/封面不得另建远程图标表。
Muse Dash 与 MuseDash.moe 共用同一份图片，示例账号共用示例图标，osu! 家族与四模式
各自保留图标。身份图标使用无损 WebP 或保留原色彩信息的 PNG，不占受控远程缓存预算；
`normalizeRemoteImageSource(source: unknown)` 对数字模块 ID 返回 `null`，
`RemoteImage` 将其直接传给图片组件，不触发下载或压缩。
注册表映射与资源存在性由 Vitest 的 `game-bind-options.test.ts` 校验；
`remote-image-cache.test.ts` 和 `remote-image.test.tsx` 覆盖包内源的缓存边界。
Jest 的图片模拟不用于区分图标身份，图标身份差异由 Vitest 的真实静态资源导入验证。

中二单曲数值分两层：`domain/chunithm-rating.ts` 的 `rawChunithmChartRating` 是全精度值，
`chunithmChartRatingDisplay` 是两位小数向下取整的展示值。OVER POWER 与反推最低分数只读 raw，
展示与档位表只读 display；定数 13.7、分数 1,000,099 的 raw Rating 为 14.7099，展示值为 14.70。
raw 是公式的数学中间值，不带「成绩不可能为负」的领域下限（低定数配 800,000~900,000 分时可以为负），
施加 0 下限是 display 的职责。公式内部以定数 ×10000 定点、Rating ×6×10⁹、OP ×30000 的整数运算实现，
反推因此用整数比较而不是浮点相等。
反推入口必须给 `clear`，返回 `ChunithmMinimumScore`（`reachable` / `unreachable` + `lampMinScore`）：
搜索从灯态最低分开始，候选分数还要通过正算所用的同一 `parseChunithmChartInput` 复核才算可达；
纯公式解由 `formulaMinimumScoreForChunithm*` 单独保留，它不保证合法性，界面不得直接称其为最低分。
`parseChunithmChartInput({ levelValue, score, clear })` 是唯一输入边界，返回
`violations`（`level_out_of_range` / `score_out_of_range` / `lamp_score_conflict`）与规范化后的输入；
调用方在 `violations` 非空时不得把值送进公式。定数上限、分数上限与各灯最低分数分别读
`CHUNITHM_LEVEL_VALUE_MAX`、`CHUNITHM_SCORE_MAX`、`CHUNITHM_CLEAR_TIER_MIN_SCORE`，
灯文案读 `CHUNITHM_CLEAR_TIER_LABELS`。合同见 `chunithm-rating.test.ts` 与 `chunithm-tools-screens.test.tsx`。

Phira 批量刷新把「一次操作的结果」与「缓存快照」分开：`PhiraBestRefreshResult` 是
`{ refresh, snapshot }`，`refresh.status` 为 `success` / `partial` / `failed` / `noop`
（`noop` 表示没有需要刷新的谱面），并给出 `updatedChartIds`、`requestedChartIds` 与
`failures`（每项带可重试的 `target`）。只提交成功项，请求过但全部失败时不写入、不推进
`source.updatedAt`，首次没有缓存且全失败时 `snapshot` 为 null 但摘要仍然存在；
`refreshPhiraBestTargets` 供只重试失败项使用，缓存回退不等于刷新成功。
合同见 `phira-service.test.ts`、`phira-cache.test.ts`、`phira-best-refresh.test.tsx` 与
`sqlite-storage-integration.test.ts`。

Phigros 实力分析的政策数值只有一个来源：`domain/phigros-strength-analysis.ts` 的只读
`PHIGROS_STRENGTH_POLICY`（阈值偏移与上限、计入池的最低评级、小样本与补充上限、细分标签票数、
画像阈值与主标签轴数、推荐条数与最小增益、推荐 Acc 搜索区间）。页面说明由
`describePhigrosStrengthPoolPolicy()` 与 `describePhigrosStrengthPolicyTexts()` 生成，
`resolvePhigrosStrengthProfileLabel` 可注入变体政策，UI 不再维护第二份数字；改变政策只改这一处。
合同见 `phigros-strength-analysis.test.ts` 与 `phigros-strength-analysis-screen.test.tsx`。

Phigros 推分的合法参数集中解析：`PHIGROS_PUSH_LIMITS`、`parsePhigrosPushDelta`、
`parsePhigrosPushChartCost`、`resolvePhigrosPushRequest` 与 `PhigrosPushInputError` 是唯一输入边界，
非法 delta 或预算（`NaN`、`Infinity`、0、负数、超出上限、非整数）在领域侧明确拒绝，
不会被编码成 `unreachable` / `verified` 之类的搜索结论；`app/tools/push-rks.tsx` 使用同一解析函数。
合同见 `phigros-push.test.ts` 与 `phigros-push-screen.test.tsx`。

Phira 曲库分页用判别状态表达搜索进度：`domain/phira.ts` 的 `phiraCatalogPageState` 返回
loading / error / ready，ready 恒带 `items`（可为空）并独立描述 `hasNextPage`、`scanning`、
`paused`（扫描预算耗尽）、`nextPageFailed` 与 `exhausted`；`phiraCatalogListView` 把它映射成
列表与空态，预算耗尽保留“继续扫描”、后页失败保留已有项，不把“尚未搜完”写成“全库无结果”。
自动续扫由 `phiraCatalogQueryIdentity`、`phiraCatalogScanObservation` 与 `phiraCatalogScanNext`
驱动：推进只读「查询身份 + 已成功接收的页数与末页游标」，不依赖 UI 观察过一次请求中状态，
同一位置只请求一次，因此快速响应与慢响应都能逐页推进且不会并发重复请求同一页。
Muse Dash 的成就筛选依赖单曲 miss 明细：`museDashMissDetail` 把 `null`（pending）、
`undefined`（unknown）、`MUSE_DASH_MISS_DETAIL_FAILED`（failed）与数值（known）分开，
`filterMuseDashRandomCharts` 只接受 known，`museDashAchievementDetailsPending` 让抽取入口在 pending 期间等待；
`useMuseDashPlayDetails` 返回 `{ missByChart, failedCount, retryFailed }`，记录页据此显示失败提示并提供
只重试失败项的重试入口，随机抽取页在失败期间暂停抽取，失败与 unknown 不再混为一谈。合同见
`phira-catalog-pagination.test.ts`、`phira-catalog-scan.test.tsx`、`phira-ui.test.tsx`、
`muse-dash-content-adapter.test.ts`、`muse-dash-play-details.test.tsx`、
`musedash-random-charts-achievement.test.tsx` 与 `musedash-song-detail-route.test.tsx`。

## Provider、仓库与数据服务

| 能力 | 权威入口与主要导出 | 使用边界 | 主要验证 |
|---|---|---|---|
| Provider 契约 | `src/providers/contracts.ts`：`ProviderSession`、`RizlineSession`、`LoginCredentials`、`AuthProvider`、`ScoreProvider`、`CatalogDrivenScoreProvider<TCatalog>`、`AnyScoreProvider`、`isCatalogDrivenScoreProvider`、`CatalogProvider`、`DetailedCatalogProvider` | 每个游戏保留自己的 DTO 与 Schema；示例账号的曲库驱动成绩实现 `CatalogDrivenScoreProvider`。`DetailedCatalogProvider`（歌曲详情、别名、姓名框、收藏品）是舞萌系列曲库独有的能力集合，Phigros 只实现 `CatalogProvider`；会话曲库槽位用 `services/session-providers.ts` 的 `noDetailedCatalog`（`EmptyCatalogProvider`）显式声明「无此能力」，不得用断言把普通曲库伪装成详细曲库 | 各 Provider 测试、`maxed-*-test-provider.test.ts`、`session-providers.test.ts`、`game-registry.type-check.ts` |
| HTTP 请求 | `src/providers/http-json.ts`：`requestJson<T>(options)`、`requestProviderResponse<T>(options, read)`、`requestBytes(options)`、`fetchProviderJson(options)`、`retryAfterMs(response, maxMs = 5000)`、`resolveTotalAttempts(options)`、`JsonRequestOptions<T>`、`ProviderJsonOptions` | JSON、原始字节、调用方自定义读取和公共曲库读取复用同一个私有执行器（超时、取消、重试、429 退避与错误归一化），差别只在读取方式与尝试次数；外部取消透传调用方 reason，预取消不发请求；游戏提供 base URL、Schema 与场景文案。尝试次数用 `totalAttempts`（含首次，1 表示不自动重试）或 `extraRetries`（总次数 = 额外次数 + 1）表达，解析优先级为 `totalAttempts` > 旧字段 `retries` > `extraRetries + 1`，缺省 2 次；`fetchProviderJson` 供公共曲库读取（LXNS 曲库、中二曲库），固定 `totalAttempts: 1`；osu! 与水鱼成绩请求经 `requestJson` 进入同一执行器 | 各 Provider 测试、`http-json-contract.test.ts`、`osu-executor-contract.test.ts`、`phigros-resources.test.ts`、`phira-provider.test.ts` |
| 内容摘要 | `src/utils/resource-integrity.ts`：`sha256(bytes)`、`bytesToHex(buffer)`；`src/utils/crypto-subset.ts`：`uint8ArrayToWordArray(bytes)`、`bytesToBase64(bytes)`、`base64ToBytes(text)` | 通过现有 Expo Crypto 和 CryptoJS 能力计算摘要、编码；字体缓存保留摘要兼容导出，游戏不得反向依赖字体功能 | 字体缓存、Phigros 资源与存档测试 |
| 校验发布会话 | `src/services/verified-release.ts`：`VerifiedReleaseSession<T>`、`verifyResourceBytes(bytes, asset, message)` | 调用方提供格式专属 prepare；共用消费者取消、代次、失败重读和完整候选切换；校验字节后才发布结果 | `phigros-resources.test.ts`、`rizline-resources.test.ts` |
| Phigros 发布事务 | `src/services/phigros-resources.ts`：`phigrosResources`、`load(signal?, check?)`、`withRelease(action, signal?, check?)`、`verifyPhigrosResource(bytes, asset)`、`directory(current)`；`src/domain/account-avatar.ts`：`phigrosReleaseDirectory`、`buildPhigrosAvatarUrl(releaseDirectory, avatarName, resourceVersion?)` | Phigros 各调用方共用唯一会话发布；校验所有必需元数据后原子替换；谱面、曲绘和头像路径取 `current.manifest` 所在目录，查询参数带 `resourceVersion`；实际资源校验大小/SHA-256；失败强制绕过缓存重读一次，取消以消费者计数管理 | `phigros-resources.test.ts`、`phigros-catalog-notes.test.ts`、`phigros-score-revision.test.ts`、`account-avatar.test.ts`、`phigros-avatar-resolver.test.ts` |
| 错误边界 | `src/providers/errors.ts`：`ProviderError`、`providerErrorFromStatus`、`providerErrorToUserMessage` | 底层 code/cause 用于诊断；可选 `needsCode` 表示应改用验证码；所有用户可见出口必须转换为可行动文案 | `consumer-copy-policy.test.ts`、各 Provider 测试 |
| LXNS OAuth 请求 | `src/providers/lxns-oauth.ts`：`rotateLxnsTokens`、`lxnsRotationMayReplace`、`lxnsRotationAncestors`；`src/providers/lxns-oauth-request.ts`：`LxnsOAuthRequestCore`、`LxnsTokenRotationUpdate`、`LxnsOAuthRequestTexts`、`lxnsErrorFromStatus(status)` | 舞萌和中二共享 OAuth 请求与令牌轮换骨架；轮换回调必须携带被本次轮换消费掉的旧会话（`previous`）与结果（`next`），提交方据此判断凭据世代；游戏差异通过参数和账号映射表达。落雪品牌文案与状态码映射在协议层用 `LXNS_STATUS_TEXTS` 显式声明并经 `providerErrorFromStatus(status, texts)` 注入，不对其它数据源的错误消息做字符串改写 | LXNS OAuth、上传、Session 与中二 Provider 测试 |
| 头像解析 | `src/services/account-avatar-resolver.ts`：`AccountAvatarResolverPorts`、`AccountAvatarResolver`、`createAccountAvatarResolver(ports)`、`StoredAccountAvatar`、`PhigrosAccountHydration`；`src/services/resolve-account-avatar.ts`：`resolveAccountAvatarUrl`、`syncAllAccountAvatars`、`hydratePhigrosAccount`；`src/services/phigros-avatar-resolver.ts`：`PhigrosAvatarResourcePort`、`PhigrosAvatarResolver`、`createPhigrosAvatarResolver(port)`、`createPhigrosAvatarResourcePort()`、`normalizePhigrosAvatarKey`、`resolvePhigrosAvatarFileName`、`resolvePhigrosAvatarUrl`、`loadPhigrosAvatarCatalog` | 端口只声明解析真正需要的读取（快照、协议读取、TUF 缓存、落盘与前台信号；Phigros 侧是别名表与当前发布），组合入口注入真实实现；调用方使用 `resolve-account-avatar.ts` 的默认装配导出，游戏与页面不得各自访问发布单例。纯映射函数（`normalizePhigrosAvatarKey`、`resolvePhigrosAvatarFileName`）可直接单测 | `account-avatar.test.ts`、`account-avatar-ports.test.ts`、`resolve-account-avatar.test.ts`、`phigros-avatar-resolver.test.ts` |
| 示例满成绩 | `src/providers/maxed-records.ts` 的 `buildMaxedScoreRecords` | 由游戏测试 Provider 提供真实目录和映射函数，不复制通用生成循环 | `maxed-*-test-provider.test.ts` |
| Repository | `src/repositories/{catalog,resource,snapshot,user-library}-repository.ts` | Service 依赖接口；SQLite 实现留在 `storage/`，页面不直接写数据库 | Repository、存储迁移和用户曲库测试 |
| 缓存优先 | `src/services/cache-first.ts`：`cacheFirstLoad`、`cacheFirstLoadWithBackground`、`CacheFirstLoad`、`CacheFirstLoadOptions`、`CacheFirstRefreshResult`、`staleCached`、`isCacheFallback` | 统一“本地首屏、后台刷新、失败保留旧数据”；调用方提供读写和游戏语义。`cacheFirstLoadWithBackground` 返回 `{ value, background }`：`value` 供首屏渲染，`background` 是永不 reject 的后台刷新终态句柄（`RefreshResult<T, 'data'>`），调用方不必再猜一个 Promise 返回时完成了多少。命中本地缓存时后台刷新的结果分流：取回新数据进必填的 `onFresh`，服务声明为缓存/兜底（可选 `isFallback`，缺省用 `isCacheFallback`）的结果进 `onFallback(fallback, failure)`，缓存命中与兜底都不会被当成刷新成功；后台刷新抛错进 `onRefreshFailed(failure)`，取消后三者都不发布。没有本地缓存时直接返回刷新结果，不经过这两个回调；冷启动失败直接抛出。`markStale` 决定缓存命中返回值的过期标记。取消分两层：消费者自己的 `signal` 中止只取消本次调用（终态为 `cancelled`，其它共享消费者照常拿到数据），最后一个消费者离开或缓存清理提升代次才取消共享底层任务 | `cache-first.test.ts`、各游戏缓存测试 |
| 快照公共工具 | `src/services/snapshot-cache-utils.ts`：`makeSnapshot`、`snapshotSource`、`createInflightGuard`、`clearResourcesByPrefix` | 统一快照来源、并发去重和资源前缀清理 | 各游戏缓存测试 |
| 曲库与别名 | `src/hooks/use-aliased-catalog.ts`：`loadAliasedCatalog`、`useAliasedCatalog` | 游戏提供目录、别名查询和合并函数；Hook 统一查询时序和来源；可选 `retry` 允许已自行恢复的服务关闭外层重试 | 曲库与搜索测试 |
| 游戏数据实体 | `src/services/game-data-query.ts`：`GAME_DATA_QUERY_VERSION`、`gameDataQueryKey`、`GameDataQueryParams`、`GAME_DATA_QUERY_OPTIONS`、`GameDataQueryPort` | 账号、游戏、Provider、会话模式共同组成键；键结构变化时统一提升版本。`GAME_DATA_QUERY_OPTIONS` 是一个实体唯一的新鲜度策略（会话内不落后、不自动重取），总览数据包与各游戏页面从同一组参数读取同一份已提交版本；TUF、Muse Dash 与 Phira 的玩家实体由各自的 `*PlayerEntityKey` / `*PlayerQueryOptions` 提供规范键与查询选项 | `game-data-refresh-contract.test.ts`、`game-data-entity-version.test.tsx`、`game-data-loader-registry.test.tsx` |
| 查询适配层 | `src/services/game-data-query.ts`：`readGameDataBundle`、`publishGameDataBundle`、`publishEntityValue`、`invalidateEntityValue`、`registerGameDataBackground`、`awaitGameDataBackground`、`resetGameDataBackground`、`gameDataBackground`、`gameDataBundleStale`、`refreshGameDataBundle`、`GameDataRefreshInput`、`GameDataRefreshResult`、`GameDataRefreshTarget` | 数据包只经这里进入与读出缓存：`GameDataQueryPort` 只声明读取、写入与失效，服务与加载器都不导入应用单例 QueryClient。`refreshGameDataBundle` 返回 `RefreshResult<GameDataBundle, 'data' \| 'catalog'>`，是主动刷新的唯一终态判定入口：等 `refetch`、等该实体登记的后台句柄，再按「后台落定值 → 已提交版本 → refetch 返回值」取终态；`data` 与 `catalog` 两个粒度分别判定，调用方只读返回值区分成功 / 部分失败 / 全部失败，不需要逐游戏 waiter，也不需要二次读取查询缓存推断后台刷新是否落定。`gameDataBundleStale` 是「数据包只剩缓存」的唯一判定，UI 不各自读来源标记 | `game-data-refresh-contract.test.ts`、`game-data-entity-version.test.tsx`、`overview-rizline-sync.test.tsx` |

`services/phigros-game-data-service.ts` 的 `loadPhigrosGameData` 接收账号、成绩/曲库 Provider、
快照缓存、会话数据状态、AbortSignal 和写入断言，负责首次兼容快照与显式云存档读取。
服务不调用 Hook；`useGameData(enabled = true)` 负责查询键与查询选项、把发布/读取/失效端口
注入加载器并登记后台刷新句柄，返回结构为查询结果加 `profile`、`activeGameId` /
`activeProviderId` / `activeAccountId` 与 `isDataStale`。分派经 `game-data-loaders.ts` 的
`GAME_DATA_LOADERS` 注册表进入各游戏加载器。
`domain/game-data.ts` 的 `PhigrosGameDataPayload` 和 `phigrosPayloadFromSnapshot(snapshot, catalogSource, details?)`
统一真实/示例账号的纯展示转换，缓存模块保留载荷类型兼容导出。
读取与头像解析结束及排队写入时均复核发布修订、取消和写入代次；离线保留已有快照。
合同包括 `phigros-game-data-service.test.ts`、`phigros-score-revision.test.ts` 与原缓存/页面测试。

Phigros 成绩在自己的领域层建模：`domain/phigros.ts` 的 `PhigrosScoreEntry` 是存档原始成绩，
`PhigrosScoreRecord` 是 Phigros 真实语义的成绩记录，`phigrosSharedScoreRecord(record)` 是投影到共享
`ScoreRecord` 的唯一边界（`type` 固定 `SD`、舞萌语义的 `dxScore`/`fc`/`fs` 只在这里显式赋值）。
单条转换入口为 `toPhigrosScoreRecord`，批量入口为 `gameRecordToPhigrosScoreRecords` /
`gameRecordToScoreRecords`；`PhigrosScoreProvider.getRecords` 经
`gameRecordToPhigrosScoreRecords(...).map(phigrosSharedScoreRecord)` 产出共享成绩，
`getBestSections` 的 Phi3 / Best27 也经 `toPhigrosScoreRecord` → `phigrosSharedScoreRecord`，
共享卡片不得把舞萌字段当成 Phigros 的领域事实。合同见 `phigros-score-records.test.ts`。

`services/phigros-kyou-cache.ts` 的 `loadPhigrosKyouAliases(signal?)` / `resetPhigrosKyouAliasesCache()`
供查询和存储清理共同使用。一小时缓存与共享在途请求分开管理，调用前捕获本地及游戏代次，
复用 `createInflightGuard.share` 的消费者取消；清理终止旧工作，旧失败不清空新缓存。
`PhigrosKyouProvider.getAliases(signal?)` / `getChartTags(signal?)` 通过 `requestJson` 执行，
12 秒超时、一次尝试，保留 manifest 数量、唯一性及引用一致性检查；别名失败仍沿曲库入口降级。
`phigros-kyou-cache.test.ts`、Provider 与曲库 Hook 测试覆盖此合同。

舞萌 DXRating 谱面标签经 `useDxRatingChartTags` / `DxRatingChartTagsProvider.getChartTags(signal?)`
读取，不落盘、不复用旧快照，只共享在途请求；失败仅自动重试（指数退避，最多 3 次，
终态失败后 30 秒轮询），不设手动重试入口。`dxRatingTagFilterState` 把无数据且未终态
失败映射为加载中，不把未启用误报为不可用；错误时内存中的已选标签保留，收到新快照
后才裁剪失效 ID。提供方经公共 `requestJson` 单次执行，并显式携带 `idScheme=legacy`：
领域层按「`song_id` 即曲名」匹配，而接口未把默认方案写进契约，`public` 方案返回不透明 ID
与新增 `sheet_id`。标题按去首尾空白、压缩连续空白归一化后匹配，难度忽略大小写；
关系索引以快照对象为身份构建一次，供 `dxRatingTagsForChart` 与 `buildDxRatingChartTagIndex`
共用，不按卡片重建。合同由 `dxrating-chart-tags.test.ts`、`m2-query.test.tsx`、
`m4-score-lists.test.tsx` 覆盖。

Phigros 曲库复用 `loadAliasedCatalog` / `useAliasedCatalog` 的来源与别名合并，
`use-phigros-catalog.ts` 的 `refreshPhigrosCatalog()` 统一主动更新入口，
并经 `PhigrosCatalogProvider.getCatalog(signal?, checkChapters?)` 校对独立的 `chapters.csv`。
曲绘三档和头像 URL 经 `phigrosReleaseDirectory` / `directory(current)` 使用 `current.manifest` 所在发布目录，不把 `gameVersion` 拼进对象路径。
`useGameResourceSync()` 通过资源刷新注册表在启动恢复及游戏进入时调用 Phigros/Rizline 各自刷新入口；
总览手动同步直接调用同一刷新入口。查询键保持会话有效，标签切换不重复同步，曲库不持久化。
Phigros 关闭查询层重复重试，发布服务负责唯一的一次恢复重拉。
资源修订变化使中央 `useGameData` 的 Phigros 查询失效，成绩载荷的可选 `resourceRevision`
决定持久化快照是否仍匹配定数；离线可保留已有快照。新修订计算完成前不写入新成绩快照。
章节表变化只替换曲库查询，不因章节本身使成绩查询失效；校对失败保留上次章节。
相关入口合同由 `phigros-resource-sync.test.tsx`、`use-phigros-catalog.test.tsx`、
`phigros-chapters.test.ts`、`phigros-catalog-notes.test.ts` 和 `phigros-score-revision.test.ts` 覆盖。

### Rizline 接入与登录

- `components/game-content/SmsLoginPanel` 接受 `sendCode(phone, signal)`、
  `login(phone, code, signal)`、`validatePhone`、`cooldownKey` 及弹层状态回调。
  公共组件管理输入、单操作锁、倒计时、关闭/后台取消和错误文案，不识别游戏。
  手机号输入框与验证码按钮位于同一横行；发送后的状态仅在按钮倒计时中展示，
  到期显示“重新获取”，完整等待时间通过 accessibilityValue 提供，实际错误仍保留。
  验证码不持久化；同来源冷却在弹层卸载后保留，发送不自动重试。
  `ProviderError.retryAfterSeconds` 承载服务端限流时间；`retryAfterMs(response, maxMs = 5000)`
  保持原 HTTP 默认上限，短信 Provider 显式读取完整冷却时间。
- `PasswordLoginPanel` 复用登录表单、取消和前后台流程；默认用户名标签与「账密登录并验证」。
  可选 `usernameLabel`、`usernameKeyboardType`、`validateUsername` 等仅改变身份输入展示与校验，
  游戏仍只提供登录动作。Rizline 账密使用手机号展示，Majdata 保持用户名默认。
- `RizlineLoginPanel` 提供专属 Provider 操作，默认验证码，经登录卡「或」/次要按钮切换账密。
  `login` / `loginWithPassword` 经 `cancelBoundAccountQueries` 失效旧请求后
  调用 `SecureSessionStore.upsertAccount(account, signal?)` 和现有 Session 动作。
  `bindingKind: 'sms-code'` 属于凭据能力，账号管理按 `isCredentialProvider` 查询该能力。
  账密成功后把密码写入 `storage/rizline-password-store.ts` 的 `LargeSecureValueStore` 引用，
  不进入 `RizlineSession` 或内存会话；短信登录不写也不清已有密码。
  `check_phone === 1` 或登录 `code === 3` 时 `ProviderError.needsCode` 切回验证码表单，
  不自动 `send_verify_code`。
  `applyRizlineSessionRotation(accountId, next, expected, signal?)` 按 `mode + token` 比较、
  串行持久化与共享凭据广播；不新增平行账号恢复仓库。
- `RizlineProvider.sendVerificationCode`、`login`、`loginWithPassword`、`getSave` 共用
  `requestProviderResponse`。游戏请求带 Unity 头、`Accept: */*` 和 `phone`；新票读取
  `set_token` / `set-token` / `token`。`rn_login` 仅 HTTP 401 为 `authentication`。
  `isRizlineTokenExpired(token, 60)` 在无存档密码时预判过期。AES-GCM 解密及官方 DTO 是
  游戏专属边界，不套用 Phigros 存档结构；二进制编码复用 `utils/crypto-subset.ts`，
  解密交给 `@noble/ciphers` 并验证认证标签。
- `loadRizlineCached`、`loadRizlineFresh`、`loadRizlineWithFallback` 和 `awaitRizlineFresh`
  复用 SQLite 资源仓库、`snapshotSource`、`createInflightGuard.share`、账号/游戏写入代次及
  `cacheFirstLoad`。`loadRizlineFresh` 从 `useSession` 取最新会话；认证失败时若店里 token
  已变更则重试，否则解密本地密码换票一次，同一 inflight 内只换一次。换票失败删除密码。
  `clearRizlineAccount` 与 `SecureSessionStore.removeAccount` 都删除密码引用。
  登录及同步都通过 `cacheRizlineSave(id, save, signal?)` 校验账号并保存有效存档。
  `cacheFirstLoad` 可选 `onFallback` 只发布失败状态；不会把兜底缓存送给 `onFresh`。
  Rizline 通过它显示明确认证失效，网络失败保留旧会话与成绩。手动同步等待完整结果，
  公开曲库失败不阻止官方成绩尝试，部分成功明确通知且不返回同步成功。
- `RizlineResourceService` 使用 `VerifiedReleaseSession<RizlineRelease>`，专属 Zod Schema
  解释版本指针、清单和完整曲库。内存发布对象额外保留清单 `files`，SQLite `rizline:catalog`
  仍只存 `{ snapshot, source }`。`withRelease` 供谱面确认读取带 files 的当前发布。
  公共发布会话只在 prepare 完成后切换候选，clear 使旧请求
  失效；单个消费者取消不影响其余消费者，最后一个取消才停止底层请求。
  `withRelease` 同时捕获整个操作的代次，清理不能触发旧操作的恢复重试并重新填回内存。
  Rizline 严格验证 manifest/catalog 摘要、大小、路径、唯一 ID 和引用，包括歌曲 `audioPath`
  与谱面 `chartPath` 必须出现在清单中；Phigros 保持其
  原发布格式、`verifyPhigrosResource` 与预览/下载校验行为。
- 独立发布器 `D:/Projects/rizline-resource-publisher/rizline_publisher/core.py` 的
  `publish(..., workers=4)` 统一预览与实际上传；`verify_remote_object` 校验 GET 实际字节，
  相同内容跳过 PUT，包含 current。不可变资源仍使用 Content-MD5 与条件写入，并行任务
  全部完成后才顺序验证 manifest、current；失败先等待在途任务结束，不提前删除旧资源。
  `cleanup_releases(client, keep, current_data)` 仅删除 `rizline/releases/` 内不在清单文件与
  manifest 精确键集合中的可见对象。清理前、每批删除前及清理后复核 current，校验删除响应
  与最终对象集合；清理失败不能返回发布成功。发布必须串行，不能把指针复核当作跨进程锁。
  单版本策略仅针对 S3 发布前缀；Actions 完整归档保留 90 天，线上回滚通过本地或归档恢复后
  重新走校验与发布入口，不依赖 S3 历史版本。客户端失败回退仍读取本机最后有效曲库。
  独立项目的 `tests/test_publisher.py` 覆盖重复发布、并发校验、指针顺序、精确清理与删除失败；
  调度、凭据及归档配置见技术架构文档的 Rizline 发布说明。
- `rizlinePayloadFromSnapshot(snapshot, catalog?)` 保留原快照与官方指标，集中构造成绩和
  推定分组。曲库 Hook 更新后通过当前 QueryClient 重建派生字段，不额外请求官方存档。
  `useGameResourceSync` 是允许显式注册游戏的元数据编排边界，不把游戏差异放入共享渲染层。
- `features/game-content/adapters/rizline.ts` 输出公共展示模型；页面使用 `GameScoreCard`、
  `GameSongRow`、`GameListPages`、`ChartCarousel`、`VERTICAL_SONG_DETAIL_STYLES`、
  `TagEditor` 和 `RandomChartsPage`。`rizline-filters.ts` 同时提供曲库与随机过滤，
  Store 分别复用 `createFilterStore`、`createPersistedRandomChartsFilterStore` 和偏好工厂。
  游戏领域层提供柔和的总览配色和适配白字胶囊的难度配色；
  曲库行通过 `RizlineDifficultyBadge` 的 `showLabel={false}` 只显示 `formatRizlineConstant` 的定数，筛选条、成绩卡与详情仍显示难度名；
  `rizlineRecordStatus(record?)` 集中选择评价，与成绩构造共用 `isRizlineAp`；有限的原始达成率
  达到 120 时优先 AP，兼容 `120.00000762939453` 这类满达成率浮点值，不从四位显示值判断。
  其余 AH 相容性推定成绩显示 AH，未知状态不补评价。共享卡片不解释这些字段。
  `RizlineAccuracyValue` 复用 `AnimatedMetricValue`，AH 使用公共蓝绿流光，AP 使用金色流光；
  `RizlineStatusBadge` 分别通过 `GameDifficultyBadge` 与 `LayeredGradientBadge` 展示蓝绿渐变、
  金色胶囊。列表与详情共用这两个游戏包装，列表右侧保留 RKS 小标题。
  详情练习按钮与当前难度共用前景、背景色，不展示歌曲信息区；歌曲和谱面标签继续独立展示。
  难度行复用 `FilterChipFrame`、`NeutralChip`、`filterShellStyles` 与游戏难度徽章，
  选中框采用舞萌相同的默认胶囊形状，保持单选并支持再次点击清空；
  曲库与随机页共用同一筛选条。Rizline 工具箱注册随机歌曲与 `/tools/arcade-finder`，
  机厅筛选及偏好继续使用公共机厅查找入口，个人曲库保留在总览。
- 收藏、练习、标签、备份和恢复使用既有 `UserLibraryService` 及其 Repository。
  导出前按同一条目数、预设数和字节上限校验；恢复经 `mergeBackup` 在同一串行事务内
  读取当前条目与预设、合并、复核上限并提交。成功后同时失效个人曲库和标签预设缓存；
  `normalizeLibrarySongId` 对 Rizline 保留完整 ID，普通与 SP 不合并。
  `GAME_STORAGE_ADAPTERS` 的 `rizline:` 资源归属同时服务统计与清理，不清除用户曲库。

验证入口为 `rizline-provider.test.ts`、`rizline-cache.test.ts`、`rizline-domain.test.ts`、
`rizline-catalog-query.test.ts`、`rizline-resources.test.ts`、`rizline-content.test.ts`、
`verified-release.test.ts`、`rizline-algorithm-audit.test.ts`、`rizline-sms-login.test.tsx`、
`rizline-account-flow.test.tsx`、`password-login-panel.test.tsx`、`rizline-ui.test.tsx`、
`rizline-filter-bar.test.tsx`、`rizline-overview.test.tsx`、
`use-game-data-rizline.test.tsx`、`overview-rizline-sync.test.tsx`，以及 Session、
SecureStore、用户曲库、公共卡片/详情/列表与 Phigros 发布合同。真实短信、云存档、原生轮播和
前后台验收单独进行，测试 fixture 不能作为真实登录成功的证据。

## 状态与持久化

| 能力 | 权威入口与主要导出 | 使用边界 | 主要验证 |
|---|---|---|---|
| Session | `src/state/session-store.ts`：`useSession`、`SessionState`、`UNBOUND_ACCOUNT_ID`、`SessionsByAccountId`、`restoreSession`、`refreshActiveSessionView`、`applyLxnsTokenRotation(accountId, update)`、`applyOsuTokenRotation(accountId, next, expected)`、`applyRizlineSessionRotation(accountId, next, expected, signal?)`、`retryPendingRotationWrites`、`pendingRotationWritesSnapshot` | 只保存账号状态与纯变换：账号/会话映射、激活账号派生视图（账号、游戏、Provider 与内存会话在同一次状态提交里可见，不存在只看得到一半的中间态）。Store 不构造具体 Provider，也不调用安全存储 API：Provider 来自 `sessionRuntime()` 端口，凭据落盘与轮换来自凭据提交协调器；页面不得维护第二份账号真相。Store 对外只暴露 `applyLxnsTokenRotation` / `applyOsuTokenRotation` / `applyRizlineSessionRotation` 与补写入口，实现委托给同一协调器单例 | `session-store.test.ts`、`session-store-ownership.test.ts`、`session-store-surface.test.ts`、账号切换与 OAuth 测试 |
| 会话 Provider 解析 | `src/state/session-provider-resolver.ts`：`SessionCredentialRef`、`SessionProfiles`、`ResolvedSessionProviders`、`providerResolverCacheKey(account, credentials)`、`resolveSessionProviders(account, credentials, onLxnsTokenRotation?)`、`releaseResolvedProviders(accountIds)`、`providerResolverStats()`；`src/state/session-runtime.ts`：`SessionRuntime`、`SessionRuntimeRequest`、`sessionRuntime()`、`setLxnsTokenRotation(rotation)` | Provider 实例按「账号 + 凭据版本」缓存，持有会话等运行态的实例不会在每次 render 重建。失效条件只有三种：`release`（解绑、清空会话）、凭据版本变化、账号身份或展示名变化（展示名进本地 Provider 的玩家名；分数展示、头像等元数据字段不进键）。缓存键由账号 id、游戏、Provider、展示名、凭据 id 与会话内容指纹组成，指纹与字段顺序无关。Store 只经 `sessionRuntime()` 声明「需要 Provider」并按账号 `release`；`services/session-providers.ts` 的 `createSessionProviders(account, session, onLxnsTokenRotation)` 只保留游戏差异（Provider 组合与构造参数），不反向读取 Store | `session-provider-resolver.test.ts`、`session-providers.test.ts`、`session-store-ownership.test.ts` |
| 凭据提交 | `src/services/session-credential-coordinator.ts`：`SessionCredentialCoordinator`、`SessionCredentialState`、`SessionStoreApi`、`OAuthRotationCommitResult` | 轮换资格判定、SecureStore 落盘、内存发布与有界补写的唯一入口。按请求开始时消费掉的凭据世代解析应更新的凭据（落雪与 osu! 各有一条前代关系），只更新仍关联该凭据的账号；落盘经安全存储端口，内存发布只改会话并释放受影响账号的 Provider 缓存，已解绑账号的会话不写回。提交返回 `applied` / `pending-persist` / `stale` / `removed`：发起账号被解绑但共享凭据仍被引用时继续提交，新授权不会被迟到结果覆盖；落盘失败保留内存新会话并按 5/30/120 秒有界退避最多自动补写 3 次。协调器不 import Store 模块，由 Store 侧兼容入口按需装配并注入 `getState` / `setState` / `refreshActiveSessionView` | `session-store-ownership.test.ts`、`session-store.test.ts`、OAuth 与 Rizline 轮换测试 |
| QueryClient | `src/state/query-client.ts`：`queryClient`、`releaseInactiveQueries` | 全应用唯一实例；只有内存警告清理非活动 Query | 生命周期与缓存测试 |
| 生命周期 | `src/state/app-lifecycle-core.ts`、`app-lifecycle.tsx`：`AppLifecycleProvider`、`useAppLifecycle`、`getForegroundAbortSignal`、`waitForForeground`、`ensureForegroundWork` | 短暂 inactive 不 abort、不换代；后台 abort 前台工作。进入 `foreground-ready` 时，来自后台则换代并 `beginForegroundWork`；若经 inactive 回来且 controller 已空则 `ensureForegroundWork` 重建可取消信号。异步任务传递 AbortSignal | `app-lifecycle.test.tsx`、下载生命周期测试 |
| 普通筛选 Store | `src/state/create-filter-store.ts` 的 `createFilterStore` | defaults 生成 setter；`clearKeys` 决定清空范围，游戏保留筛选字段语义 | 各游戏 filter 测试 |
| 持久化随机筛选 | `src/state/create-random-charts-filter-store.ts` 的 `createPersistedRandomChartsFilterStore` | 统一水合、脏写保护和串行保存；游戏提供偏好 Store 与默认值 | 随机歌曲测试 |
| 多账号列表 | `src/storage/create-account-list-store.ts` 的 `createAccountListStore({ storeKey, parse, keyOf, normalize? })`；读取合同在 `src/storage/create-demo-account-store.ts` 的 `loadAccountDirectory` | 键不存在返回空目录。读取失败或 JSON 损坏保留原键并抛错，损坏内容另存 `.corrupt`。未知版本或顶层结构错误另存 `.unrecognized` 并抛 `AccountDirectoryUnrecognizedError`，upsert、remove 和示例账号改写都不会覆盖原键。`upsert` / `remove` 经按键 mutation gate（按 KV store 与键串行，前一个失败也继续排下一个）；`load()` 是纯读取，不排队。`restoreAccountDirectory` 只有重新解析通过才写回。v1 数组里的坏条目仍跳过。可选账号恢复按来源收集，单个来源失败不丢弃其他来源，也不在读失败时迁移默认本地玩家 | 各账号 Store 测试、`account-list-store-mutations.test.ts`、`account-restoration.test.ts` |
| 偏好设置 | `src/storage/create-preferences-store.ts` 的 `createPreferencesStore` | 支持全局单键和按账号/游戏 scope；迁移通过 `onMissing` 完成 | 偏好及迁移测试 |
| 示例账号 | `src/storage/create-demo-account-store.ts` 的 `createDemoAccountStore` | 单个可删除示例档案的公共持久化工厂 | 示例账号 Store 测试 |
| SQLite 与存储统计 | `src/storage/rranker-database.ts`、SQLite Repository、`src/features/storage-management/game-storage-adapters.ts` | 唯一连接；Schema、快照及个人曲库写入共用 `runDatabaseWrite` 队列。成绩、曲库和资源快照版本不一致或 JSON 损坏时保留原行并返回空，不删除用户数据。个人曲库旧 schema 升级不再清空条目。统计和清理均经同一游戏适配器 | `storage-management.test.ts`、`sqlite-snapshot-repository.test.ts`、`sqlite-user-library-repository.test.ts` |

`state/debug-store.ts` 的 `useDebugStore` 提供 `testAccountsEnabled`、`hydrated`、`saving`、
`hydrate(): Promise<void>` 和 `setTestAccountsEnabled(enabled): Promise<void>`。
偏好复用 `storage/debug-preferences-store.ts` 的公共偏好工厂，缺失或无效数据默认关闭；
初始化合并，修改串行保存，成功才发布状态，失败可重试。
`domain/game-bind-options.ts` 的 `canBindProvider(provider, testAccountsEnabled)` 按 fixture 能力筛选添加入口，
`GamePickerSheet.testAccountsEnabled` 默认 false，仅作用于 bind 模式；数量提示与实际添加复用同一判断。
已有账号恢复、Provider 查询和上传目标始终使用完整注册信息，不受该偏好影响。

`services/session-providers.ts` 的 `createSessionProviders(account, session, onLxnsTokenRotation)`
只装配运行时 Provider，不读取 Store；`useSession` 保持唯一会话状态、动作与令牌轮换入口，
Provider 实例的解析与释放分别经 `sessionRuntime().resolve` / `sessionRuntime().release`。
落雪 Provider 持有的轮换回调在 `SessionCredentialCoordinator` 装配时注入，解析器不自行判定世代。
`rotateOsuTokens` 的近期轮换和祖先关系共用 64 项上限；解除最后一个 osu! 账号或 `clearSession` 时清空。窗口外的旧刷新令牌不能覆盖当前会话。
`services/account-restoration.ts` 的 `restoreAppAccounts()` / `loadOptionalBoundAccounts()`
统一安全会话、可选档案及默认本地玩家迁移；`useAppStartup` 处理启动准备，`useAppRuntime`
处理路由、前后台、内存警告和延后维护。界面 Provider/导航仍在根布局装配。

`storage/secure-session-store.ts` 的会话索引缺失时走旧版迁移；JSON 损坏抛
`SessionIndexCorruptError` 并保留 `.corrupt` 副本，未知版本或顶层结构错误抛
`SessionIndexUnrecognizedError` 并保留 `.unrecognized` 副本，原键不动，后续写入不得
覆盖。旧版迁移源解析失败时跳过但不删除。`readPreservedSessionIndex` 读取保留副本，
`restorePreservedSessionIndex` 只在副本可解析且当前索引不可用时写回；`clear()` 同时
清理保留副本。账号管理页在恢复失败时提供重试恢复与清除登录数据（二次确认）入口。
合同由 `secure-session-store.test.ts`、`session-restore-recovery.test.tsx` 覆盖。

`storage-adapter-core.ts` 的 `createGameStorageAdapter(definition)` 接收 `StorageOwnership`，
`selectStorageInventory(inventory, ownership)` 为统计和清理提供同一账号/资源选择结果。
`GAME_STORAGE_ADAPTERS` 保留游戏组合；`shared-storage-cache.ts` 独立维护共享文件缓存边界。
既有统计、清理与类型导出继续从适配器模块提供，SQL 批量删除、诊断正文和字体保护规则不变。
`storage-adapter-core.test.ts` 覆盖无成绩行资源、测量/删除一致性、代次与 SQL 失败边界。

### 账号同步与缓存写入

- `domain/game-data.ts` 的 `gameAccountMetadata(bundle)` 只构造纯展示载荷；
  `useSyncAccountMetadata()` 在根布局的 QueryClientProvider 内挂载一次，订阅
  `useGameData(false)` 并调用现有账号、缩略信息、头像和安全仓库入口。页面使用
  `useGameData` 的签名、返回值及 Query Key 不变，页面观察者不再各自持久化元数据。
- `updateBoundAccountScore` 与 `SecureSessionStore.updateAccountMetadata` 对现有字段
  等值时保持对象/存储不变；继续保留 undefined 和 null 的既有含义。
  `persistBoundAccountThumbnail(accountId, input, repo?)` 按仓库、账号和缓存代次合并
  待写字段，写入成功后才更新已保存值；失败保留可重试载荷，闲置条目有 128 项上限。
  `hydrateAccountDisplayData(signal?)` 让根布局与账号列表共享同一前台代次、账号集合
  和缓存代次的缩略信息及本地 Rating 读取；读取完成后检查账号是否仍有效。
- Phigros 推分查询 key 为 `phigros-push-rks`、账号 ID、玩家 ID、资源修订和存档更新时间。
  它属于账号数据失效集合；切换账号不会复用另一账号的新鲜结果。
  `findPushRecommendations` 是异步搜索：返回 `searchStatus`、已取整并重新核算的 `plan`，以及可替换 plan 中 Acc 差值最大一首的 `alternatives`。`recommendations` 与 `plan` 相同。`combinationReachesTarget` 只在 `verified` 时为真。预算按谱面计：`options.chartCost` 与结果里的 `chartCost` / `perChartShare` 表示愿意投入的谱面数，同一首歌的不同难度各占一张；多张不再要求每一张单独达到平均份额。排除 φ 时最高 Acc 为 99.99。搜索预算内未找到方案是 `not_found`，只有全部谱面或 `chartCost` 谱面数内的独立增益上界不够时才是 `unreachable`。长搜索按 16 毫秒时间片让出主线程；`signal` 取消时在让出点抛出来源 reason，不返回半份方案。页面只对 `plan` 作达标保证。
- `captureResourceWrites(scope, signal?, accountId?)` 返回写入断言，游戏代次和
  `account:<id>` 代次共同限制持久化与后台回调。`captureAccountWrites(accounts)` 必须在
  上传或传输的第一个 await 之前调用，并把返回的断言传入 Repository `save` 与后续展示名、
  Rating 更新；删除账号已提升的代次会使旧任务失败。`cacheFirstLoad` 的可选
  `assertCurrent` 覆盖读取、刷新及 onFresh/onFallback；Repository 的可选断言在初始化和写入
  队列等待完成之后、实际 SQL 提交之前执行。
- `subscribeResourceWrites(scope, onInvalidate)` 返回退订函数，在该 scope 提升代次后同步
  通知取消静默任务；任务完成必须退订，写入前仍通过 `captureResourceWrites` 复核。
  订阅异常不会阻碍其它任务取消或缓存清理；合同由 `async-resource-lifetime.test.ts` 覆盖。
- OAuth 轮换提交必须携带请求开始时消费掉的旧会话：`SecureSessionStore.updateCredentialSession(credentialId, session, { acceptedRefreshTokens })`
  只在凭据仍被账号引用、且当前凭据会话属于该轮换世代（旧 token 或其后代）时写入，返回
  `applied` / `stale` / `missing`；内存发布只覆盖仍关联该凭据的账号，不把已解绑账号的会话写回。
  落雪与 osu! 共用这条提交路径（`applyLxnsTokenRotation` / `applyOsuTokenRotation`），协议差异只保留在
  各自的前代关系与刷新实现里。落盘失败保留内存中的新会话并登记补写，`retryPendingRotationWrites()`
  按 5/30/120 秒有界退避最多自动补写 3 次、同一时刻只跑一次，并可由前台恢复触发；
  上游已消费旧 refresh token 时不得重新刷新，凭据已失效或账号已解绑的挂起项直接丢弃，
  超过上限后由 `pendingRotationWritesSnapshot()` 与运行时诊断保持可观察，进程退出前仍未保存成功则需要重新授权。
  `LxnsOAuthRequestCore.request` 在 token 刷新返回后重新检查取消：轮换结果仍可为其它共享账号提交，
  但本次业务读取不再发出（osu! 同一位置已有该检查）。
- 上传目标在共同写入入口逐个复核资格：`uploadLatestScoreHubSyncToTargets` 与
  `transferMaimaiFromLxns` 在每个目标写入前调用 `captureAccountWrites` 断言，
  `uploadRecordsToLxns` / `uploadRecordsToDivingFish` 的 `assertEligible` 在每次重试前再复核；
  失效目标不再向上游写入，其他目标独立完成，已写入的远端结果不回滚。
- `clearStorageByCategories` 先提升所属游戏代次，再取消并移除查询，然后执行适配器清理。
  `cancelBoundAccountQueries(account, client)` 在解绑删除前使单个账号失效，取消并移除
  其查询，保留其他账号和公共曲库。解绑与全游戏清缓存不得混用失效范围。
- `createInflightGuard.share(key, loader, signal?)` 为每个消费者单独管理取消；最后一个
  消费者离开才取消底层任务。新请求键包含相应游戏/账号代次，清理前的任务不能被新调用复用。
  Rizline、Muse Dash、TUF、osu、Majdata 和图片/字体资源均沿用这个公共入口。
- `loadItemsBounded({ items, concurrency, load, signal?, failureMode? })` 默认 `collect`
  隔离单项失败；`throw` 模式首错停止领取，等待所有在途任务结束后再抛错。
  公共暂存执行器使用后者，信号继续传入下载、读取及 writer；失败统一清理 session。
  同一远程文件共享下载，每次写入使用独立临时文件，检查长度和代次后替换目标。
- `runDatabaseWrite(task)` 串行化同一业务连接的写入、事务与 schema 初始化。调用者先
  完成 Repository 初始化，task 内不得嵌套进入队列。批量资源/账号删除按 500 个参数分批，
  一次清理使用同连接事务；失败不阻塞后续任务，也不回滚其他仓库的写入。
  文本体积用 `LENGTH(CAST(field AS BLOB))` 统计 UTF-8 字节；数据库实际分配页仍独立报告。
- `SqliteSnapshotRepository.updateResource(key, schemaVersion, transform, assertCurrent?)` 把读取、
  转换、代次断言与写入放进同一个写入队列任务，队列内只用直接数据库调用（不重入队列）；
  同一资源的并发合并按提交顺序串行，最后提交的值获胜。`PhiraCache.mergeBests` 用它提交成绩合并，
  空集合只读回既有快照、不写入、不推进 `updatedAt`；合同由 `sqlite-storage-integration.test.ts`
  与 `sqlite-snapshot-repository.test.ts` 覆盖。

验证入口包括 `account-metadata-observers.test.tsx`、`account-thumbnail.test.ts`、
`secure-session-store.test.ts`、`async-resource-lifetime.test.ts`、
`sqlite-storage-integration.test.ts` 和各游戏缓存、解绑及生命周期合同。

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
  简要诊断正文使用 `Paths.document/rranker-runtime-diagnostics.json`；有效正文优先，
  缺失或损坏时依次读取同目录 `.previous` 完整副本、缓存目录中的同名文件。
  写入先完成同目录 `.pending` 暂存，再保留有效正文并提升暂存文件；提升成功后回收
  `.previous` 与缓存副本，未提交的 `.pending` 不参与读取。文件读取、部分写入或替换
  失败保留恢复来源；重复初始化不新增会话，失败后可再次初始化。
  `cache-policy.ts` 的 `isLegacyRuntimeDiagnosticCacheEntry(name: string): boolean`
  精确识别待迁移正文，启动清理与共享缓存统计、手动清理均保留它；TXT 分享副本仍可清理。
  `measureManagedStorageBytes()` 的清理前后物理口径也排除该正文，迁移不计为释放空间。
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
  旧记录、并发与失败重试，`runtime-diagnostics.test.tsx` 覆盖正文迁移、读写重试、跨启动保留、
  清理竞争、快照队列隔离、脱敏和容量上限；存储缓存策略与管理测试验证统计/删除边界。
  `diagnostics-screen.test.tsx` 覆盖主题色、新旧标签、状态、空态与分享交互，
  `settings-navigation.test.tsx` 覆盖设置入口和个性化行为。
  `chart-preview-screen-shell-contract.test.tsx` 覆盖准备阶段、去重、后台取消及迟到回调；
  `best-image-diagnostics.test.tsx` 覆盖公共导出控制器的捕获、保存、取消和超时日志，
  `phigros-best-image-preview.test.tsx` 验证现有游戏经公共壳采集就绪，不记录页面内容。
  根路由错误边界、平台异常终止和原生分享必须另做真机验收。

## 共享 UI 与交互

账号管理的 `useManagedAccountOperations` 继续使用 `screens/game-accounts-actions.ts` 的公共执行器，
档案/缓存策略由 `services/account-management.ts` 提供，互斥弹层与转场归 `useAccountBindingFlow`。
`removeBoundPlayerAccount` 的可选 `prepareRemoval` 在删除前取消账号查询；失败中止删除并通知，
`finally` 始终释放 busy。关键解绑提交（`clearPlayer` 收到的 `submit`）抛出时返回
`{ status: 'blocked' }`，账号与凭据保持原样、界面保留该账号作为重试入口。
`submit` 返回的 `{ cleanupFailures }` 表示提交已经完成、只有附属清理失败，
与 `cleanup` 失败一样汇总进 `cleanupFailures` 并按已解绑处理：
`SecureSessionStore.removeAccount` 的提交点是凭据索引写盘，Rizline 密码引用删除属于提交后的附属清理。
`clearBoundAccountData(account, { submit, cleanup })` 按账号类别划分：账号或凭据删除属于 `submit`，
成绩缓存、派生缓存、个人数据与活动账号持久化属于 `cleanup`。屏幕不自行实现第二套绑定或删除流程。

总览的 `useOverviewSync`、`useOverviewUpload` 共享 `useOverviewOperation` 操作锁。
`useOverviewSync` 的水鱼账号预刷新（`refreshDivingFishForSync`）、Rizline 曲库尽力刷新
（`refreshRizlineCatalogBestEffort`）、失效查询取消（`cancelStaleSyncQueries`）与终态上报
（`reportRefreshResult`）是模块级函数，主流程只做编排。成功判定只读
`refreshGameDataBundle` 返回的终态：`success` / `noop` 判成功，`partial` 表示成绩已提交、
曲库未更新，其余按失败项的用户文案提示；不维护逐游戏 waiter，也不二次读取查询缓存推断
后台刷新是否落定。`UploadDataSheet` 的账号偏好、二维码输入和上传执行
分别复用 `useUploadAccountPreferences`、`useUploadQrInput`、`useUploadTaskState` / `useUploadExecution`，
任务真相仍在唯一 `uploadTaskController`，关闭/卸载弹层不取消任务。

| 能力 | 权威入口 | 使用边界 | 主要验证 |
|---|---|---|---|
| 列表页面 | `src/components/game-content/GameListPages.tsx`：`BestListPage`、`RecordsListPage`、`CatalogListPage`、`RemoteImageFlatList` | 页面容器提供查询状态、presentation、筛选头和 renderItem；列表统一窗口参数与可见图片持久化。成绩与曲库标签页只按当前游戏挂载对应页面，舞萌专属页（`screens/maimai/MaimaiRecordsScreen.tsx`、`screens/maimai/MaimaiCatalogScreen.tsx`）自带本游戏查询与筛选链，切到别的游戏时不挂载它 | `game-content-host-contract.test.tsx`、`maimai-list-route-layering.test.tsx`、P3 host contracts |
| 成绩卡与歌曲行 | `GameScoreCard.tsx`、`GameSongRow.tsx` | 游戏传入 presentation、主题样式和插槽；详情路由、封面失败回退和可访问名称由公共组件处理 | `future-game-render-contract.test.tsx`、P3 card contracts |
| 筛选与范围 | `FilterShell.tsx`、`FilterCheckboxList.tsx`、`RangeSelector.tsx` | 公共层提供壳、摘要、控件与手势；游戏只定义字段、上下界和匹配纯函数 | `filter-shell-host-contract.test.tsx`、各游戏 filter-bar 测试 |
| 搜索与徽章 | `GameSearchHeader.tsx`、`GameDifficultyBadge.tsx`、`FlowingGradientValue.tsx`、`TintedRatingTag.tsx` | 复用结构和动画机制，颜色、等级和正式术语由游戏 presentation 或 domain 主题提供 | P3 visuals/cards contracts |
| 歌曲详情 | `SongDetailHero.tsx`、`SongDetailChrome.tsx`、`SongDetailChromeStyles.ts`、`SongMetadataTable.tsx`、`GameNoteTable.tsx`、`ChartCarousel.tsx`、`GameChartResultCard.tsx`、`AutoScrollText.tsx` | 页面保留游戏数据与动作，公共层负责布局、动态物量分组、导航和可复用卡片。超过 24 项时轮播只渲染当前索引前后两项；`initialIndex`、`resetKey`、卡片宽度和滚动位置都会把窗口钳到真实索引 | `song-detail-chrome-contract.test.tsx`、`chart-carousel.test.tsx`、P3 song-details contract |
| 滚动区按压 | `DetailPressable.tsx`：`DetailPressable`、`DetailGestureRoot` | iOS 滚动区交互使用 gesture-handler Pressable 并局部放入手势根；Android 使用 RN Pressable；悬浮按钮不扩大手势根 | 详情 UI 测试 |
| 查询状态与通知 | `QueryStateView.tsx`、`AppNotification.tsx` | 页面统一加载、空态、重试和顶部通知；禁止直接显示底层错误文本，禁止页面使用 RN Alert | `consumer-copy-policy.test.ts` 及页面测试 |
| 标签页驻留 | `CachedTabScreen.tsx`、`tab-list-cache.ts` | 短暂 inactive、普通后台和失焦保留已挂载画面；通过 active context 暂停查询、动画和图片落盘，不用 Freeze 卸可见树；只有内存警告才释放失焦页 | `cached-tab-screen.test.tsx`、`tab-animation-lifecycle.test.tsx` |
| 远程图片 | `RemoteImage.tsx`、`services/remote-image-cache.ts` | 图片统一选择 native、none 或受控 profile；只有带 gameId 且进入持久化 scope 的可见图片写受控缓存；失活只暂停落盘，不拆已显示 source | `remote-image-cache.test.ts`、`remote-image.test.tsx`、列表合同测试 |
| 登录面板槽位 | `src/features/game-content/provider-login-panels.tsx`：`PROVIDER_LOGIN_PANELS`、`resolveProviderLoginPanel(provider)`、`ProviderLoginPanelProps`、`ProviderLoginPanel` | 组合边界注册表：共享登录弹层 `components/ProviderLoginSheet.tsx` 只按 Provider 查表渲染外壳、状态与公共文案，游戏面板不注册在共享组件里；按顺序命中专属 Provider → 凭据能力 → 缺省账密面板（`DivingFishLoginPanel`），`gameId` 只随 props 传给需要游戏身份的面板 | `provider-login-panels.test.tsx` |
| 账号行补充标签 | `src/features/game-content/account-rating-tags.tsx`：`boundAccountRatingTag(account)`；`components/AccountSwitchSheet.tsx` 与 `components/BoundAccountGroupedList.tsx` 的可选 `renderRatingTag?: (account: BoundAccount) => ReactNode` | 组合边界注册表：`BoundAccountGroupedList` 的账号行标签按「注入槽位 → 公共列表内置的舞萌/中二/Phigros 标签 → `boundAccountRatingTag`（当前登记 adofai / musedash）→ 注册表 `accountScoreTheme` 的 `TintedRatingTag`」依次取值，需要引用游戏主题模块的标签只登记在注册表里，共享列表不直接引用游戏组件；`AccountSwitchSheet` 只透传槽位，不设默认渲染 | `account-switch-sheet.test.tsx`、`bound-account-list.test.tsx`、`osu-account-management.test.tsx` |
| 筛选条扩展槽位 | `src/features/game-content/filter-bar-extensions.tsx`：`FILTER_BAR_EXTENSIONS.tagFilterRow` → `src/components/maimai/DxRatingTagFilterRow.tsx` | 共享筛选条只渲染扩展槽，不直接引用游戏组件；舞萌的谱面标签筛选行（入口与弹层都在舞萌模块内）经 `components/MaimaiFilterBar.tsx` 消费注册表 | `maimai-tag-filter-row.test.tsx`、`filter-shell-host-contract.test.tsx` |
| 成绩图导出构建器 | 各游戏自己的构建器：`features/maimai-best-image/build-maimai-best-image-html.ts` 的 `buildBestImageHtml`、`features/phigros-best-image/build-phigros-best-image-html.ts` 的 `buildPhigrosBestImageHtml` 与 `build-phigros-best-image-app-html.ts` 的 `buildPhigrosBestImageAppHtml`、`features/chunithm-best-image/build-chunithm-best-image-html.ts` 的 `buildChunithmBestImageHtml`；共享层 `features/best-image/build-best-image-html.ts`（只再导出消息协议）、`build-best-image-canvas-runtime.ts` 与 `best-image-bridge-script.ts`（`bestImageBridgeRuntimeScript`、`bestImageBridgeMeasureScript`、`bestImageBridgeReadyScript` 参数化脚本段） | 模板、素材清单、字体与样式经各构建器的 input 注入，由各游戏屏幕直接调用；共享入口不得承载游戏构建器，游戏也不能从共享入口取本游戏模板。桥接脚本段只由舞萌与中二拼进自己的 HTML（差异走 `layoutCall` / `exportViewportComment` / `assetReadyExpression` 参数），Phigros 的压缩风格脚本仍内联在自己模块里；共享屏幕壳与控制器接收的是已构建好的 sources/htmlPages，不接收构建器 | `best-image-html.test.ts`、`phigros-best-image.test.ts`、`chunithm-best-image.test.ts`、`best-image-screen-contract.test.tsx` |

`MetricBadges.tsx` 提供 `DualTextMetricBadge` 和 `StatusMetricBadge`，保留难度的两个
独立文本节点及状态徽章的原样式。`AnimatedMetricValue` 继续通过 `FlowingGradientValue`
呈现动效。Phigros/Phira/Rizline 包装层负责格式、颜色和评价，公共组件不识别 gameId。
`domain/badge-theme.ts` 保存共同颜色事实，成绩图 feature 只生成 HTML/CSS；
`domain/metric-gradient-theme.ts` 的 `METRIC_GRADIENT_THEMES` 提供金色、蓝绿的基础色组、
循环色组与时长，Phigros 和 Rizline 共用。`domain/phigros-score-theme.ts` 保留 Phigros
评价到渐变的映射与测试标识，列表和导出不各自维护颜色副本。

`TagFilterSheet` 共用打开时复制选择、清空、完成提交和关闭行为；children 插槽保留
分组、标签样式及游戏操作。详情元数据样式复用 `SongDetailChromeStyles`；成绩图选择器
在现有 `BestImagePickerShell` 中复用 `standardBestImagePickerStyles` / `compactBestImagePickerStyles`。

Phigros 与 Phira 的定数、Acc、选择及评价筛选行复用 `MetricFilterRows`；游戏包装负责章节、
Kyou 标签、评级主题和具体字段。Phira 使用自身 `PhiraFilterBar` / `PhiraScoreVisuals`，
详情复用 `FloatingSongDetailChrome`（内部调用 `SongDetailChrome`）与
`SongDetailChromeStyles.ts` 的 `VERTICAL_SONG_DETAIL_STYLES`，不引用 Phigros 页面。
Muse Dash 筛选字段类型位于 `domain/muse-dash.ts`，State 与 UI 均从领域层导入。

列表可见性通过条目级 `useSyncExternalStore` 订阅，仅通知发生变化的图片持久化 scope；
不替换列表 renderItem、extraData、宿主或窗口参数。`RemoteImage` 的缓存查找依赖
URL、请求头和 cacheKey 的稳定身份，等价 source 对象不会重置已显示状态。
`remote-image-cache` 保留既有压缩参数和预算；并发消费者独立取消，临时文件隔离，
读取 manifest 后再次检查代次才发布文件。`list-viewability-subscriptions.test.tsx` 与
`remote-image-cache.test.ts` / `remote-image.test.tsx` 覆盖通知次数、等价身份和迟到写入。

`BestListPage` 内部的 `RemoteImageSectionList` 按对象身份识别分组标题与尾部，
保护列表级和分组级 `keyExtractor`，只将真实条目交给图片可见订阅与业务回调。
分组身份以弱引用保留，覆盖分组数组更新后的迟到回调；真实条目的提取器优先级、
默认键规则、渲染键和 50% / 250 ms 门槛不变。没有分组级提取器时保留传入的分组数组；
需要包装分组提取器时保留其数据与其它字段。`section-list-viewability.test.tsx`
通过真实 React Native 分组列表转换入口覆盖标题、尾部、条目及迟到分组事件。

## 共享功能族

| 功能族 | 公共入口 | 游戏侧职责 | 主要验证 |
|---|---|---|---|
| 谱面确认 | `src/features/chart-preview-shared/`：`ChartPreviewScreenShell`（可选 `fullscreenOrientation`，默认 `landscape`）、`chartPreviewNativeScreenOptions`、`ChartPreviewLoadProgress`、资源暂存、URI 解析、桥接（含 `progress`）、注入工厂、计划执行器、播放时钟与全屏锁。壳用一条进度条覆盖 native `prepare` 与播放器就绪，`ready` 后撤遮罩。`prepare(signal, settings, onProgress?)` 与 `prepareChartPreviewWebviewFromPlan(plan, signal?, onProgress?)` 按字节权重报告下载，writer/HTML 占落盘末段；`fileName` 支持相对路径，远程 `url+bytes` 有限并发，`bytes` 只作进度权重，可选 `remoteCacheDirectory` 已有非空文件则跳过下载。宿主命令与播放器事件的合同见 `chart-preview-bridge.ts`（`ChartPreviewHostCommand`、`ChartPreviewPlayerEvent`、`applyChartPreviewHostCommand`、`parseChartPreviewBridgeMessage`） | 提供图表解析、资源清单、HTML/脚本配置和场景文案。舞萌/Majdata 谱面与预览曲在 RN prepare 经 `downloadChartResource` 完成，预览曲写入 `music-data.js`；皮肤 PNG 缓存到 `rranker-chart-preview-remote` 后由 writer 写成 `skin-data.js` data URL。Phigros 皮肤仍用 `./skin/` 相对路径；Phigros 三类资源与 Phira zip 同样走 `downloadChartResource` 进度。Rizline 谱面 JSON 与 m4a 同样走 `downloadChartResource`，校验后由 writer 写成 `chart-data.js` / `music-data.js`，避免 iOS file:// 下 fetch 本地文件。资源定位与字节读取端口按游戏放在 `services/phigros-chart-preview-resources.ts` 与 `services/rizline-chart-preview-resources.ts`，Phigros 与 Rizline 的 `domain/*-chart-preview.ts` 只保留清单与发布的纯解析（`domain/phira-chart-preview.ts` 仍引用谱面笔记服务，按过渡例外登记） | `chart-preview-screen-shell-contract.test.tsx`、`chart-preview-progress.test.ts`、`chart-preview-host-contract.test.ts` 及各游戏预览测试 |
| 谱面下载 | `src/features/chart-download-shared/`：下载会话目录、取消错误、命名、保存与 `useChartPackageDownload` | 组装具体资源、压缩包结构和成功文案 | `chart-package-download-lifecycle.test.tsx` 及各游戏下载测试 |
| 成绩图 | `src/features/best-image/`：桥接、状态机、偏好、资源加载、HTML 运行时、选择器、控制器、屏幕壳和导出 | 构建游戏卡片/HTML、素材清单、样式选项和分区语义 | `best-image-screen-contract.test.tsx`、HTML 金样和游戏成绩图测试 |
| 存储管理 | `src/features/storage-management/`：缓存策略、文件边界、游戏适配器、统计、清理、维护和图标字体恢复 | 在注册适配器中声明本游戏查询键、资源和清理动作 | `storage-management.test.ts`、`storage-cache-policy.test.ts` |

`loadImageDataUris(ids, urlFor, onProgress?, signal?, load?)` 使用有限并发 4，按实际 URL 去重，
返回键及进度继续按原条目计数，失败项保持既有占位。舞萌与中二曲绘共用这个入口。
`loadRemoteImageAsDataUri(url, signal?)` 在独立临时目录完成下载/读取并释放文件；
字体缓存公共核心和舞萌 UI 包使用消费者独立取消、完整性校验及发布前代次检查。
`usePreparedBestImageSources(htmlPages, directory?, inline?, generation?)` 在现有屏幕控制器
模块中维护 HTML 文件的创建、错误和按代次释放；各屏幕仍决定原有模板与资源清单。
Phigros 两套模板共用 `preparePhigrosBestImageCards` 的分区、排名、Phi 与参考 RKS 计算，
HTML、尺寸、字体、署名和导出结构由各自模板保留，金样不能批量重录。

`useBestImageScreenController(config)` 保持公共返回形状，内部组合 `useBestImagePreferences`、
`useBestImagePreview` 与 `useBestImageExport`；类型由 `best-image-controller-types.ts` 提供兼容导出。
`BestImageScreenShell` 接收 `appearance`、`preview` 和 `exportSession`。
导出会话独占同步操作锁、等待画布及稳定计时器、临时捕获文件和操作代次。
权限/捕获/保存异步边界复核取消，迟到桥接回调不能完成其他页面；取消后不继续保存或提示成功。
iOS 截图前若 App 处于 inactive 或 background，先等到 `foreground-ready`。第一次截图失败后再等 250ms 重试一次；层级截图失败时改用 `useRenderInContext`。
不可取消的原生捕获返回后回收文件；已经开始的相册保存完成后收尾，不回删相册。
原生 I/O 继续使用 `best-image-export.ts`，`best-image-export-lifecycle.test.tsx` 覆盖取消阶段和重复启动。

舞萌播放器在视频背景加载成功或失败时发送 `background-video`（`result`、`status`、`errorCode`）。壳把它记入运行日志，不中断谱面。

谱面确认的宿主命令合同是四套播放器共用的唯一入口（`features/chart-preview-shared/chart-preview-bridge.ts`）：
宿主命令判别联合 `ChartPreviewHostCommand` 为 `pause`（带 `cause: 'manual' | 'lifecycle'`）、
`exit-fullscreen`、`dispose`、`background-video-confirmation-result`（带 `accepted`）；
播放器事件判别联合 `ChartPreviewPlayerEvent` 为 `progress`、`ready`、`fullscreen`（带 `active`）、
`settings`、`background-video`、`background-video-confirmation` 与 `error`；未声明的消息作为
`ChartPreviewExtensionMessage` 原样透传给游戏钩子。`parseChartPreviewHostCommand` 只接受已声明的类型与载荷，
`applyChartPreviewHostCommand(raw, player)` 用同一份分派器驱动四套播放器的 `pause` / `exitFullscreen` /
`dispose` / 可选 `confirm`，`chartPreviewHostCommandScript(command)` 是宿主命令的唯一序列化入口，
`parseChartPreviewBridgeMessage` / `isChartPreviewPlayerEvent` 是 RN 侧的解析与判别守卫。
语义固定为：暂停（手动或宿主生命周期 inactive）只停播并释放临时媒体、不改变全屏；进入全屏只由播放器自己的按钮发起；
`dispose` 停播、退出全屏并回收资源且幂等，之后播放器不再改动界面或回报状态。
兼容行为不引入版本协商：旧 `ready` 无载荷直通；旧扁平 `settings` 去掉保留键 `type`/`message`/`active` 后归一化成
`settings` 信封；旧 `stop` 命令（裸类型名或对象）等价于 `pause` + `cause: 'lifecycle'`，`chartPreviewStopScript()`
仍输出旧格式供既有导出链与浏览器检查脚本使用。
`dispose` 由壳注入：释放的会话仍是当前会话时才注入 `DISPOSE_SCRIPT`，触发点是 prepare effect 的清理函数（卸载或依赖变化）、
后台与内存警告、手动重载、播放器失败以及内容进程退出/渲染进程终止；四个播放器把各自的释放实现挂到同一分派器上，
其中 osu! 与 Rizline 播放器另有 `pagehide` 兜底释放，舞萌与 Phigros 只依赖宿主的 `dispose` 命令。
四套播放器的生成物（`assets/maimai-chart-preview/`、`assets/phigros-chart-preview/`、`assets/osu-chart-preview/`、
`assets/rizline-chart-preview/` 下的 `player.js`、`player.bundle`、`index.html`）由
`npm run build:chart-preview`、`npm run build:phigros-chart-preview`、`npm run build:osu-chart-preview`、
`npm run build:rizline-chart-preview` 重建，`npm run check:generated` 只校验不写盘。
合同由 `chart-preview-host-contract.test.ts` 与 `chart-preview-screen-shell-contract.test.tsx` 覆盖。

Phigros 的谱面资源在服务层：`services/phigros-chart-preview-resources.ts` 提供端口
`PhigrosChartPreviewResourcePort`、端口工厂 `createPhigrosChartPreviewResourcePort(ossBase?)`、
加载器工厂 `createPhigrosChartPreviewResourceLoader(port)`，以及默认装配后的
`loadPhigrosChartPreviewResources(target, signal, read?)`、`loadPhigrosChartPreviewVariants(target, signal)`、
`loadPhigrosChartPreviewBundle(target, signal, ossBase?)`；预览与兼容包下载共用发布恢复、超时、字节校验与取消。
`domain/phigros-chart-preview.ts` 只保留清单与发布的纯解析：`resolvePhigrosChartPreviewVariants`、
`resolvePhigrosChartPreviewAssetBundle`（按 `.0`、无编号、唯一编号目录选择默认谱面；
已有默认目录缺少所选难度时仍报错，不从其它变体拼接，确保匹配默认音乐）、
`phigrosChartPreviewLevelLabel` 与 `PhigrosChartPreviewResourceRead` 端口形状。
领域纯度由 `phigros-chart-preview-domain-purity.test.ts` 与 `rizline-chart-preview-domain-purity.test.ts` 钉住：
这两个领域文件不得静态引入 `@/services/`、`@/providers/`、`@/storage/`、`@/state/`、`@/hooks/`、`@/features/`
或 Expo/React 模块，纯解析只依赖结构化的发布快照与清单字段。
`PhigrosChartPreviewTarget` 可选 `variantIndex` 指定编号谱面，优先匹配同编号音乐；清单中没有
专属音乐条目时使用歌曲共用音乐。专属音乐重复、下载失败或校验失败不得触发共用音乐回退；
未指定编号时保持默认规则。`phigros-resources.test.ts` 覆盖共用音乐、专属音乐与缺失资源。
服务层的 `loadPhigrosChartPreviewVariants(target, signal)` 复用发布服务，按所选难度枚举并数字排序编号。
预览路由通过 `usePhigrosChartVariantSelection(target)` 组合公共 `showActionNotification(input)`
的队列和 `dismissNotification(id)`：先提示里谱，再展示非 `.0` 选项，单谱不弹窗。
选择期间复用 `ChartPreviewScreenShell` 的 waiting 状态，公共渲染层不增加游戏分支。
卸载与后台撤销弹窗及请求；交互由 `phigros-chart-variant-selection.test.tsx` 覆盖。
预览将已验证的谱面文本、音乐 Base64 和曲绘 data URL 交给既有配置与暂存计划；
预览自定义 `read(asset, index)` 与兼容包下载都接入 `downloadChartResource` 的原生文件、取消和进度，
读完仍走 `verifyPhigrosResource`。Phira 预览 zip 经注入的 `downloadChart`（同一下载入口）再解包；
未注入时回退 `phiraProvider.downloadChart`，供 live 演示。共享预览/下载核心不识别 Phigros 修订或音符。
相关合同包括 `phigros-chart-preview-resources.test.ts`、`phigros-chart-preview-input.test.ts`、
`phigros-chart-preview-pgr-core.test.ts`、`phigros-chart-preview-screen.test.tsx`、
`phira-compatible-chart-download.test.ts` 和 `chart-preview-screen-shell-contract.test.tsx`。
PGR 解析与 prpr 一致：时间倒序或字段无效的判定线事件忽略，缺失的事件/音符数组视为空，不中断整谱。

osu! 的 `features/osu-chart-preview/configuration.ts` 统一路由参数与设置归一化。
`prepareOsuChartPreviewWebViewSource(target, theme, settings, signal, onProgress?)` 组合
`downloadOsuBeatmapsetArchive`、`captureResourceWrites('shared', signal)`、
公共 session 目录和 `prepareChartPreviewWebviewFromPlan`，每个异步阶段及返回前复核取消和代次。
只在临时 session 暂存资源，不新增缓存注册、清理分支或共享壳游戏分派。
`features/osu-beatmapset-download/osu-beatmapset-download.ts` 的
`downloadOsuBeatmapsetArchive(directory, { beatmapsetId, includeVideo }, options?): Promise<File>`
供预览和谱包保存共用；选项包含 `signal`、字节 `onProgress`、`validate(file, signal)`、
`maxArchiveBytes` 与 `oversizeMessage`。传输字节与落盘文件长度均受预算约束（含未知
总长度），读内存前先按文件长度拒绝；预算超限抛 `ChartPreviewBudgetExceededError`
且不再切源，传输/格式失败继续换源。预览用 256 MiB 预算，谱包保存用独立的
`OSU_BEATMAPSET_PACKAGE_MAX_BYTES` 与专属文案。
按 Sayobot、osu.direct、Catboy、Nerinyan 自动接续，无视频请求跳过 Catboy；每源 15 秒
无新增字节即取消，外部取消和 shared 写入代次失效终止全部尝试。候选文件独占，迟到
下载只能清理自身；ZIP 结构、目标谱面或资源提取校验失败继续下一源，不向页面暴露来源。
谱包保存经条目扫描与逐项受限 CRC 完整校验后落盘，预览校验复用资源读取器。校验回调负责隔离与
清理自己的临时输出，成功前不发布资源；下载通过公共代次订阅立即取消静默失效任务。
`downloadChartResource(directory, fileName, url, signal?, onProgress?): Promise<File>` 继续承担
原生落盘及字节进度，统一验证 HTTP 2xx 与非空结果，保留 `ProviderError` 分类，失败清理
文件，取消立即结束等待并回收迟到结果；公共层不包含游戏或镜像名单。
`ChartPackageDownloadError` 继承 `ProviderError` 并保留既有错误类型识别；资源场景单独
映射拒绝访问文案，避免将公共文件服务的 401/403 显示为账号问题。
`readOsuChartPreviewArchive(archive, target, reader)` 继续统一 ZIP、路径、精确难度选择与
媒体读取；CRC 按块让出并检查取消。媒体逐项校验后即 `stageMedia`，每项只读一次；
失败时函数抛出，不返回半份清单，调用方清理隔离候选目录。预览在候选校验内完整执行，
媒体写入该候选独占子目录，校验或解压失败也能
自动接续。失败或取消清理候选目录，成功才将已读取资源交给 HTML 和音频注入准备。
原生提取与播放器共用 `selectPreviewOsbPaths`、`selectPreviewResources` 和路径解析；
按 BeatmapID 精确选择文件，目录相对引用不通过同名文件猜测替代。
`createChartPreviewInjectors<OsuChartPreviewConfig>` 负责安全注入，音频独立脚本与
本地图片／视频 URI 避免经桥传输谱包；媒体缺失由播放器给出明确提示并播放可用内容。
`ChartPreviewScreenShell` 的请求保留 `prepare(signal, settings, onProgress?)`，`timeoutMs`
默认 120 秒，新增可选 `readyTimeoutMs` 默认 60 秒；waiting 不计时，ready 前最多显示 99%。
超时独立切换到可重新加载状态，内存警告与内容进程退出显示手动重载提示；重载创建新
准备会话，普通后台恢复与短暂 inactive 保持各自行为。会话守卫覆盖准备、桥接、设置、
延迟回传与内容进程事件，旧会话只释放自己的资源。壳使用公共错误文案转换，不展示底层异常。
osu 初始化仅准备并绘制首帧，播放和重播才恢复音频、启动时间轴，保持公共设置与播放时钟入口。
`PreviewBackgroundBlur` 在 osu 媒体合成入口检测实际 Canvas 滤镜能力，并提供双缓冲降采样
分离高斯绘制；缓存、暂停重绘和释放经既有 `PreviewMedia` 生命周期管理。六类 catch 音符
在内建皮肤生成入口统一为半透明实心加不透明同色描边，不修改音符运动、判定或共享设置协议。
下载与生命周期合同为 `chart-resource-download.test.ts`、`osu-beatmapset-download.test.ts`、
`chart-preview-screen-shell-contract.test.tsx`；其余合同为 `osu-chart-preview-resources.test.ts`、`osu-chart-preview-prepare.test.tsx`、`osu-chart-preview-screen.test.tsx`、
`osu-song-detail.test.tsx`、`osu-chart-preview-build.test.ts` 和 `tests/osu-preview/`。
`node scripts/check-osu-player.mjs [Playwright 模块入口]` 在内存打包并验证四模式手动启动、
catch 实心透明度、同色描边和降级模糊像素；不代替 iOS/Android WebView 真机验证。

Rizline 的谱面资源同样在服务层：`services/rizline-chart-preview-resources.ts` 提供端口
`RizlineChartPreviewResourcePort`、默认装配 `defaultRizlineChartPreviewResourcePort()`、
加载器工厂 `createRizlineChartPreviewResourceLoader(port)` 与 `loadRizlineChartPreviewResources(target, signal, read?)`；
`domain/rizline-chart-preview.ts` 只保留 `resolveRizlineChartPreviewBundle` 与
`rizlineChartPreviewResourceUrl` 等纯解析。读取通过端口里的 `rizlineResources.withRelease` 按 `songId`
与 `levelIndex` 对应难度定位唯一 `.json` 谱面和 `.m4a` 音频，并用清单 `files` 的 size/sha256 走 `verifyResourceBytes`。
`features/rizline-chart-preview/` 提供配置、打开、注入、原生准备与 WebView 播放器；
`prepareRizlineChartPreviewWebViewSource` 复用 `downloadChartResource` 与
`prepareChartPreviewWebviewFromPlan`，把谱面/音频写成会话脚本 `chart-data.js` /
`music-data.js`。路由 `/songs/rizline-chart-preview` 装配
`ChartPreviewScreenShell`，全屏方向传 `portrait_up`。官方 JSON 解析与 9:16 Canvas
绘制留在游戏播放器内。相关合同包括 `rizline-chart-preview-resources.test.ts`、
`rizline-chart-preview-resource-ports.test.ts`、
`rizline-chart-preview-prepare.test.tsx`、`rizline-chart-preview-screen.test.tsx`、
`rizline-chart-preview-controls.test.ts`、`rizline-chart-preview-chart.test.ts`、
`rizline-chart-preview-playfield.test.ts`、`rizline-chart-preview-build.test.ts` 与
`rizline-ui.test.tsx`。真机 WebView 音画同步无法用单测代替。

`chart-preview-shared/webview-player/wheel.ts` 的 `setupWheelPopup` 接受元素、即时预览与提交
回调、范围、初始值、可选文本标签及数值格式，供舞萌、osu! 与 Rizline 使用；返回
`getValue`、`setValue` 与 `dispose`，`closeActiveWheelPopup` 统一关闭当前浮层。
`frame-scheduler.ts` 按帧合并最新预览，拨轮停止 120 ms 后提交；领域设置解释留在各播放器。
共享交互模块不解释音符、模式或游戏 ID，新增设置不得另建持久化入口。
`chart-preview-wheel.test.ts` 验证预览、提交、格式与销毁，
`osu-chart-preview-controls.test.ts` 与 `rizline-chart-preview-controls.test.ts`
将公共控制器样式和结构与现有播放器直接比较。

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
  及 `prepareChartPreviewWebviewFromPlan(plan, signal?, onProgress?)`，不增加网络资源或缓存执行器。

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
  `createChartPreviewInjectors<TConfig>(spec)` 负责序列化入口，转义脚本边界并原样保留 `$`，`prepareChartPreviewWebviewFromPlan(plan, signal?, onProgress?)`
  负责资源暂存、清理和落盘进度。舞萌通过计划中的 `fileName` 加入皮肤修订/正解音哈希，复用共享
  `remoteCacheDirectory` 的非空文件缓存，`bytes` 只作进度权重，不另建缓存执行器或清理范围。
  `skin-data.js` 的键仍为原始 S3 对象路径，语义别名仅在 Simai `skinSemantics.ts` 解释。
  Simai `resolveStarSkin(path, pink)` 由 `buildFrame` 的统一命令入口调用，只替换普通
  `star.png` / `star_double.png`；`SKIN_DISPLAY_SIZE` 保留粉色资源的原显示占位和 EX 对齐。
  `EACH_COLOR` 同时供 Each 着色与全部 HOLD 持续圈使用；Slide 的 JUST 资源选择和
  打击星型图层过滤留在 Simai 引擎：普通 TAP 与 Touch 跳过星型层，Break 绘制 `Star_Perfect`。
  图片/视频共用 `MainRenderer` 的居中圆形背景绘制，
  不扩展共享设置协议。`maimai-chart-preview-visual-settings.test.ts` 覆盖这些渲染合同。
  本地原始 `sensor.webp` 以 `moduleId` 复用共享暂存清单，并由既有 writer 注入同一
  `skin-data.js`；判定区的中心/缩放校准留在 Simai `skinSemantics.ts`，判定点复用
  音符几何 `buttonPoint`，判定区与判定线共用圆环和点的绘制路径。
  模型、Simai 扩展、路径、SV、帧命令与皮肤加载位于 `features/simai-chart-preview/`；通用 `chart-preview-shared` 壳不解释音符。
  同目录 `webview-player/timeConversion.ts` 的
  `resolvePlaybackRange(charts: readonly Chart[], musicDurationSeconds: number | null, musicOffset?: number)`
  接收已解析的非空谱面数组，返回同一主谱时间轴上的 `totalDurationMs` / `totalBeats`。
  复用 `TimingTimeline` 和音乐时间换算，以各侧实际谱尾与音频结尾的较晚者统一播放、拖动、
  小节跳转和背景范围；音乐缺失时保留谱尾。音源自然结束不清除公共 `PlaybackClock`，
  剩余谱面继续计时和变速；主动暂停、跳转与退出仍清除时钟。
  `maimai-chart-preview-audio.test.ts` 覆盖歌曲尾奏、长条谱尾、偏移、变 BPM 与 Buddy 范围。
  `npm run typecheck` 包含 `typecheck:maimai-player`、`typecheck:phigros-player` 和
  `typecheck:osu-player`、`typecheck:rizline-player`，完整检查四类播放器入口和引擎。
  修改播放器后必须按所属功能执行 `npm run build:chart-preview`、`npm run build:phigros-chart-preview`、
  `npm run build:osu-chart-preview` 或 `npm run build:rizline-chart-preview`（公共拨轮、公共资源预算或
  `chart-preview-shared/webview-player/` 的改动会让多套生成物同时过期），并执行 `npm run check:generated` 确认
  `index.html`、`player.js` 与 `player.bundle` 与当前源码一致，最后完成运行时验收。相关合同包括 `chart-preview-screen-shell-contract.test.tsx`、
  `maimai-chart-preview-webview.test.ts`、`maimai-chart-preview-remote-assets.test.ts`、
  `chart-preview-progress.test.ts` 和 `maimai-chart-preview-reference.test.ts`；浏览器检查不能代替 iOS/Android WebView 验收。

- 四套播放器的 `main.ts` 只接线，播放状态归各自的会话类，宿主与视图只读。
  Simai（舞萌与 Majdata 共用）在 `features/simai-chart-preview/webview-player/`：
  `playback.ts` 的 `SimaiPlaybackSession` 独占播放位置（拍）、命令代次、音源与 rAF，
  位置换算与播放范围沿用 `timeConversion.ts` 的同一时间轴；
  `timelineView.ts` 的 `SimaiTimelineView` 由窗口与全屏控制器各持一个实例，
  密度条、刻度与播放头节点归实例所有；`backgroundMedia.ts` 的 `SimaiBackgroundMedia`
  独占背景图片/视频元素、就绪状态与视频回绕同步，播放状态只作为每帧输入读入。
  三者的视图与桥回执都经 `SimaiPlaybackHost` / `SimaiBackgroundMediaHost` 回调接线。
  Phigros 与 Phira 在 `features/phigros-chart-preview/webview-player/`：`playback.ts` 的
  `PhigrosPlaybackSession` 独占播放位置（谱面秒）、命令代次、音乐音源、打击音调度与 rAF，
  设置对象由宿主持有、会话只读取当前值；`timelineView.ts` 的 `PhigrosTimelineView`
  持有密度条、刻度与播放头节点，时长与音符条目每次构建时传入。
  Rizline 的 `PreviewSession` 同样独占播放位置、音源、帧循环与命令代次，并通过可选的
  `PreviewSessionEnvironment`（`defaultPreviewSessionEnvironment`）注入音频上下文与帧循环，
  生产调用点不传该参数。osu! 的 `PreviewSession` 与 `PlaybackHandle`
  （`features/osu-chart-preview/webview-player/playback.ts`）同样持有会话，
  `main.ts` 只保存句柄与界面状态。会话状态由会话类内部改写，`main.ts` 只接线、不声明位置、时钟、
  代次或音源字段。公共 `PlaybackClock` 与 `chart-preview-shared/webview-player/` 的桥接、
  拨轮壳仍是各自的公共入口，命令与事件语义由共享桥接合同决定。
  合同见 `chart-preview-playback-ownership.test.ts`、`chart-preview-simai-playback-session.test.ts`、
  `phigros-chart-preview-playback-session.test.ts`、`rizline-chart-preview-playback.test.ts`。
- osu! 谱面确认在设置关闭背景视频时，下载 `novideo` 包并且不把视频条目放进资源计划。
- Phira、TUF 和 osu! 的无限列表使用 `components/game-content/InfinitePageFooter.tsx`，页脚表示加载中、后页失败重试或已经结束，已载列表保留。
- 谱面下载、解压、事件、循环、纹理和 GIF 使用 `chart-preview-shared/chart-preview-resource-budget.ts` 的有限预算。明确超限抛出 `ChartPreviewBudgetExceededError`（不再换源重试）；无法确定的声明量仍抛基类 `ChartPreviewBudgetError`，按格式问题处理。循环超过 4,096 次后按时间求值，不展开成无界指令。ZIP 先核对声明大小，选出媒体后再解压并校验该条目。同一次准备用 `actualBytes` 累计实际读出字节，达到总上限后不再读取下一条。CRC 每 64 KiB 检查取消并让出。声明大小、实际读出字节、解码像素和进程内存分开计算；这些常量不是进程内存上限。长解析按 `AbortSignal` 与写入代次在固定步数让出。
- 成绩图前台收到内存警告后卸掉预览，页内提供降低分辨率并重新加载。警告到达时不按当前分辨率自动重建，重复警告也不重新挂上 WebView。`best-image-memory-recovery.test.tsx` 覆盖这个恢复。
- 成绩图预览只挂载当前页 WebView，其余页使用轻量占位；不得让多份大 HTML 常驻。
- 谱面确认和下载任务必须响应卸载、后台与 AbortSignal，不得在取消后继续写缓存或显示成功。
- 作为下游 memo 依赖的数组或对象必须保持稳定引用，避免无意义重算和重渲染。

## Majdata 与 Simai 公共路径

- `http-json.ts` 的 `JsonRequestOptions<T>` 支持 `init` 与 `onResponse`；JSON、字节和
  `requestProviderResponse(options, read)` 共用取消、超时、重试、Schema 和错误归一化。
  `http-cookies.ts` 提供 `responseCookies`、`cookieHeader` 和会话校验；Cookie 仅发送到
  明确的来源与路径。`PasswordLoginPanel` 复用登录表单、取消和前后台流程；默认用户名身份，
  可选手机号展示配置不改变提交动作，游戏只提供登录动作。
- `GAME_OPTIONS` 是添加游戏和已绑定账号分组的同一注册来源；可选 `accountOrder`
  保持已有账号顺序，新游戏按注册顺序追加，`familyId` 保留 osu! 家族分组。
  `isCredentialProvider(id)` 根据 `bindingKind` 决定账密账号操作，不另列 Provider 白名单。
  `createMajdataBoundAccount(input)` 统一登录、恢复和同步的账号映射；头像使用
  `majdataAvatarUrl(username)`，沿用 `BoundAccount.avatarUrl`、账号缩略信息与公共头像回退。
- `majdataContentAdapter` 保留 UUID 和原始难度索引；DTO 不进入共享卡片逻辑。
  `game-content/SimaiScoreCard` 是舞萌与 Majdata 共用的实际卡片布局，通过
  `difficultyBadge`、可选 `chartTypeBadge` 和 `sideMetric` 注入难度、类型与右侧指标；
  `SimaiDifficultyBadge` 接受已格式化文本与主题，支持普通、compact、mini 三种既有尺寸。
  `FavoriteSongRow`、`GameSongCover`、`SongListSectionHeader` 与 `SimaiListStyles`
  统一歌曲行、封面失败占位、分区标题及三种列表布局。
  `GameSearchHeader.layout` 的 `records` / `catalog` 复用既有搜索区，
  `resultCountText` 用于分页已加载数量；筛选控件放在独立的横向标签行中。
  Majdata 难度行通过 `FilterChipFrame`、`NeutralChip` 与 `MajdataDifficultyBadge`
  组合直接多选按钮，保留原始难度索引和多选取并集的匹配规则；不另建筛选状态。
  `domain/difficulty-theme.ts` 的 `BLUE_DIFFICULTY_COLORS` 由 Phigros HD 和 Majdata Easy
  同时引用；其余难度和成就徽章复用 `ScoreVisuals`。
- `SimaiSongDetailLayout` 的 `SimaiSongHero`、`SimaiSongChrome`、`SimaiSongMetadata`、
  `SimaiChartResultLayout`、`SimaiNoteTable` 与 `SimaiSongDetailStyles` 由两种游戏共同使用，
  保持舞萌封面遮罩、文字、悬浮按钮、元数据表、成绩区与网格物量的实际结构和样式。
  `SimaiNoteStatus({ loading, onRetry? })` 复用社区谱面文字加载状态，成功后才显示网格。
  `simaiChartActionStyle` / `simaiChartActionTextStyle` 通过主题值表达既有按钮状态；
  游戏容器只组装字段和动作，`TagEditor` 自己渲染每处唯一的本地标签标题。
- `DxRatingCard` 保持单值结构；可选 `fitValue` 允许完整合计适应宽度，
  `accessibilityLabel` 表达指标本身，其余调用方保留原 Rating 结构。
  Majdata 总览与账号共用 `majdataTotal(records)` 的 Σ(DX＋Classic)，四位小数附 `%`；
  账号 `accountScoreTheme` 使用固定中性主题，不套用舞萌评价档位。单谱与难度详情只显示 DX。
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
- `useChartPackageDownload.start(runner, { optionalVideoUrl? })` 统一视频 HEAD 检查、
  是否包含视频的选择和正式下载；runner 接收 `(options, includeVideo)`。
  视频检查使用公共 HTTP 的 12 秒超时和单次尝试，与弹窗、下载共用重复点击锁与取消信号。
  进入后台、卸载或取消后关闭未完成选择，迟到结果不得再打开弹窗、开始下载或显示成功。
- `snapshot-cache-utils` 的 `captureResourceWrites(scope, signal?, accountId?)` 与 `invalidateResourceWrites(scope)`
  让缓存清理使已返回首屏的后台刷新也失效。游戏缓存清理在枚举和删除前提升代次。
  `resourceWriteGeneration(scope)` 隔离清理前后的共享请求键；`createInflightGuard.share`
  按消费者维护取消，只有最后一个消费者取消才终止底层请求。
  Majdata 详情复用 `cacheFirstLoad`，详情、文本和解析复用该共享请求入口，写入和
  首屏后台刷新回调前后检查代次；图片仍遵守公共
  10 MiB、10 KiB、50% / 250 ms 可见性规则，没有另建图片缓存。

合同覆盖 `majdata.test.ts`、`majdata-cache.test.ts`、`majdata-ui.test.tsx`、
`majdata-account-flow.test.tsx`、`majdata-overview.test.tsx`、`majdata-list-contract.test.tsx`、
`majdata-detail-contract.test.tsx`、安全仓库和下载测试，以及完整舞萌解析、预览与共享 UI。
详情合同使用真实顶部按钮、TagEditor、元数据表及轮播；舞萌原结构与样式基线不变。
独立 C# 样本来自 MajSimai 与
MajdataPlay 原始计分方法，普通测试无需 .NET；原生账号、保存和播放仍须真机验收。

## 项目不变量

- 读失败不毁数据。账号目录、偏好、成绩、曲库和资源快照在 I/O 失败或 JSON 损坏时保留原值；损坏文本另存 `.corrupt` 副本。账号目录的未知版本或顶层结构错误另存 `.unrecognized`，后续写入不能静默覆盖。会话索引损坏或无法识别时同样保留原文与副本并抛类型化错误，旧版迁移源解析失败时跳过但不删除。调用方得到明确错误，不把不可识别数据当成空目录。
- 代次过期不能提交。`captureResourceWrites` 在等待之前记下范围和账号代次，`invalidateResourceWrites` 之后再提交会抛出「缓存请求已失效」。
- 查询 key 含稳定身份。`gameDataQueryKey` 包含查询版本、账号、游戏、查分器和会话模式；换账号不会命中另一账号的缓存。
- 一个实体一份已提交版本。账号最终数据只经 `publishGameDataBundle` / `publishEntityValue` 进入缓存，跨实体失效经 `invalidateEntityValue` 端口，页面与加载器不各自操作缓存客户端；主动刷新只按 `refreshGameDataBundle` 的返回值判定成功、部分失败或全部失败，总览与页面经同一组参数读到同一份已提交版本。
- 会话只有一份真相。`useSession` 保存账号状态与派生视图，Provider 实例按「账号 + 凭据版本」缓存，只在 release、凭据版本变化、账号身份或展示名变化时重建；凭据落盘与轮换只经凭据提交协调器，Store 不构造 Provider、不调用安全存储 API。
- 播放状态归会话。每套播放器的位置、命令代次、音源与帧循环由播放会话类独占，视图类独占自己的时间线节点，`main.ts` 只接线。
- 备份可往返且原子。`createUserDataBackup` 与 `parseUserDataBackup` 往返后条目和预设一致，导出前经过 `assertUserDataBackupExportable`，上限 `MAX_BACKUP_FILE_BYTES`（12 MiB）。恢复经 `mergeBackup` 在单个数据库事务内读改写提交；单项收藏/练习/标签经 `updateTarget` 按键写回，按游戏清除经 `clearGame`，均不重写无关行；`list(gameId)` 在 SQL 层按 `game_id` 筛选。
- 不可信输入有资源预算。谱面下载、解压、事件、音符、循环和纹理在展开前调用 `chart-preview-resource-budget`，超出抛出 `ChartPreviewBudgetError`。声明大小、实际读出字节和纹理像素分别检查，不把同一个常量当成进程内存上限。

账号列表补齐（本地 Rating、缩略图、Phigros summary、中二个人资料）按最多 4 路在飞读取，取消后不再开始尚未发出的账号。Phigros 谱面皮肤的持久缓存文件名带 `PHIGROS_SKIN_CACHE_REVISION`，会话目录仍写入 `skin/` 下的原文件名。Score Hub 的 HTTP、类型、机台任务和任务轮询分别在 `score-hub-http.ts`、`score-hub-types.ts`、`score-hub-cabinet.ts`、`score-hub-poll.ts`，调用方仍从 `score-hub-client.ts` 导入。舞萌上传的好友码登录、成绩轮询和落盘分别在 `upload-maimai-login.ts`、`upload-maimai-score-fetch.ts`、`upload-maimai-target-write.ts`，入口仍是 `upload-maimai-from-friend-code.ts`。

## 新增或修改功能时的检查顺序

1. 用 `rg` 搜索能力名、导出名和相邻游戏调用方，不从文件名猜签名。
2. 读取候选公共实现、类型、直接调用方和测试；确认缺省行为、错误边界和平台分支。
3. 能复用则通过适配器、配置、能力或插槽接入。需要扩展时优先增加可选语义并保持旧调用方缺省行为。
4. 新游戏先验证上游数据，再实现原始 Schema/Provider 与注册，随后实现规范化和展示适配器，最后接共享页面。
5. 至少覆盖歌曲、谱面、成绩映射，以及缺失数据、未游玩、满成绩和特殊难度等真实边界。
6. 按改动范围运行相关单元/UI/合同测试，再运行 lint、typecheck 和完整测试。Host 结构哈希与字符串金样出现差异时修正实现，不通过更新基线掩盖差异。
7. WebView、导出、原生手势、动画流畅度、生命周期和内存行为仍需对应平台真机验收，自动化通过不能替代该链路。

## 宿主结构合同的哈希与诊断基线

公共 UI 的宿主结构由 `tests/host-contract-hash.ts` 的 `expectHostContract({ name, tree, expectedHash, serialize?, diffLimit? })` 把关：
通过与否只由规范化序列化文本的 sha256 决定，测试里的哈希字面量是唯一门禁。
`tests/host-contract-baselines/<name>.json`（`name` 的第一段是校验文件名、第二段起是用例域名，
例如 `p3-host-contract-visuals/phigros-difficulty-badge`）只是诊断快照：哈希不一致时
`readHostContractBaseline` 读出记录的结构，`diffHostContractTrees` 与 `formatHostContractDiff`
给出按路径定位的 changed / added / removed 差异，避免只报两串十六进制；基线缺失或不可用时仍按哈希判定。
基线只在显式设置 `HOST_CONTRACT_UPDATE_BASELINE=1`（`HOST_CONTRACT_UPDATE_ENV`）时改写，
否则 `writeHostContractBaseline` 直接抛错，测试不会静默写仓库文件。
消费者是 `p3-host-contract-{visuals,cards,pickers,song-details}.test.tsx`、`game-content-host-contract.test.tsx`、
`filter-shell-host-contract.test.tsx` 与 `song-detail-chrome-contract.test.tsx`；
`host-contract-hash.test.tsx` 自测门禁与差异报告的边界。谱面确认的宿主命令合同由
`chart-preview-host-contract.test.ts` 直接校验，不走哈希门禁。

## 可复现检查

在 `apps/mobile` 执行 `npm run check:architecture`、`npm run check:generated`、
`npm run check:lossless-assets`、`npm run benchmark:optimization`、
`npm run benchmark:phigros-push`、`npm run audit:prod`。播放器生成检查从当前
源码重新打包，同时验证 HTML、player.js 与 player.bundle；基准比较保留固定提交的绘制
命令及搜索结果，报告桌面 CPU 分布，不推断手机帧率。推分基准用确定性存档测量
30/300/1000 条成绩的总耗时与事件循环最大阻塞，不设 CI 耗时门槛。生产审计门槛分执行、校验、
完整性、政策四层（退出码 0 通过 / 1 政策失败 / 2 执行失败 / 3 报告不合法 / 4 报告不足以判断）：
critical 无论能否解析出公告编号都失败；报告缺字段、条目与 metadata 不自洽、未知严重级别、
无法识别的公告，以及空 `via`、悬空引用、成环而无可解析根因都按失败处理；基线记录的分类值、
包名与版本必须与锁文件一致，基线内公告的定性见脚本注释。
无损 PNG 检查验证 CRC、解压扫描线、RGBA、透明度及所有非 IDAT 块。完整命令和双端云端比较流程见技术架构文档。

仓库轻检查在仓库根目录执行 `node .github/scripts/check-light.mjs`（`--self-test` 额外用故意
破坏的样例证明每类检查都会失败）：用固定的真实 YAML 解析器（`yaml` 2.9.0，声明在
`.github/scripts/package.json`，与 `apps/mobile` 依赖树无关）解析 workflow 与 action，
按解码后的标量检查 `run:` 的 shell 文本、执行 `bash -n`、检查 `.mjs`/`.cjs` 的
`node --check` 语法，并运行分类器自检 `node .github/actions/changed-scope/self-test.mjs`。
它只读仓库文件，不安装移动端依赖树。
