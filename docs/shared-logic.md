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
  反向依赖 `components`/`hooks`/`screens`、Provider 层反向依赖 `components`/`features`/`hooks`/`screens`/`state`，
  服务层的运行时导入不得指向 `hooks`。
- 共享渲染核心（`SHARED_RENDER_ROOTS`：`components/game-content/`、`features/best-image/`、
  `features/chart-download-shared/`、`features/chart-preview-shared/`）不得按具体游戏 ID 分支：
  比较或 `switch` 游戏身份选择器（`game` / `gameId` / `kind`）与游戏 id 字面量都会被拦；
  `SHARED_DISPATCH_ALLOWED` 里的组合边界保留显式分派权限（`features/game-content/adapters/`、
  `domain/game-bind-options`、`domain/game-profile`、`domain/game-mode-family`、`domain/game-data`、`domain/game-content`）。
- 路由层 `app/**` 是组合边界：允许选择游戏页面与按游戏分派，但 `src` 不得反向依赖 `app`。
- 生产边界没有默认过渡豁免；嵌套 `screens/maimai/` 等游戏页面按登记归属校验。混合 import 中的值与类型边分别判断，只有完整的类型导入可使用类型规则。
- 允许/拒绝源码合同由 `tests/architecture-boundaries.test.ts` 覆盖（边界反例、共享渲染分派负例、
  未登记组件目录与页面文件的负例、再导出/相对路径/动态导入/require 绕行负例、全具名 `type` 导入负例，
  以及合法组合必须通过）。`tests/shared-entrypoint-boundaries.test.ts` 另外钉住公共入口清单
  （`AccountSwitchSheet`、`BoundAccountGroupedList`、`ProviderLoginSheet`、`MaimaiFilterBar`、
  `features/best-image/build-best-image-html.ts`）不得直接依赖游戏模块，且边界配置不得为它们保留豁免条目。
  结构检查不能替代对新间接依赖和业务分支的审查。

## 领域与展示契约

详情编码总是写入 `gameId`，解析显式游戏身份优先，旧链接保留当前游戏回退。`app/songs/[songId].tsx` 在目标游戏与当前游戏不同时通过既有 `AccountSwitchSheet` / `switchBoundAccount` 选择账号，保留原目标参数；取消时不挂载错误游戏的详情。强调色实心按钮、选中标记和加载指示统一使用 `theme.onAccent`，亮色和暗色强调色共用同一前景规则。

| 能力 | 权威入口与主要导出 | 使用边界 | 主要验证 |
|---|---|---|---|
| 物量分组展示形状 | `src/domain/game-content.ts`：`GameNoteValue`、`GameNoteGroup` | 只描述「键 + 标签 + 若干数值」的展示形状，各游戏自行构造；消费方是 `features/game-content/presentation.ts` 的 `NoteGroupPresentation`、`features/game-content/adapters/adofai.ts`、`features/game-content/adapters/phira.ts` 与 `domain/majdata.ts` 的 `majdataNoteGroup(counts)` | `majdata.test.ts` |
| 展示模型 | `src/features/game-content/presentation.ts`：`TextEffect`、`MetricPresentation`、`BadgePresentation`、`ScoreCardPresentation`、`SongRowPresentation`、`BestSectionPresentation`、`ChartCardPresentation`、`NoteGroupPresentation`、`SongDetailRoute` | 页面容器生成 presentation；共享组件不读取游戏 Hook 或原始 Provider DTO；`SongDetailRoute` 是 `domain/detail-target.ts` 的 `DetailTargetRoute` 别名 | `game-content-adapters.test.ts`、`game-content-host-contract.test.tsx` |
| 游戏适配器 | `src/features/game-content/adapters/index.ts` 及同目录各游戏适配器：`presentMaimaiScore`、`presentPhigrosScore`、`presentChunithmScore`/`presentChunithmSong`、`presentPhira*`、`presentRizline*`、`presentStandardSong`、`presentTuf*`/`formatTufAccuracy`、`presentMuseDash*`/`formatMuseDashScore`/`formatMuseDashAcc`/`isNumericMuseDashLevel` | 只做「游戏真实模型 → 展示模型」转换：原始 DTO、领域类型与字段解释留在各游戏领域层与 Provider；这里不承载归一化存储或缓存语义 | `game-content-adapters.test.ts` |
| 详情定位 | `src/domain/detail-target.ts`：`DetailTarget`、`DetailTargetRoute`、`DetailTargetParams`、`decodeDetailTarget(gameId, params)`、`encodeDetailTarget(target)`、`detailTargetHref(route)`、`DetailTargetErrorCode`；`src/domain/user-library.ts`：`libraryDetailTarget(target)` | `/songs/[songId]` 的唯一语义来源；非法、缺失、重复或跨游戏槽位返回可判别错误。个人曲库先生成游戏专属 target，再编码路由，不把内部存储槽位直接复制到 URL；没有详情能力的条目禁用跳转 | `detail-target.test.ts`、`detail-target-navigation.test.tsx` |
| 当前账号数据包 | `src/domain/game-data.ts`：`GamePayload`、`GamePayloadKind`、`GAME_PAYLOAD_KIND_BY_GAME_ID`、`GamePayloadOf<G>`、`GameDataBundleFor<G>`、`GameDataBundle`、`gameDataBundle()`、`gameAccountMetadata<G>()`；`src/services/game-data-loaders.ts`：`GAME_DATA_LOADERS`、`GameDataLoader`、`GameDataLoaderContext`、`GameDataLoadResult`、`selectGameDataLoader`、`loadGameDataBundle` | `GAME_PAYLOAD_KIND_BY_GAME_ID` 是 `satisfies Record<GameId, …>` 的穷尽映射（保留测试 id 为 `null`），`GameDataBundleFor<G>` 将游戏、Provider、`GameProfile<G>` 和载荷配对，`gameDataBundle` 同时校验运行时身份；`GAME_DATA_LOADERS` 也是 `Record<GameId, GameDataLoader>` 穷尽映射，`selectGameDataLoader` 对未登记游戏直接抛错，缺省没有舞萌回退分支。加载器只读取与装配，不持有查询客户端；曲库由 `services/game-data-loader-queries.ts` 的 `gameDataCatalogQueries(client)` 注入，真实中二与 osu! Provider 从会话的 `protocolScoreProvider` 复用，发布数据包、读写其它实体与失效都经 `GameDataLoaderContext` 的 `publish` / `readEntityValue` / `publishEntityValue` / `invalidateEntityValue` 端口，后台刷新句柄经 `GameDataLoadResult.background` 交回适配层登记 | `game-data.test.ts`、`game-data-loader-registry.test.tsx`、`game-registry.type-check.ts`、`game-data-refresh-contract.test.ts` |
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
三个分项汇总：全部分项成功才用新抓取时间走 `successfulRefresh`，部分成功走 `partialRefresh` 并保留旧元数据与过期标记；加载器和公共查询终态保留分项结果，认证失败不会改成 `no_data`。
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
档位表的最大值使用真实满分 1,009,000 的展示结果；定数 13.705 的上界为 15.85，
不以未截断定数加 2.15 替代同一公式的结果。

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
`resolvePhigrosStrengthProfileLabel` 可注入变体政策，UI 使用同一政策数值和生成文案。
合同见 `phigros-strength-analysis.test.ts` 与 `phigros-strength-analysis-screen.test.tsx`。
内部分析只使用 Phigros 的 `level`、`difficultyConstant`、`acc` 与 `rks` 投影，
共享成绩只在输入边界转换，不伪造舞萌 DX 字段。是否已 Phi 按真实 100% 判定，
不随推荐搜索上限变化；均衡标签按实际主轴数生成，五轴政策保留既有文案。

Phigros 推分的合法参数集中解析：`PHIGROS_PUSH_LIMITS`、`parsePhigrosPushDelta`、
`parsePhigrosPushChartCost`、`resolvePhigrosPushRequest` 与 `PhigrosPushInputError` 是唯一输入边界，
非法 delta 或预算（`NaN`、`Infinity`、0、负数、超出上限、非整数）在领域侧明确拒绝，
不会被编码成 `unreachable` / `verified` 之类的搜索结论；`app/tools/push-rks.tsx` 使用同一解析函数。
合同见 `phigros-push.test.ts` 与 `phigros-push-screen.test.tsx`。
搜索池上限必须为正安全整数；量化后的目标必须保持有限，非法输入在搜索前拒绝。
Muse Dash 成绩排序只累计有限准确率，未知准确率稳定排在末尾，不能混入原始分数作为百分比。

Phira 曲库分页用判别状态表达搜索进度：`domain/phira.ts` 的 `phiraCatalogPageState` 返回
loading / error / ready，ready 恒带 `items`（可为空）并独立描述 `hasNextPage`、`scanning`、
`paused`（扫描预算耗尽）、`nextPageFailed` 与 `exhausted`；`phiraCatalogListView` 把它映射成
列表与空态，预算耗尽保留“继续扫描”、后页失败保留已有项，不把“尚未搜完”写成“全库无结果”。
自动续扫由 `phiraCatalogQueryIdentity`、`phiraCatalogScanObservation` 与 `phiraCatalogScanNext`
驱动：推进只读「查询身份 + 已成功接收的页数与末页游标」，不依赖 UI 观察过一次请求中状态，
同一位置只请求一次，因此快速响应与慢响应都能逐页推进且不会并发重复请求同一页。查询身份改变或当前请求取消时撤销游标占位，切换回来可重新扫描同一页。
Muse Dash 的成就筛选依赖单曲 miss 明细：`museDashMissDetail` 把 `null`（pending）、
`undefined`（unknown）、`MUSE_DASH_MISS_DETAIL_FAILED`（failed）与数值（known）分开，
`filterMuseDashRandomCharts` 只接受 known，`museDashAchievementDetailsPending` 让抽取入口在 pending 期间等待；
`useMuseDashPlayDetails` 返回 `{ missByChart, failedCount, retryFailed }`，记录页据此显示失败提示并提供
只重试失败项的重试入口，随机抽取页在失败期间暂停抽取，failed 与 unknown 保持独立状态。合同见
`phira-catalog-pagination.test.ts`、`phira-catalog-scan.test.tsx`、`phira-ui.test.tsx`、
`muse-dash-content-adapter.test.ts`、`muse-dash-play-details.test.tsx`、
`musedash-random-charts-achievement.test.tsx` 与 `musedash-song-detail-route.test.tsx`。

## Provider、仓库与数据服务

| 能力 | 权威入口与主要导出 | 使用边界 | 主要验证 |
|---|---|---|---|
| Provider 契约 | `src/providers/contracts.ts`：`ProviderSession`、`RizlineSession`、`LoginCredentials`、`AuthProvider`、`ScoreProvider`、`CatalogDrivenScoreProvider<TCatalog>`、`AnyScoreProvider`、`isCatalogDrivenScoreProvider`、`CatalogProvider`、`DetailedCatalogProvider`、`requireDetailedCatalogProvider` | 每个游戏保留自己的 DTO 与 Schema；示例账号的曲库驱动成绩实现 `CatalogDrivenScoreProvider`。`DetailedCatalogProvider`（歌曲详情、别名、姓名框、收藏品）是舞萌系列曲库独有的能力集合；会话曲库槽位用 `null` 明确表达无此能力，查询禁用或通过公共守卫拒绝读取，不用伪造空曲库混合能力缺失与成功空数据，也不通过断言伪造能力 | 各 Provider 测试、`maxed-*-test-provider.test.ts`、`session-providers.test.ts`、`game-registry.type-check.ts` |
| HTTP 请求 | `src/providers/http-json.ts`：`requestJson<T>(options)`、`requestProviderResponse<T>(options, read)`、`requestBytes(options)`、`readProviderResponseBytes(response, options?)`、`fetchProviderJson(options)`、`retryAfterMs(response, maxMs = 5000)`、`resolveTotalAttempts(options)`、`JsonRequestOptions<T>`、`ProviderJsonOptions` | JSON、字节、自定义读取和曲库读取共用超时、取消、重试与错误归一化。正文按实际流字节计数，默认 64 MiB，调用方可通过 `maxResponseBytes` 提供明确预算；Content-Length 只用于预检，超限或取消立即取消 reader。`authenticated` 或凭据请求头启用 `redirect: error`，所有请求使用 `credentials: omit`；凭据请求及响应必须与配置的服务同源。`onHttpError` 只能读取同一受限错误正文；`onResponse` 在状态、正文与 Schema 均通过后执行并等待，本机提交失败不触发网络重试。外部取消透传 reason，预取消不发请求。尝试次数优先级为 `totalAttempts` > 旧 `retries` > `extraRetries + 1`，缺省 2 次；曲库读取固定 1 次，登录及写请求显式指定 1 次 | 各 Provider 测试、`http-json-contract.test.ts`、`osu-executor-contract.test.ts`、`phigros-resources.test.ts`、`phira-provider.test.ts` |
| 内容摘要 | `src/utils/resource-integrity.ts`：`sha256(bytes)`、`bytesToHex(buffer)`；`src/utils/crypto-subset.ts`：`uint8ArrayToWordArray(bytes)`、`bytesToBase64(bytes)`、`base64ToBytes(text)` | 通过现有 Expo Crypto 和 CryptoJS 能力计算摘要、编码；字体缓存保留摘要兼容导出，游戏不得反向依赖字体功能 | 字体缓存、Phigros 资源与存档测试 |
| 校验发布会话 | `src/services/verified-release.ts`：`VerifiedReleaseSession<T>`、`verifyResourceBytes(bytes, asset, message)` | 调用方提供格式专属 prepare；共用消费者取消、代次、失败重读和完整候选切换；校验字节后才发布结果 | `phigros-resources.test.ts`、`rizline-resources.test.ts` |
| Phigros 发布事务 | `src/services/phigros-resources.ts`：`phigrosResources`、`load(signal?, check?)`、`withRelease(action, signal?, check?)`、`verifyPhigrosResource(bytes, asset)`、`directory(current)`；`src/domain/account-avatar.ts`：`phigrosReleaseDirectory`、`buildPhigrosAvatarUrl(releaseDirectory, avatarName, resourceVersion?)` | Phigros 各调用方共用唯一会话发布；校验所有必需元数据后原子替换；谱面、曲绘和头像路径取 `current.manifest` 所在目录，查询参数带 `resourceVersion`；实际资源校验大小/SHA-256；失败强制绕过缓存重读一次，取消以消费者计数管理 | `phigros-resources.test.ts`、`phigros-catalog-notes.test.ts`、`phigros-score-revision.test.ts`、`account-avatar.test.ts`、`phigros-avatar-resolver.test.ts` |
| 错误边界 | `src/providers/errors.ts`：`ProviderError`、`providerErrorFromStatus`、`providerErrorToUserMessage`、`runProviderOperation`；`src/domain/session-vault.ts`：`SessionPersistenceError` | 固定文案区分授权准备、浏览器打开、回调、远端验证、构建配置、安全凭据与本机账号提交；原生或上游 message 不直接显示。`runProviderOperation` 给未分类异常标记当前阶段，保留已有 Provider/持久化错误与取消。安全存储在真实 Secret/KV IO 边界分别抛 `credential_storage` / `local_commit`，页面不能从一个 generic catch 推断存储原因。`needsCode` 表示应改用验证码 | `consumer-copy-policy.test.ts`、`provider-binding-errors.test.ts`、`oauth-login-failure-stages.test.tsx`、安全存储与回调测试 |
| LXNS OAuth 请求 | `src/providers/lxns-oauth.ts`：`PendingLxnsOAuth`、`beginLxnsAuthorize`、`requireLxnsOAuthState`、`exchangeLxnsAuthorizationCode(code, state, signal?)`、`rotateLxnsTokens`、`lxnsRotationMayReplace`、`lxnsRotationAncestors`；`src/providers/lxns-oauth-request.ts`：`LxnsOAuthRequestCore`、`LxnsTokenRotationUpdate`、`LxnsOAuthRequestTexts`、`lxnsErrorFromStatus(status)` | 舞萌和中二共享 PKCE、10 分钟 state 与串行单次消费；state 必须是非空单字符串，匹配后先删除 pending 再发送换码 POST，失败也需重新授权，迟到回调不删除新授权。换码和轮换走受限公共 HTTP，token 正文最多 256 KiB，POST 只尝试一次。账号读取同样走公共执行器。轮换回调携带 `previous` / `next` 判断凭据世代；游戏差异通过参数与映射表达，状态码文案由协议显式注入 | LXNS OAuth、上传、Session 与中二 Provider 测试 |
| osu! OAuth 授权 | `src/providers/osu-oauth.ts`：`beginOsuAuthorize`、`requireOsuOAuthState`、`exchangeOsuAuthorizationCode(code, state, signal?)`、`rotateOsuTokens` | state 使用同一进程内串行消费规则与 10 分钟期限；换码先消费 pending，公共 HTTP 禁用环境 Cookie 与自动重定向，token 正文最多 256 KiB，POST 只尝试一次。应用凭据继续由构建环境注入；缺失时抛 `configuration`，不伪装为账号验证失败。回调只在绑定服务持久化与内存投影完成后通知成功 | `osu-oauth.test.ts`、`osu-oauth-callback.test.tsx`、`oauth-login-failure-stages.test.tsx` |
| 头像解析 | `src/services/account-avatar-resolver.ts`：`AccountAvatarResolverPorts`、`AccountAvatarResolver`、`createAccountAvatarResolver(ports)`、`StoredAccountAvatar`、`PhigrosAccountHydration`；`src/services/resolve-account-avatar.ts`：`resolveAccountAvatarUrl`、`syncAllAccountAvatars`、`hydratePhigrosAccount`；`src/services/phigros-avatar-resolver.ts`：`PhigrosAvatarResourcePort`、`PhigrosAvatarResolver`、`createPhigrosAvatarResolver(port)`、`createPhigrosAvatarResourcePort()`、`normalizePhigrosAvatarKey`、`resolvePhigrosAvatarFileName`、`resolvePhigrosAvatarUrl`、`loadPhigrosAvatarCatalog` | 端口只声明解析真正需要的读取（快照、协议读取、TUF 缓存、落盘与前台信号；Phigros 侧是别名表与当前发布），组合入口注入真实实现；调用方使用 `resolve-account-avatar.ts` 的默认装配导出，游戏与页面不得各自访问发布单例。纯映射函数（`normalizePhigrosAvatarKey`、`resolvePhigrosAvatarFileName`）可直接单测 | `account-avatar.test.ts`、`account-avatar-ports.test.ts`、`resolve-account-avatar.test.ts`、`phigros-avatar-resolver.test.ts` |
| 示例满成绩 | `src/providers/maxed-records.ts` 的 `buildMaxedScoreRecords` | 由游戏测试 Provider 提供真实目录和映射函数，不复制通用生成循环 | `maxed-*-test-provider.test.ts` |
| Repository | `src/repositories/{catalog,resource,snapshot,user-library}-repository.ts` | Service 依赖接口；SQLite 实现留在 `storage/`，页面不直接写数据库 | Repository、存储迁移和用户曲库测试 |
| 缓存优先 | `src/services/cache-first.ts`：`cacheFirstLoad`、`cacheFirstLoadWithBackground`、`CacheFirstLoad`、`CacheFirstLoadOptions`、`CacheFirstRefreshResult`、`staleCached`、`isCacheFallback` | 统一“本地首屏、后台刷新、失败保留旧数据”；调用方提供读写和游戏语义。`cacheFirstLoadWithBackground` 返回 `{ value, background }`：`value` 供首屏渲染，`background` 是永不 reject 的后台刷新终态句柄（`RefreshResult<T, 'data'>`），调用方不必再猜一个 Promise 返回时完成了多少。命中本地缓存时后台刷新的结果分流：取回新数据进必填的 `onFresh`，服务声明为缓存/兜底（可选 `isFallback`，缺省用 `isCacheFallback`）的结果进 `onFallback(fallback, failure)`，缓存命中与兜底都不会被当成刷新成功；后台刷新抛错进 `onRefreshFailed(failure)`，取消后三者都不发布。没有本地缓存时直接返回刷新结果，不经过这两个回调；冷启动失败直接抛出。`markStale` 决定缓存命中返回值的过期标记。取消分两层：消费者自己的 `signal` 中止只取消本次调用（终态为 `cancelled`，其它共享消费者照常拿到数据），最后一个消费者离开或缓存清理提升代次才取消共享底层任务 | `cache-first.test.ts`、各游戏缓存测试 |
| 快照公共工具 | `src/services/snapshot-cache-utils.ts`：`makeSnapshot`、`snapshotSource`、`createInflightGuard`、`clearResourcesByPrefix` | 统一快照来源、并发去重和资源前缀清理 | 各游戏缓存测试 |
| 曲库与别名 | `src/services/aliased-catalog-query.ts`：`AliasedCatalogOptions`、`loadAliasedCatalog`、`aliasedCatalogSource`；`src/hooks/use-aliased-catalog.ts`：`useAliasedCatalog` | 游戏提供目录、别名查询和合并函数；服务负责加载、合并与来源，Hook 订阅规范查询选项；可选 `retry` 允许已自行恢复的服务关闭外层重试 | 曲库与搜索测试 |
| 游戏数据实体 | `src/services/game-data-query.ts`：`GAME_DATA_QUERY_VERSION`、`gameDataQueryKey`、`GameDataQueryParams`、`GAME_DATA_QUERY_OPTIONS`、`GameDataQueryPort`；`services/tuf-query.ts`、`muse-dash-query.ts`、`phira-query.ts` 的玩家实体键与查询选项 | 账号、游戏、Provider、会话模式组成规范键。实体保存完整 snapshot，原提供方、抓取时间和过期标记跟随同一版本；总览与页面读取同一已提交值。非 React 查询选项显式接收 QueryClient，Hook 只负责订阅 | `game-data-refresh-contract.test.ts`、`game-data-entity-version.test.tsx`、`game-data-loader-registry.test.tsx` |
| 查询适配层 | `src/services/game-data-query.ts`：`readGameDataBundle`、`publishGameDataBundle`、`publishEntityValue`、`invalidateEntityValue`、`registerGameDataBackground`、`awaitGameDataBackground`、`resetGameDataBackground`、`gameDataBackground`、`gameDataBundleStale`、`refreshGameDataBundle`、`GameDataRefreshInput`、`GameDataRefreshResult`、`GameDataRefreshTarget` | `GameDataQueryPort` 声明读取、写入、失效和可选 QueryCache 观察能力。后台发布等待真实首屏查询结束，避免新值被旧首屏覆盖；移除查询时不再发布。后台终态保留到下一次查询替换或 QueryCache 移除。主动刷新等 refetch 与后台终态，再按「后台落定值 → 已提交版本 → refetch 返回值」取值；保留 `data` / `catalog` / `player` / `scores` / `bests` 的完成项和机器失败码。服务与加载器不导入应用单例，UI 只读返回结果 | `game-data-refresh-contract.test.ts`、`cache-first-background.test.ts`、`game-data-entity-version.test.tsx`、`overview-rizline-sync.test.tsx` |

曲库查询的非 React 入口位于 `services/aliased-catalog-query.ts`（`AliasedCatalogOptions`、`loadAliasedCatalog`、`aliasedCatalogSource`）与 `services/maimai-catalog-query.ts`、`chunithm-catalog-query.ts`、`phigros-catalog-query.ts`、`rizline-catalog-query.ts`。`ensure*Catalog(client, …)` / `refresh*Catalog(client, …)` 显式接收 QueryClient；`useAliasedCatalog` 与游戏 Hook 只订阅规范选项。加载器由 `gameDataCatalogQueries(client)` 读取这些入口，不调用 Hook。

`loadAliasedCatalog` 并行发起目录和别名读取，保留别名失败时目录可用的语义；`cache-first.test.ts` 覆盖并发和可选失败。`useGameData`、`useAliasedCatalog`、`useUserLibrary` 根据 `useCachedTabActive()` 暂停隐藏页的查询通知，回到活动状态直接读取最新 Query 缓存；`enabled=false` 的根部观察者仍正常订阅，见 `account-metadata-observers.test.tsx`。

`utils/search.ts` 的 `buildSearchDocument(values: readonly string[]): SearchDocument` 捕获输入副本，首次读取 `text` / `compact` 时生成并缓存转写文本；`buildSongSearchIndex(songs)` 保留惰性属性，消费者不得通过展开或解构提前物化全文。Phigros 成绩页将标题与搜索文档分开保存，初次浏览只读取标题。`searchDocumentMatches(document, keyword)` 与 `searchSongs(index, filters, chartPredicate?)` 复用最近一个关键词的变体，空词不读取索引文本。`advanced-search.test.ts` 覆盖转写次数、输入隔离和搜索语义；`phigros-records-page.test.tsx` 验证页面初次浏览不转写，输入罗马音后仍能匹配假名别名。

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
`services/phigros-catalog-query.ts` 的 `refreshPhigrosCatalog(queryClient)` 统一主动更新入口，
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
  不进入 `RizlineSession` 或内存会话；短信登录不写也不清已有密码。writeRizlinePassword/deleteRizlinePassword 按稳定引用共用串行与删除代次，可选 { signal, assertCurrent } 在提交前后守卫，解绑后的迟到写入不能遗留密码。有效绑定之后缓存或密码保存失败保留账号并给出恢复提示。
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
- `loadRizlineCached`、`loadRizlineFresh`、`loadRizlineWithFallback`
  复用 SQLite 资源仓库、`snapshotSource`、`createInflightGuard.share`、账号/游戏写入代次及
  `cacheFirstLoad`。`loadRizlineFresh` 从 `useSession` 取最新会话；认证失败时若 Session 中 token
  已变更则重试，否则解密本地密码换票一次，同一 inflight 内只换一次。仅明确认证失败删除密码；网络、取消或本地提交失败保留密码。
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
  推定分组。`services/rizline-catalog-query.ts` 的 `applyRizlineCatalog(client, data, assertCurrent?)` 等待首屏提交后发布曲库并重建现有数据包派生字段，不额外请求官方存档。
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
| 会话 Provider 解析 | `src/state/session-provider-resolver.ts`：`SessionCredentialRef`、`SessionProfiles`、`ResolvedSessionProviders`、`providerResolverCacheKey(account, credentials)`、`resolveSessionProviders(account, credentials, onLxnsTokenRotation?, onOsuTokenRotation?)`、`releaseResolvedProviders(accountIds)`、`providerResolverStats()`；`src/state/session-runtime.ts`：`SessionRuntime`、`SessionRuntimeRequest`、`sessionRuntime()`、`setLxnsTokenRotation(rotation)`、`setOsuTokenRotation(rotation)` | Provider 实例按「账号 + 凭据版本」缓存，持有会话等运行态的实例不会在每次 render 重建。失效条件只有三种：`release`（解绑、清空会话）、凭据版本变化、账号身份或展示名变化（展示名进本地 Provider 的玩家名；分数展示、头像等元数据字段不进键）。缓存键由账号 id、游戏、Provider、展示名、凭据 id 与会话内容指纹组成，指纹与字段顺序无关。Store 只经 `sessionRuntime()` 声明「需要 Provider」并按账号 `release`；`services/session-providers.ts` 的 `createSessionProviders(account, session, onLxnsTokenRotation, onOsuTokenRotation?)` 只保留游戏差异（Provider 组合与构造参数），不反向读取 Store | `session-provider-resolver.test.ts`、`session-providers.test.ts`、`session-store-ownership.test.ts` |
| 凭据提交 | `src/services/session-credential-coordinator.ts`：`SessionCredentialCoordinator`、`SessionCredentialState`、`SessionStoreApi`、`OAuthRotationCommitResult` | 轮换资格判定、SecureStore 落盘、内存发布与有界补写的唯一入口。按请求开始时消费掉的凭据世代解析应更新的凭据（落雪与 osu! 各有一条前代关系），只更新仍关联该凭据的账号；落盘经安全存储端口，内存发布只改会话并释放受影响账号的 Provider 缓存，已解绑账号的会话不写回。提交返回 `applied` / `pending-persist` / `stale` / `removed`：发起账号被解绑但共享凭据仍被引用时继续提交，新授权不会被迟到结果覆盖；落盘失败保留内存新会话并按 5/30/120 秒有界退避最多自动补写 3 次。协调器不 import Store 模块，由 Store 侧兼容入口按需装配并注入 `getState` / `setState` / `refreshActiveSessionView` | `session-store-ownership.test.ts`、`session-store.test.ts`、OAuth 与 Rizline 轮换测试 |
| QueryClient | `src/state/query-client.ts`：`queryClient`、`releaseInactiveQueries` | 全应用唯一实例；只有内存警告清理非活动 Query | 生命周期与缓存测试 |
| 生命周期 | `src/state/app-lifecycle-core.ts`、`app-lifecycle.tsx`：`AppLifecycleProvider`、`useAppLifecycle`、`getForegroundAbortSignal`、`waitForForeground`、`ensureForegroundWork` | 短暂 inactive 不 abort、不换代；后台 abort 前台工作。进入 `foreground-ready` 时，来自后台则换代并 `beginForegroundWork`；若经 inactive 回来且 controller 已空则 `ensureForegroundWork` 重建可取消信号。异步任务传递 AbortSignal | `app-lifecycle.test.tsx`、下载生命周期测试 |
| 查询前台恢复 | `src/state/query-client.ts`：`resumeInterruptedActiveQueries(client): Promise<void>`；`hooks/use-app-runtime.ts` 装配 | 后台取消结算后，只恢复 active、enabled、pending/idle 且尚无数据的首查。已有缓存、错误、禁用、闲置和正在读取的查询不重新请求；`cancelRefetch: false` 不取消更晚的读取。旧前台回调在再次后台或卸载后失效 | `query-client.test.ts`、`app-runtime.test.tsx` |
| 普通筛选 Store | `src/state/create-filter-store.ts` 的 `createFilterStore` | defaults 生成 setter；`clearKeys` 决定清空范围，游戏保留筛选字段语义 | 各游戏 filter 测试 |
| 持久化随机筛选 | `src/state/create-random-charts-filter-store.ts` 的 `createPersistedRandomChartsFilterStore` | 统一水合、脏写保护和串行保存；游戏提供偏好 Store 与默认值 | 随机歌曲测试 |
| KV 原生执行 | `src/storage/key-value-storage.ts`：默认存储、`KeyValueStorage`、`createSerializedKeyValueStorage(storage)` | 默认账号、偏好、安全索引、缓存与播放器设置共用该入口。按底层实例串行完整 `getItem` / `setItem` / `removeItem` / `getAllKeys`，等待原生语句释放后再开始下一项；一次失败不阻塞后续操作。相同实例返回相同包装，独立实例互不阻塞。保留原键和 schema；不把它当作跨操作业务事务。生产消费者禁止直接访问原始 KV；临时原生探针只直接构造实例，再经同一包装执行 | `key-value-storage.test.ts`、`native-storage-probe.test.ts`、账号和偏好合同测试 |
| 多账号列表 | `src/storage/create-account-list-store.ts` 的 `createAccountListStore({ storeKey, parse, keyOf, normalize? })`；读取合同在 `src/storage/create-demo-account-store.ts` 的 `loadAccountDirectory` | 键不存在返回空目录。读取失败或 JSON 损坏保留原键并抛错，损坏内容另存 `.corrupt`。未知版本或顶层结构错误另存 `.unrecognized` 并抛 `AccountDirectoryUnrecognizedError`，upsert、remove 和示例账号改写都不会覆盖原键。`upsert` / `remove` 经按键 mutation gate（按 KV store 与键串行，前一个失败也继续排下一个）；`load()` 不进入该业务 gate，底层读取仍进入公共 KV 执行队列。`restoreAccountDirectory` 只有重新解析通过才写回。v1 数组里的坏条目仍跳过。可选账号恢复按来源收集，单个来源失败不丢弃其他来源，也不在读失败时迁移默认本地玩家 | 各账号 Store 测试、`account-list-store-mutations.test.ts`、`account-restoration.test.ts` |
| 偏好设置 | `src/storage/create-preferences-store.ts` 的 `createPreferencesStore`；`src/services/preferences-write-coordinator.ts` 的 `createPreferencesWriteCoordinator` | 工厂支持全局单键、按账号/游戏 scope 与 `onMissing` 迁移；`readFailure: 'throw'` 让严格消费者区分读取失败和缺失。协调器独占完整基线、脏字段、代次和串行写入，失败保留选择并自动补写，不覆盖无法读取或识别的原数据 | 偏好及迁移测试、`preferences-write-coordinator.test.ts` |
| 示例账号 | `src/storage/create-demo-account-store.ts` 的 `createDemoAccountStore` | 单个可删除示例档案的公共持久化工厂 | 示例账号 Store 测试 |
| SQLite 与存储统计 | `src/storage/rranker-database.ts`、SQLite Repository、`src/features/storage-management/game-storage-adapters.ts` | 每个数据库独立连接；业务 Schema、快照及个人曲库写入共用 `runDatabaseWrite`，日志 Schema 经 `runSerializedSchemaInit(task, 'runtime-log')` 独立串行。成绩、曲库和资源快照版本不一致或 JSON 损坏时保留原行并返回空，不删除用户数据。个人曲库旧 schema 升级不清空条目。统计和清理均经同一游戏适配器 | `database-queues.test.ts`、`storage-management.test.ts`、`sqlite-snapshot-repository.test.ts`、`sqlite-user-library-repository.test.ts` |

`state/debug-store.ts` 的 `useDebugStore` 提供 `testAccountsEnabled`、`hydrated`、`saving`、
`hydrate(): Promise<void>` 和 `setTestAccountsEnabled(enabled): Promise<void>`。
偏好复用 `storage/debug-preferences-store.ts` 的公共偏好工厂，缺失或无效数据默认关闭；
初始化合并，修改串行保存，成功才发布状态，失败可重试。
`domain/game-bind-options.ts` 的 `canBindProvider(provider, testAccountsEnabled)` 按 fixture 能力筛选添加入口，
`GamePickerSheet.testAccountsEnabled` 默认 false，仅作用于 bind 模式；数量提示与实际添加复用同一判断。
已有账号恢复、Provider 查询和上传目标始终使用完整注册信息，不受该偏好影响。

`services/session-providers.ts` 的 `createSessionProviders(account, session, onLxnsTokenRotation, onOsuTokenRotation?)`
只装配运行时 Provider，不读取 Store；`useSession` 保持唯一会话状态、动作与令牌轮换入口，
Provider 实例的解析与释放分别经 `sessionRuntime().resolve` / `sessionRuntime().release`。
落雪和 osu! Provider 的轮换回调由 `SessionCredentialCoordinator` 装配并经
`setLxnsTokenRotation` / `setOsuTokenRotation` 注入。`resolveSessionProviders` 接受同一组回调，
解析器不自行判定世代。`SessionProviders.catalogProvider` 是可空的详细曲库能力，
没有能力时查询禁用，主动读取经 `requireDetailedCatalogProvider` 拒绝，不返回伪造空曲库。
`protocolScoreProvider` 保留真实中二/osu! 协议合同，加载器消费解析器缓存实例，避免另建刷新状态。
`rotateOsuTokens` 的近期轮换和祖先关系共用 64 项上限；解除最后一个 osu! 账号或 `clearSession` 时清空。窗口外的旧刷新令牌不能覆盖当前会话。
预取消阻止新请求和新轮换；已经完成的轮换始终交给协调器判断资格，页面过期只过滤进度、通知和展示动作。osu! 回调使用 `useAccountBindingRequest` 的取消、重复操作和当前请求守卫，失焦或卸载使旧页面动作失效；提交完成后保留已保存账号。
`services/account-restoration.ts` 的 `restoreAppAccounts()` / `loadOptionalBoundAccounts()`
统一安全会话、可选档案及默认本地玩家迁移。`getAccountSourceStatuses()` /
`subscribeAccountSourceStatuses()` 发布来源级 loading、ready、failed；读取失败保留已加载数据。
`domain/bound-account.ts` 的 `boundAccountFromStored(account)` 恢复 Phigros 账号时保留持久化的
`account.id`，昵称只更新 `displayName`；会话映射继续按同一 ID 关联凭据。
`session-store.test.ts` 覆盖昵称与玩家 ID 不同的恢复。
`retryFailedAccountSources()` 只重读失败来源，并复核等待前后的账号对象身份；被删除、
改名或重绑的账号不接受旧读取结果。恢复页和前台生命周期复用该入口，订阅回调失败不影响其它来源。
`useAppStartup` 处理启动准备，`useAppRuntime` 处理路由、前后台、内存警告和延后维护。
界面 Provider/导航仍在根布局装配。

`UploadPrefsStore` 读取缺失时才返回默认值，损坏结构抛 `UploadPrefsCorruptError`，存储 I/O 错误原样传播；迁移清理只删除已成功解析的旧键。`ScoreHubAccountStore` 的普通认证读取严格校验全部被引用令牌，显式删除或清空则先提交有效索引，再独立清理密钥，不要求先读取损坏的令牌。

`repositories/resource-repository.ts` 将普通读写、原子更新和维护能力分为 `ResourceRepository`、`AtomicResourceRepository`、`ResourceMaintenanceRepository`，消费者按实际使用的能力注入。`parseCachedSnapshot` / `cacheSourceSchema` 复用来源校验；TUF、Muse Dash、Phira 在各自缓存模块复用领域 Schema 验证内容，损坏行返回空但保留原文，I/O 失败继续传播。Phira 原子合并重新校验旧 best 快照，错误身份和损坏项不能混入新结果。
`domain/schemas.ts` 的 `DataSourceSchema`、`PlayerSchema`、`ScoreRecordSchema`、`CatalogSnapshotSchema` 与 `ScoreSnapshotSchema` 校验归一化快照。数据来源集合来自 `DATA_SOURCE_KINDS`；SQLite 成绩、曲库和 Phigros 存档缓存共用这些 Schema，Phigros 自己校验进度、Best 分区及存档元数据，保留可选展示字段与兼容扩展。

ScoreHub 的响应校验集中在 `score-hub-types.ts`：同步成绩、账号资料、机台任务进度及服务统计均先通过 Schema。缺失的旧版可选字段仍归一化为空值；显式错误类型、负数或非整数计数不能被伪装为默认状态。调用方继续通过 `score-hub-client.ts` 与 `parseCabinetScoreJob` 消费规范结果。

`state/theme-store.ts` 的 setter 立即应用主题、曲绘和透明度选择，不回弹、不显示额外提示。
主题存储复用严格偏好工厂，唯一写入协调器合并全部字段，读到的基线不能覆盖已选择字段。
读取或保存失败按 0.5/2/10/30 秒退避，之后每 30 秒自动重试；后台暂停新任务，前台补写。
水合最多等待 1.5 秒，不另起第二个读取；未知版本或坏结构保留原文，未取得基线不得写入默认值。
失败只记录受限诊断，成功恢复记一次事件；`preferences-write-coordinator.test.ts` 覆盖竞争和重试。

`storage/secure-session-store.ts` 是安全会话唯一业务门面；`secure-session-codec.ts` 负责解析、字段校验和指纹，`secure-session-index.ts` 负责索引、保留副本与跨实例串行队列，`secure-session-commit.ts` 负责新凭据校验、索引提交、回滚和附属清理。门面保留原导出，恢复保留副本也进入同一队列，不能越过清除或账号修改。空凭据、非有限到期时间、重复账号或凭据身份不能作为有效会话恢复；指纹包含显示用的 rating possession。
会话索引缺失时走旧版迁移；JSON 损坏抛
`SessionIndexCorruptError` 并保留 `.corrupt` 副本，未知版本、顶层结构或账号/凭据行错误抛
`SessionIndexUnrecognizedError` 并保留 `.unrecognized` 副本，原键不动，后续写入不得
覆盖。账号引用的凭据不可读或不能解析时整个恢复失败，不静默丢弃关联账号；无账号引用的凭据不参与恢复。账号恢复入口记录脱敏的凭据读取错误。`LargeSecureValueStore.write` 校验新分片与清单读回，失败时恢复旧清单并清理新分片；账号仓库也在读回一致后才提交账号索引。旧版迁移源顶层损坏时保留并报错；混合损坏项保留安全原文，有效项迁移并在 v4 索引记录不含敏感内容的 recovery 计数，后续只读取有效索引。`readPreservedSessionIndex` 读取保留副本，
`restorePreservedSessionIndex` 只在副本可解析且当前索引不可用时写回。`loadVault()` 的读取和迁移与变更共用仓库串行队列。
`clear(): Promise<RemoveAccountResult>` 先提交 v4 合法空索引，再分别清理凭据、密码、保留副本和旧来源；
提交失败保留原账号，提交后的失败只汇总 `cleanupFailures`，空索引阻止旧来源再次迁移。
迁移失败的内部清理仍保留旧来源重试能力。保存失败或取消回滚失败时先读回实际索引，
仅删除可确认未被引用的新凭据；无法确认提交状态时保留凭据并记录失败阶段。
账号管理页在恢复失败时提供重试恢复与清除登录数据（二次确认）入口。
`domain/session-vault.ts` 保存纯会话类型、映射和 `SessionPersistenceError`，Store 不通过存储模块
引入原生依赖。真实凭据 I/O 失败标记 `credential_storage`，索引 I/O 或内容失败标记
`local_commit`；公共错误入口显示固定文案，取消原因不改写。`SecureSessionStore.updateAccountSession`
明确返回 `applied` / `stale` / `missing`，协调器只发布仍有效且实际应用的 Rizline/Majdata 更新。
合同由 `secure-session-store.test.ts`、`session-restore-recovery.test.tsx` 覆盖。

`SecureSessionStore.upsertAccounts(accounts, { activeAccountId, signal?, assertCurrent? }): Promise<void>`
在同一仓库队列内读取、合并全部账号与凭据，再提交一次索引；同一凭据只保存一份。
`upsertAccount(account, signal?)` 复用同一合并核心。守卫覆盖排队后、凭据写入及读回、
索引写入前后；索引写入及后置守卫通过即完成提交，此前取消回滚，此后清理期间取消保留提交。
`services/osu-account-binding.ts` 的 `bindOsuModes(input)` 先验证全部模式，再取 Provider 最终会话
统一保存，首个所选模式同时成为磁盘与内存的活动账号。`setOsuBinding` 用 `upsertAccountList`
替换所选账号元数据，按 `sessionsForCredentialUpdate` 向仍引用同一凭据的全部账号广播，
释放相关 Provider 后一次发布活动视图；旧世代轮换仍由现有协调器拒绝。

`services/lxns-account-binding.ts` 的 `bindLxnsAccount({ gameId, session, credentialId?, signal?, assertCurrent? })`
复用上述提交入口，守卫贯穿验证、快照和凭据保存；舞萌的 `getOptionalPlayer(signal?)` /
`getOptionalRecords(signal?)` 继续通过同一 OAuth 请求核心传递取消。
回调页复用 `useFocusEffect`，失焦或卸载取消同一请求；`LxnsLoginPanel` 隐藏或卸载时取消。
两入口在激活、临时账号清理和通知前复核请求；提交后的退出保留绑定，
停止后续页面动作。合同由 `lxns-account-binding.test.ts`、`lxns-oauth-callback.test.tsx`、
`provider-login-reuse.test.tsx`、`osu-account-binding.test.ts`、`session-store.test.ts` 和安全仓库测试覆盖。

`services/switch-bound-account.ts` 的 `switchBoundAccount(accountId, { navigateToOverview? }?): Promise<boolean>`
立即发布有效选择，每次选择（含再次选择当前账号）都尝试保存活动账号；返回 true 仅表示保存成功且
仍属于当前选择请求。调用方经 `notifyAccountSwitchError(error, showNotification)` 显示
“当前已切换，账号选择未保存，请重新选择”，共享操作代次使迟到错误不再提示。
公共玩家绑定与示例账号入口独立处理绑定成功后的选择保存失败，不把已完成绑定报告成失败。

`storage/score-hub-account-store.ts` 是上传账号的独立 v3 凭据索引，保留 v1/v2 迁移与现有稳定身份。
其读取迁移与全部变更经 `enqueueKeyMutation<T>(storage, key, operation): Promise<T>` 跨实例串行，
队列内部仅调用未加锁方法，一次失败不阻塞后续任务。索引不可解析抛 `local_commit`；
索引引用的令牌读空或异常抛 `credential_storage`，不发布部分列表，也不改写或删除原条目。
`useUploadAccountPreferences` 保留最后一次完整列表，经现有通知显示公共错误文案与重试入口；
上传服务原样传播持久化错误，网络兜底不能吞掉它。合同由 `secure-storage-migrations.test.ts`、
`upload-data-sheet.test.tsx` 与 `multi-target-upload.test.ts` 覆盖。

`storage-adapter-core.ts` 的 `createGameStorageAdapter(definition)` 接收 `StorageOwnership`，
`selectStorageInventory(inventory, ownership)` 为统计和清理提供同一账号/资源选择结果。
`GAME_STORAGE_ADAPTERS` 保留游戏组合；`shared-storage-cache.ts` 独立维护共享文件缓存边界。
既有统计、清理与类型导出继续从适配器模块提供，SQL 批量删除、诊断正文和字体保护规则不变。
`storage-adapter-core.test.ts` 覆盖无成绩行资源、测量/删除一致性、代次与 SQL 失败边界。

### 账号同步与缓存写入

- `domain/game-data.ts` 的 `gameAccountMetadata(bundle)` 只构造纯展示载荷；
  `useSyncAccountMetadata()` 在根布局 QueryClientProvider 内的独立 `AccountMetadataObserver` 中挂载一次，与主题和导航树并列，订阅
  `useGameData(false)` 并调用现有账号、缩略信息、头像和安全仓库入口。页面使用
  `useGameData` 读取数据，元数据持久化只由根部订阅执行。
- `updateBoundAccountScore` 与 `SecureSessionStore.updateAccountMetadata` 对现有字段
  等值时保持对象/存储不变；继续保留 undefined 和 null 的既有含义。
  `persistBoundAccountThumbnail(accountId, input, repo?)` 按仓库、账号和缓存代次合并
  待写字段，写入成功后才更新已保存值；失败保留可重试载荷，闲置条目有 128 项上限。
  `hydrateAccountDisplayData(signal?)` 让根布局与账号列表共享同一前台代次、账号集合
  和缓存代次的缩略信息及本地 Rating 读取；读取完成后检查账号是否仍有效。
- Phigros 推分查询 key 为 `phigros-push-rks`、账号 ID、玩家 ID、资源修订和存档更新时间。
  它属于账号数据失效集合；切换账号不会复用另一账号的新鲜结果。
  `findPushRecommendations` 是异步搜索：返回 `searchStatus`、已取整并重新核算的 `plan`，以及可替换 plan 中 Acc 差值最大一首的 `alternatives`。`recommendations` 与 `plan` 相同。`combinationReachesTarget` 只在 `verified` 时为真。预算按谱面计：`options.chartCost` 与结果里的 `chartCost` 表示愿意投入的谱面数，同一首歌的不同难度各占一张；`perChartShare` 是总 RKS 增益的平均份额。方案按组合总增益判定达标，不要求每张谱面单独达到平均份额。排除 φ 时最高 Acc 为 99.99。搜索预算内未找到方案是 `not_found`，只有全部谱面或 `chartCost` 谱面数内的独立增益上界不够时才是 `unreachable`。长搜索按 16 毫秒时间片让出主线程；`signal` 取消时在让出点抛出来源 reason，不返回半份方案。页面只对 `plan` 作达标保证。
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
  自动重试耗尽后保留待写任务，前台和显式调用可继续补写；只有已应用、世代过期或无人引用才移除。
  在途旧任务不能删除后来登记的新任务，成功更新与活动 Provider 在同一次状态提交中可见。
  `pendingRotationWritesSnapshot()` 与运行时诊断保持可观察，进程退出前仍未保存成功则需要重新授权。
  `LxnsOAuthRequestCore.request` 在 token 刷新返回后重新检查取消：轮换结果仍可为其它共享账号提交，
  已取消的调用不发出后续业务读取。
- 上传目标在共同写入入口逐个复核资格：`uploadLatestScoreHubSyncToTargets` 与
  `transferMaimaiFromLxns` 在每个目标写入前调用 `captureAccountWrites` 断言，
  `uploadRecordsToLxns` / `uploadRecordsToDivingFish` 的 `assertEligible` 在发送前再复核；
  失效目标不再向上游写入，其他目标独立完成，已写入的远端结果不回滚。
  写入经公共 `requestProviderWrite` 单次发送并返回 `success` 或 `unconfirmed`，不确定结果禁止盲目重传。水鱼未确认时经现有 Provider 新鲜读取一次，`uploadedRecordsAreVisible(..., 'exact')` 按唯一谱面身份和可比较字段核验；重复身份、未知状态、缺项或核验失败保留未确认，确认写入数为零。`withUploadAbortSignal` 和 `waitForUploadDelay` 统一恢复等待、监听取消和清理，轮询、目标传输与刷新复用它们。`assertUploadActive(signal)` 共用 `aborted` 检查，有取消 reason 时原样抛出，缺失时使用既有取消错误；不依赖 React Native 未实现的 `throwIfAborted()`。ScoreHub、落雪与水鱼的读取、写入和等待合同同时使用 Node 与 React Native 的 AbortController 验证，取消仍阻止后续写入和只读核验。
- `clearStorageByCategories` 先提升所属游戏代次，再取消并移除查询，然后执行适配器清理。
  同类资源与图片清理通过 `Promise.allSettled` 等待全部终态后汇总失败并测量回收量；原生图片清理返回 false 或抛错均报告失败，部分成功仍保留实际结果。
  `cancelBoundAccountQueries(account, client)` 在解绑删除前使单个账号失效，取消并移除
  其查询，保留其他账号和公共曲库。解绑与全游戏清缓存不得混用失效范围。
- `createInflightGuard.share(key, loader, signal?)` 为每个消费者单独管理取消；最后一个
  消费者离开才取消底层任务。新请求键包含相应游戏/账号代次，清理前的任务不能被新调用复用。
  Rizline、Muse Dash、TUF、osu、Majdata 和图片/字体资源均沿用这个公共入口。
- `loadItemsBounded({ items, concurrency, load, signal?, failureMode? })` 默认 `collect`
  隔离单项失败；`throw` 模式首错停止领取，等待所有在途任务结束后再抛错。
  公共暂存执行器使用后者，信号继续传入下载、读取及 writer；失败统一清理 session。
  同一远程文件共享下载，每次写入使用独立临时文件，检查长度和代次后替换目标。
- `hooks/use-bounded-queries.ts` 的 `useBoundedQueries(options, concurrency, enabled?, retryFailedOnMount?)`
  只为已领取项创建 Observer，保留逐项查询键和共享缓存；加载、失败重试与自动重取经过
  `createBoundedLoadQueue(concurrency)` 的同一有界队列，取消后停止领取新项。Muse Dash 明细限制 6 路，
  未启用相关筛选时不创建明细查询；Majdata 收藏详情与 osu! 详情成绩限制 4 路。
  Majdata 的 `majdata-service` 在 `createInflightGuard.share` 内将实际歌曲请求及谱面修订核验统一限为 4 路，缓存首屏不占网络槽位，后台刷新仍受限。领取前复核消费者取消、前台信号和资源代次；清理、后台或最后一个消费者取消时停止新任务。
  游戏页查询以 `notifyOnChangeProps: []` 暂停隐藏页通知，恢复可见后读取最新缓存；根部独立订阅继续工作。
- `runDatabaseWrite(task)` 串行化同一业务连接的写入、事务与 schema 初始化。调用者先
  完成 Repository 初始化，task 内不得嵌套进入队列。批量资源/账号删除按 500 个参数分批，
  一次清理使用同连接事务；失败不阻塞后续任务，也不回滚其他仓库的写入。
  文本体积用 `LENGTH(CAST(field AS BLOB))` 统计 UTF-8 字节；数据库实际分配页仍独立报告。
- `SqliteSnapshotRepository.updateResource(key, schemaVersion, transform, assertCurrent?)` 把读取、
  转换、代次断言与写入放进同一个写入队列任务，队列内只用直接数据库调用（不重入队列）；
  同一资源的并发合并按提交顺序串行。`PhiraCache.mergeBests` 与 `osuCache.mergeKnownScores` 用它从最新版本提交合并，后者按谱面保留更高分，
  transform 可显式返回 `{ value, write: false }`，仍在队列内复核代次但不写入。
  osu! 空集合、重复或更低的成绩种子保留已有快照及 `updatedAt`；同分但元数据变化仍提交。
  合同由 `sqlite-storage-integration.test.ts`
  与 `sqlite-snapshot-repository.test.ts` 覆盖。

验证入口包括 `account-metadata-observers.test.tsx`、`account-thumbnail.test.ts`、
`secure-session-store.test.ts`、`async-resource-lifetime.test.ts`、
`sqlite-storage-integration.test.ts` 和各游戏缓存、解绑及生命周期合同。

### 诊断记录

- `services/runtime-diagnostics-recorder.ts` 的 `recordRuntimeDiagnostic(type, fields?)`
  返回 `Promise<void>`；先存入独立的 64 条脱敏应急环，再分发到手动和简要记录器，两者失败均不传播到业务。
  `snapshotEmergencyRuntimeDiagnostics()` 返回独立副本，不等待任何持久存储。
  `recordRuntimeError(source, error, fatal?, context?)` 统一错误采集，兼容原三参数调用。
  可选 `RuntimeErrorContext` 包含 phase、operationId、pageIndex 和受限 errorCode。
  同一入口的 `nextRuntimeOperationId()` 分配进程内编号；`createRuntimeOperation(source)`
  返回编号及 `record(phase, fields?, generation?)`，按内容代次、阶段、页序号和结果去重，
  输出操作累计耗时。底层调用方只依赖该轻量入口，不引入日志存储或页面依赖。
- `services/runtime-logs.ts` 提供 `initializeRuntimeLogs()`、`recordRuntimeRoute(segments)`、
  `shareRuntimeLog(id)` 和唯一 `runtimeLogs` 控制器。控制器公开 `start()`、`stop()`、
  `setCapacity(1000 | 2000 | 5000)`、`loadHistory()`、同步 `flush()`、`subscribe()`、`getSnapshot()` 与 `snapshot(id)`。
  页面订阅状态，不直接写数据库；容量和 `enabled` 偏好复用 `createPreferencesStore`。
  `start()`、`stop()`、`setCapacity()` 均返回 `Promise<void>`，串行保存用户选择。
  状态中的 `enabled` 表示持久开关，`activeId` 表示当前记录，保存失败不自动关闭开关。
  关闭开关时启动只读偏好，不初始化日志数据库；历史在进入诊断页或开启记录时惰性读取。
  `failurePhase` 区分 preferences、history、recording，历史重试不改变开关或当前记录。
- `domain/runtime-log.ts` 定义类型与脱敏：字段白名单、基于类别的错误摘要、最多 30 个
  堆栈位置和单条 8 KiB 上限；不读取任意异常的序列化结果。路由传入 `useSegments`
  返回的模板，HTTP 入口记录固定场景名，不传入地址、账号或请求载荷。
  模板允许数字固定路径；控制器为普通事件补充当时的路由。HTTP 三个公共请求入口接受
  可选 `diagnosticScenario?: RuntimeRequestScenario`，调用方按明确用途传入枚举值；
  开始与各尝试结果共享 operationId，错误码使用公共归一化结果，主动取消不带错误堆栈。
  查询/变更终态错误补充 `phase: final`，只提取白名单错误码，不读取 Query Key 或任意 cause 链。
  `runtimeBuildContext(nativeBuild, configuredBuild)` 区分构建号的原生、配置和未知来源。
  条目可选 `severity` 为 debug/info/warn/error/fatal，旧记录仍可读取和分享；阶段为 debug，
  成功和正常取消为 info，重试及回退为 warn，失败为 error，实际致命异常为 fatal。
  `createRuntimeOperation(source, { parentOperationId? })` 记录累计与相邻阶段耗时；HTTP 可选
  `diagnosticParentOperationId` 关联父操作。缓存优先组合器记录缓存命中、刷新、发布及终态；
  凭据补写沿同一 operationId 记录原因、尝试次数和结果，不记录凭据内容。
- `storage/rranker-database.ts` 的 `getRuntimeLogDatabase()` 管理独立日志连接与 Schema 队列；
  `RuntimeLogRepository` 统一事务创建、增量追加、容量裁剪、结束和恢复。成功创建第三份
  才淘汰最旧记录；每份独立保留最后 N 条。每次启动恢复开启偏好后创建新记录，
  包含当前记录在内保留两份；进程内重复初始化、页面切换及前后台切换不另建记录。
  控制器只在追加成功后更新内存条数和时间，不对每条事件调用 list；状态转换重新读取。
  `appendBatch(id, entries)` 一次同步事务内分配有序序号、插入并裁剪；控制器普通事件按
  32 条或 100 ms 合批，仅一次发布。致命异常、停止、快照分享和后台立即同步 flush。
  批次失败整体回滚并隔离，不计入已保存数量。开关默认关闭，开启后直接记录详细事件。
  `initializeRuntimeLogs` 单次订阅 `subscribeAppLifecycleSnapshot(listener)`，在原生 AppState handler 发布后台状态时记录边界并同步 flush，React effect 不重复记录；反复后台通知与内存警告只触发必要 flush。
  Repository 快照复用 sequence 输出 summary 的 totalCount、retainedCount、trimmedCount、
  firstAt、lastAt 和 byType；后两项时间及类型统计只覆盖保留事件。控制器补充 snapshotAt，
  不修改已有 formatVersion、记录结构或数据库表，旧记录继续分享。
- 日志正文不属于缓存；分享副本复用 `expo-sharing` 和现有 `rranker-` 临时缓存规则，
  手动日志分享结束后清理自身副本，清理失败独立记录且不覆盖分享结果。
  `runtime-diagnostics.ts` 的 `snapshotRuntimeDiagnostics(): Promise<RuntimeDiagnosticStore>`
  将读取排入既有串行队列，返回独立快照，保持最近三次启动/256 条事件的上限。尚未开始写入的连续事件合并为最多 256 条的有序批次，共用一次读写和完成 Promise；快照调用切断批次，后续事件在快照后写入。`runtime-diagnostics.test.tsx` 覆盖批量写入次数、快照顺序及失败恢复。
  简要诊断正文使用 `Paths.document/rranker-runtime-diagnostics.json`；有效正文优先，
  缺失或损坏时依次读取同目录 `.previous` 完整副本、缓存目录中的同名文件。
  写入先完成同目录 `.pending` 暂存，再保留有效正文并提升暂存文件；提升成功后回收
  `.previous` 与缓存副本，未提交的 `.pending` 不参与读取。文件读取、部分写入或替换
  失败保留恢复来源；重复初始化不新增会话，失败后可再次初始化。
  `cache-policy.ts` 的 `isLegacyRuntimeDiagnosticCacheEntry(name: string): boolean`
  精确识别待迁移正文，启动清理与共享缓存统计、手动清理均保留它；TXT 分享副本仍可清理。
  `measureManagedStorageBytes()` 的清理前后物理口径也排除该正文，迁移不计为释放空间。
  `snapshotRuntimeDiagnosticsForExport()` 立即固定应急环，持久快照读取限时 1.5 秒，
  读取失败或超时仍返回 `emergency` 和 `storageAvailable: false`。
  `shareRuntimeLog(id): Promise<void>` 先同步固定所选日志，再调用该公共快照入口；
  完成的单个 JSON 文本增加 `diagnostics` 字段，不改变日志事件、统计、formatVersion 或存储。
  `exportRuntimeDiagnostics(): Promise<void>` 复用同一入口，任何存储状态均可分享诊断信息。
  两种分享先写文件并使用 Expo Sharing，文件或分享失败回退 React Native 文本分享；
  两条路径均失败才抛错，各自操作期间防止重复分享，所选日志不会被诊断读取失败丢弃。
- 诊断页面继续通过 `useSyncExternalStore` 订阅唯一控制器，开关反映 enabled，
  运行状态结合 activeId、记录状态、ready、busy 与 failed，不从开启偏好推断正在记录。
  最新/上次标签沿 Repository 创建顺序；开关通过 `useAppTheme()` 复用个性化页的
  原生 Switch 轨道和滑块颜色，滚动区按压复用 `DetailGestureRoot` / `DetailPressable`。
  每份日志提供分享，“分享诊断信息”在加载、失败和空态始终可用；读取与保存失败使用不同状态文案，历史重试不启动记录。
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
同一模块的 `useAccountBindingRequest(visible, cancelOnBackground = true)` 为水鱼、osu! 和 Phigros 绑定提供 `begin(parentSignal?)` / `cancel()`，请求持有 `signal`、`isCurrent`、`assertCurrent` 和 `finish`；隐藏、取消或释放使旧请求永久失效。Phigros 使用 `cancelOnBackground = false` 保留授权轮询暂停与恢复，网络阶段另消费前台信号。`PasswordLoginPanel.disabled?` 可由父面板联动附属清理，提交仍在同步入口检查互斥状态。
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
`refreshGameDataBundle` 返回的终态：`success` / `noop` 判成功，`partial` 表示
部分请求已成功、部分分项未更新，按 `failures.target` 提示玩家资料、成绩、最佳成绩或曲库；
认证失败提示重新登录，其余终态按公共失败文案提示。不维护逐游戏 waiter，也不二次读取查询缓存推断
后台刷新是否落定。`UploadDataSheet` 的账号偏好、二维码输入和上传执行
分别复用 `useUploadAccountPreferences`、`useUploadQrInput`、`useUploadTaskState` / `useUploadExecution`，
任务真相在 `services/upload-task-controller.ts` 的唯一 `uploadTaskController`，公共业务门面 `upload-maimai-from-friend-code.ts` 保留再导出，类型集中在 `upload-maimai-types.ts`。`begin()` 返回发起任务信号，`isCurrent(signal)` 验证身份；`setPhase(phase, signal)`、`waitForCatalog(signal)`、`complete(result, signal)` 和 `finishCanceled(signal)` 只能影响所属任务。每次曲库请求独立持有 waiter，取消中止前台等待与曲库等待；旧结果、阶段、凭据回调、完成刷新和通知不能影响新任务。关闭/卸载弹层不取消任务。好友码偏好以独立选择代次保护，账号集合变化不丢失首次初始化，等价可写集合不触发重复状态更新。防抖保存须等待目标好友码的勾选读取完成，删除旧好友码的迟到回调不能重置新账号状态；`UploadPrefsStore` 的读取迁移、保存、移除和清空复用 `enqueueKeyMutation`，同一存储实例跨仓库实例串行，避免并发丢失其它好友码的选择。

总览评分适配由 `features/game-content/adapters/overview-presentation.ts` 的 `overviewRatingCard(bundle)` 返回 `DxRatingCard` 参数，玩家名与查分器提示同处组合边界。舞萌和中二的收藏模块分别为 `MaimaiOverviewPins`、`ChunithmOverviewPins`。舞萌详情容器为 `components/maimai/MaimaiSongDetail.tsx`，路由只解码与分派。
舞萌成绩图页面为 `screens/maimai/MaimaiBestImageScreen.tsx`，筛选分页与资源准备分别复用 `useMaimaiBestImageFilters`、`useMaimaiEmbeddedAssets`、`useMaimaiImageCovers`、`useMaimaiExportAssets`；公共 `useBestImageScreenController`、`usePreparedBestImageSources` 和 `BestImageScreenShell` 保持游戏无关。预览与导出 WebView 都关闭双向滚动指示器，避免原生截图包含滚动条。详细曲库参与 sourceGeneration，数据迟到但分页不变时仍生成预览。

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

Phigros 与 Phira 的定数、Acc、选择及评价筛选行复用 `MetricFilterRows`；Phigros Acc 范围解析位于 `domain/phigros-filters.ts`，不引用舞萌筛选。游戏包装负责章节、
Kyou 标签、评级主题和具体字段。Phira 使用自身 `PhiraFilterBar` / `PhiraScoreVisuals`，
评级与筛选由 `domain/phira-filters.ts` / `phira-score-presentation.ts` 按 Phira 原始成绩解释，颜色与标签复用中性的 `domain/score-grade-theme.ts`，不引用其它游戏主题或组件。
详情复用 `FloatingSongDetailChrome`（内部调用 `SongDetailChrome`）与
`SongDetailChromeStyles.ts` 的 `VERTICAL_SONG_DETAIL_STYLES`，不引用 Phigros 页面。
useUserLibrary 的收藏/练习动作复用公共 in-flight 入口合并重复操作，失败统一捕获并提示，隐藏、切游戏、后台或卸载后的迟到失败不更新提示；标签与预设仍将失败交回 TagEditor。预设选择超过 MAX_TAGS_PER_ITEM 时保留原选择并提示。歌曲行导航经 detailTargetHref 保留全部详情参数，游戏身份、osu! 模式与备份校验引用注册集合。

Muse Dash 筛选字段类型位于 `domain/muse-dash.ts`，State 与 UI 均从领域层导入。

列表可见性通过条目级 `useSyncExternalStore` 订阅，仅通知发生变化的图片持久化及内容活动 scope；
不替换列表 renderItem、extraData、宿主或窗口参数。`RemoteImage` 的缓存查找依赖
URL、请求头和 cacheKey 的稳定身份，等价 source 对象不会重置已显示状态。
`remote-image-cache` 保留既有压缩参数和预算；并发消费者独立取消，临时文件隔离，
读取 manifest 后再次检查代次才发布文件。`list-viewability-subscriptions.test.tsx` 与
`remote-image-cache.test.ts` / `remote-image.test.tsx` 覆盖通知次数、等价身份和迟到写入。

`CachedContentActivityScope({ active, children })` 在 `CachedTabScreen.tsx` 中复用活动 Context，取父级与本级的交集。共享列表行以可见性驱动该 scope，`useFlowingProgress` 和 `AutoScrollText` 在行离屏、标签失活或应用未就绪时停止动画。`hooks/use-reduced-motion.ts` 的 `useReducedMotion(): boolean` 通过 `useSyncExternalStore` 共享一个原生减少动态效果监听，最后一个消费者卸载时释放，迟到初始读取不能覆盖新事件。`tab-animation-lifecycle.test.tsx` 覆盖父子活动交集和多卡片订阅数量。`RemoteImage` 在在线图显示且具备持久化资格后，经 `InteractionManager.runAfterInteractions` 启动压缩落盘；资格撤销同时取消排队和消费者，不改变容量或图片回退策略。

`BestListPage` 内部的 `RemoteImageSectionList` 按对象身份识别分组标题与尾部，
保护列表级和分组级 `keyExtractor`，只将真实条目交给图片可见订阅与业务回调。
分组身份以弱引用保留，覆盖分组数组更新后的迟到回调；真实条目的提取器优先级、
默认键规则、渲染键和 50% / 250 ms 门槛不变。没有分组级提取器时保留传入的分组数组；
需要包装分组提取器时保留其数据与其它字段。`section-list-viewability.test.tsx`
通过真实 React Native 分组列表转换入口覆盖标题、尾部、条目及迟到分组事件。

## KALEIDXSCOPE 攻略与进度

`domain/kaleidx-scope.ts` 的 `KALEIDX_GATES` 保留六门钥匙语义，`KALEIDX_STAGES` /
`KALEIDX_STAGES_BY_ID` 提供完整阶段注册；`KaleidxStageId` 是进度与页面选择的共同身份。
`kaleidxStageChallenge(stage: KaleidxStage): KaleidxChallenge` 输出随机三曲、ERROR 剧情、
固定三曲或最终单曲的判别联合。前置关系、课题谱面类型及资料来源均由领域数据提供，页面不另列曲池。
`resolveKaleidxSchedulePhase(schedule, at?)` 对推算表返回 `null`，不会把参考日期当成已确认的当前条件；
`KaleidxSchedulePhase.dxLife` 的 `null` 表示后半段数值待确认，缺省表示普通单段 LIFE。

`createKaleidxScopeProgressStore(preferences?)` / `useKaleidxScopeProgress` 统一水合、串行修改及失败回滚。
`setGateCleared(accountId, stageId, value)` 与 `selectKaleidxGateProgress(state, accountId, stageId)`
覆盖全部阶段；六门完成仍关联本门钥匙，后续阶段不生成钥匙状态、不回填前置进度。
`KaleidxScopePreferencesStore` 继续复用 `createPreferencesStore`，同一 v1 键恢复旧记录并保存新增阶段。
页面使用 `useDetailedCatalog`、`SongCover`、`Card`、`AppNotification` 和公共详情编码入口；
明确指定谱面类型时，缺失该类型或歌曲均禁用跳转。游戏专属流程只位于活动领域、状态及路由中。

验证为 `kaleidx-scope.test.ts`、`kaleidx-scope-screen.test.tsx`、`detail-target.test.ts`、
`detail-target-navigation.test.tsx` 与 `consumer-copy-policy.test.ts`，覆盖资料结构、推算边界、
旧记录往返、账号隔离、独立补记、保存失败及课题详情定位。

## 共享功能族

| 功能族 | 公共入口 | 游戏侧职责 | 主要验证 |
|---|---|---|---|
| 谱面确认 | `src/features/chart-preview-shared/`：`ChartPreviewScreenShell`（可选 `fullscreenOrientation`，默认 `landscape`）、`chartPreviewNativeScreenOptions`、`ChartPreviewLoadProgress`、资源暂存、URI 解析、桥接（含 `progress`）、注入工厂、计划执行器、播放时钟与全屏锁。壳用一条进度条覆盖 native `prepare` 与播放器就绪，`ready` 后撤遮罩。`prepare(signal, settings, onProgress?)` 与 `prepareChartPreviewWebviewFromPlan(plan, signal?, onProgress?)` 按字节权重报告下载，writer/HTML 占落盘末段；`fileName` 支持相对路径，远程 `url+bytes` 有限并发，`bytes` 只作进度权重，可选 `remoteCacheDirectory` 已有非空文件则跳过下载。宿主命令与播放器事件的合同见 `chart-preview-bridge.ts`（`ChartPreviewHostCommand`、`ChartPreviewPlayerEvent`、`applyChartPreviewHostCommand`、`parseChartPreviewBridgeMessage`） | 提供图表解析、资源清单、HTML/脚本配置和场景文案。舞萌/Majdata 谱面与预览曲在 RN prepare 经 `downloadChartResource` 完成，预览曲写入 `music-data.js`；皮肤 PNG 缓存到 `rranker-chart-preview-remote` 后由 writer 写成 `skin-data.js` data URL。Phigros 皮肤仍用 `./skin/` 相对路径；Phigros 三类资源与 Phira zip 同样走 `downloadChartResource` 进度。Rizline 谱面 JSON 与 m4a 同样走 `downloadChartResource`，校验后由 writer 写成 `chart-data.js` / `music-data.js`，避免 iOS file:// 下 fetch 本地文件。资源定位与字节读取端口按游戏放在 `services/phigros-chart-preview-resources.ts` 与 `services/rizline-chart-preview-resources.ts`，Phigros 与 Rizline 的 `domain/*-chart-preview.ts` 只保留清单与发布的纯解析（`domain/phira-chart-preview.ts` 通过 `domain/phira-chart-info.ts` 的 `infoValue` 读取纯文本字段） | `chart-preview-screen-shell-contract.test.tsx`、`chart-preview-progress.test.ts`、`chart-preview-host-contract.test.ts` 及各游戏预览测试 |
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
四套播放器都有 `pagehide` 兜底释放。Simai、PGR/RPE、Rizline 和 osu! 用 `PlayerEventScope` 回收 DOM 监听、观察器、计时器和媒体；一个清理失败仍执行剩余释放。Simai 在初始化前接入宿主命令，晚到解析或解码不得更新终态；PGR/RPE 释放 GIF bitmap、视频等待与 WebGL 对象。osu! 入口从播放会话读取谱面元数据，不再次解析。
四套播放器的生成物（`assets/maimai-chart-preview/`、`assets/phigros-chart-preview/`、`assets/osu-chart-preview/`、
`assets/rizline-chart-preview/` 下的 `player.js`、`player.bundle`、`index.html`）由
`npm run build:chart-preview`、`npm run build:phigros-chart-preview`、`npm run build:osu-chart-preview`、
`npm run build:rizline-chart-preview` 重建，`npm run check:generated` 只校验不写盘。
合同由 `chart-preview-host-contract.test.ts` 与 `chart-preview-screen-shell-contract.test.tsx` 覆盖。

谱面导航请求在 `domain/chart-preview-request.ts`，暂存与交接位于 `features/chart-preview-shared/chart-preview-navigation.ts`。PGR 格式配置共用 `chart-preview-shared/pgr-preview-config.ts`；Phigros 与 Phira 各自的 `chart-preview-input.ts` 组装配置。RPE 路径规范与资源 URL 由 `domain/rpe-resource-path.ts` 统一解释。兼容包下载分别位于 `features/phigros-chart-download/chart-package-download.ts` 与 `features/phira-chart-download/chart-package-download.ts`，公共下载核心不构造游戏资源。

`chart-preview-shared/webview-player/interval-index.ts` 的 `createIntervalIndex` 保留原始条目顺序，返回与闭区间相交的候选，供 osu! mania 与 Rizline 共用。Rizline 按空间区间和特效时间区间合并候选，保留长 Hold、负速与前后 seek，静态绘制顺序只准备一次；未传 viewport 的帧布局仍返回完整结果。播放终点同时覆盖音频和 offset 后的谱尾，无音源尾段仍按公共时钟变速。已排序序列的下界与上界查找统一走 `chart-preview-shared/webview-player/sorted-search.ts` 的 `lowerBoundBy` / `upperBoundBy`，Phigros 的 PGR 与 RPE 渲染器、打击音游标和主入口共用，不再各自手写二分。osu! 转谱保留亚毫秒间隔打击的完整时间、采样与计分身份，生成时直接消费各项，不能用滚奏替代密集打击。

RPE 速度积分显式读取所属判定线的策略；染色纹理按 64 项、32 MiB 的驻留预算淘汰并复用画布，单张超大纹理使用全分辨率工作画布，不改变颜色、透明度或画质，换资源和释放时清空。Simai 诊断位置通过预计算换行索引查询。Phira 下载在整文件读取前经 `readBudgetedChartDownload` 校验现有字节预算，完整 ArrayBuffer 直接复用，资源分批暂存并检查取消。

osu! 滑条 repeat 必须是正安全整数，边缘采样只保存显式字段并经 `sliderEdgeSample` 读取默认值，不按 repeat 填充数组。`computeHitsoundSchedule` 的滑条边缘遍历从 `fromBeatmapMs` 之后的首个可听边缘开始。`sliderNestedEvents(beatmap, slider, slideDur, isLazer)` 逐项产生 tick、repeat 和 tail，判定与计分复用该流，不另外构造完整的节拍和类别数组；保留 stable 累加与 lazer 边界差异。反向箭头按最后一次对应方向折返计算。`buildAutoReplay(source, hash)` 可接收已解析谱面，标准模式在生成输入前走 `applyStacking`，播放与判定共用同一份坐标。太鼓滚奏用 `tickCount`、`tickInterval` 和起点表达均匀节拍；判定只检查相邻节拍，绘制只遍历可见节拍，着色缓存实际变化并用二分查找支持 seek。

osu!catch 的 `convertBeatmapToCatch(beatmap, modDiff)` 在同一转换路径内逐项生成滑条事件、派生音符和香蕉，保留 RNG 消费顺序与完整结果，不驻留整条滑条的中间事件和第二份派生音符数组。打击音的 timing point 查询复用 `upperBoundBy`，同时间取最后一项；`AudioSync` 共享已排序的只读 schedule，仅在输入无序时复制排序，`hitSoundEvents` 按需派生。

`buildAutoReplay(source, hash, signal)` 返回 Promise，生产播放准备传入会话信号，复用 `pauseChartPreviewParse(iteration, cancellation, slice?)` 每 128 个输入样本检查取消。每次准备独立保存时间片状态，首次检查点让出，随后计算累计达到 8 ms 才再次等待，恢复后重新计时；未传时间片的调用保留每批让出语义。不传信号的同步入口消费同一生成逻辑。标准模式的移动、滑条与转盘轨迹，以及太鼓滚奏输入逐项生成，保留所有采样和按键边沿；最终回放仍使用完整时间排序后的帧表。解析器校验参与展开的有限数值与时间，继承时间点的合法 `NaN` 由 `sliderVelocityMultiplier` 保持普通速度，并关闭标准模式与 catch 滑条 tick。catch 香蕉雨在单精度时间无法前进时改用双精度继续，不重复生成同一时间点。对应合同在 `chart-preview-resource-budget.test.ts`、`osu-preview/engine-performance.test.ts` 与 `osu-preview/resource-plan.test.ts`。

Rizline 的 `activeSpans(spans, seconds)` 为不可变、有序时间轨道缓存区间索引，相机、画布位移、速度和颜色共用；无序轨道保留原始提前退出语义。准备时 BPM 换算和音符所属线段查询也复用区间索引，交界处仍保留各采样器原有的首项或末项优先规则。

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
读完仍走 `verifyPhigrosResource`。Phira 预览的元数据、zip 和暂存共用壳的 120 秒 prepare 期限与取消信号，
不在壳外等待另一份元数据 Query；详情交接已有 `chart` 时直接复用，只有 chartId 时复用
`buildPhiraChartPreviewInput` 内的公共 Provider 读取一次。超时显示可重新加载的错误，退出后迟到结果不挂载播放器。
Phira 预览 zip 经注入的 `downloadChart`（同一下载入口）再解包；
未注入时使用 `phiraProvider.downloadChart`，同样传入取消信号和公共下载预算。共享预览/下载核心不识别 Phigros 修订或音符。
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
添加 `--generated` 时，复用 `scripts/lib/build-preview.mjs` 的只读
`readGeneratedPreview(assetName)`，核对已生成 player.bundle 与 player.js 的字节一致性，
执行四模式就绪、静音跳转、播放/暂停/重播与宿主暂停；省略需要编译的像素辅助检查。
`node scripts/check-maimai-player.mjs [Playwright 模块入口] --generated` 复用同一读取入口，
执行普通、Buddy、缺失难度和音频/谱面尾段，不编译解析器；Majdata 已解析输入和源码解析器
时长只由默认模式验证。报告同时列明实际覆盖与省略项，生成模式不调用 esbuild。

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
`decodeAudio(bytes, environment?)` 复用 `PreviewSessionEnvironment` 的音频上下文入口，默认调用方
只传字节；准备只解码，暂停就绪不请求音频授权。显式播放由 `PreviewSession.playFrom` 等待
`resume` 并复核命令代次与释放状态，合同由 `rizline-chart-preview-playback.test.ts` 覆盖。

`chart-preview-shared/webview-player/wheel.ts` 的 `setupWheelPopup` 接受元素、即时预览与提交
回调、范围、初始值、可选文本标签及数值格式，供舞萌、Phigros、osu! 与 Rizline 使用；支持 0.05/0.01 精度，返回
`getValue`、`setValue`、`flush` 与 `dispose`。`installPreviewControls(options): () => void`
（`webview-player/controls.ts`）按 `measureNavigation`、`details`、`sections`、`reserveStage`
组织播放详情、热度进度、播放按钮和常驻设置区；移动原控制节点并保留监听，返回观察器清理函数。
设置按钮声明 `data-presentation="inline"` 后，`setupWheelPopup` 通过同一范围、格式与回调创建
参数卡片：横向拖动微调、刻度点击跳值、枚举离散选择和键盘调节；纵向手势交给页面滚动。
触摸捕获从数值、刻度等子节点移交给参数按钮时，子节点冒泡的 `lostpointercapture` 不结束
手势；只有当前指针在按钮本身失去捕获才结束并提交最终值，其他指针的释放不影响当前拖动。
未声明该展示方式的调用方仍使用浮层。`closeActiveWheelPopup` 同时结束参数手势并提交最后值。
`frame-scheduler.ts` 按帧合并最新预览，操作停止 120 ms 后提交；静默 `setValue` 不回写设置，
`dispose` 取消未提交预览，领域设置解释留在各播放器。
桥接设置事件可选 `committed`，缺省按已提交处理；Phigros 的 `false` 预览只暂存在宿主当前会话，
操作结束、inactive、后台、卸载及换会话前保存最终值，迟到消息不得写入新会话。
共享交互模块不解释音符、模式或游戏 ID，新增设置不得另建持久化入口。
`chart-preview-wheel.test.ts` 验证预览、提交、格式、方向判定、键盘、枚举、捕获移交及销毁；
`check-maimai-player.mjs` 使用浏览器触摸输入验证数值、刻度、游标和枚举的连续拖动、最终设置
提交及纵向滚动，直接运行生成播放器。
`osu-chart-preview-controls.test.ts` 与 `rizline-chart-preview-controls.test.ts`
将公共控制器样式和结构与现有播放器直接比较。

`webview-player/heat-timeline.ts` 的 `HeatTimelineView({ host, bars, ruler, playhead, badge })`
只持有视图节点，`build(duration, tracks, labels)`、`updateProgress(percent, text)`、
`updateLoop(a, b)` 分别接收时长与音符起点、会话位置、循环百分比；不持有播放时钟。
`buildHeatDensity(duration, tracks, width)` 将真实起点分到至多 200 格，以不透明度表示密度，
空段留空、多轨共用最大密度。Simai 适配器将 Buddy 两侧换算到同一主谱时间轴，分别显示
1P/2P，普通及全屏各有视图实例；PGR/RPE、osu! 与 Rizline 传入各自会话时间单位的数据。
`bindHeatTimelineKeyboard(events, host, readPercent, seek)` 为没有全局跳转键的入口接入方向键
与首尾跳转，监听生命周期复用 `PlayerEventScope`。
`chart-preview-inject-factory.ts` 的 `chartPreviewAppearanceScript({ dark, accent }): string`
由 `ChartPreviewScreenShell` 在加载前与加载完成时注入应用主题，规范化颜色并保证按钮文字对比度；
共享样式在深浅中性色表面上使用应用强调色。`chart-preview-heat-controls.test.ts` 覆盖真实密度、
双轨位置与循环、原节点保留、四类设置布局、键盘释放和主题注入。

## 跨层硬约束

### 打包与生成数据

- `app.json` 提供版本、包名与插件列表；`app.config.js` 按 `ANDROID_OPTIMIZATION_MODE`
  设置 Android 优化插件参数；`BUILD_SOURCE_COMMIT` 写入 `extra.buildCommit`，优化模式
  写入 `extra.androidOptimizationMode`，`OSU_OAUTH_CLIENT_SECRET` 写入 `extra.osuOAuthClientSecret`。
  osu! 换码与令牌轮换通过 `osu-config.ts` 读取应用凭据，缺失时
  抛 `configuration`；客户端构建注入不具备服务端保密性。
- 安装的 `scripts/patch-metro-image-size.cjs` 是 Metro 0.83.3 与安全 image-size 2.0.4 的
  资产尺寸适配入口：校验依赖版本和 `Assets.js` 原始/适配后摘要，普通文件路径使用官方
  异步 `imageSizeFromFile`，ZIP 内字节继续使用 `imageSize`。重复执行不改变结果，未知版本
  或源码使安装失败；`dependency-compatibility.test.ts` 直接调用真实 `getAssetData`，覆盖
  Expo Router PNG、仓库 JPEG/WebP、分辨率缩放及异步资产插件。
- `metro.config.js` 是依赖裁剪入口：保留 Ionicons 子集映射，移动端仅重定向当前 Zod
  包内部的语言集合入口到 `src/utils/zod-locales.ts`。业务继续从 `zod` 导入，不能
  另建 Schema 工厂或替换错误类；默认英文初始化由原库执行。若增加校验语言需求，
  必须先扩展这个集合和 `metro-code-subsets.test.ts`，不能假定全集仍在移动包中。
- `scripts/patch-audited-dependencies.cjs` 共用 `applyPatches(root)` 与
  `verifyPatchedAdvisories(root, lockfile, report)`：安装时修复已核验的 braces 3.0.3 和
  node-forge 1.4.0，审计时只读核验所有安装副本的版本及完整源码。补丁以原始 SHA-256
  与唯一文本替换定位，重复执行通过逆向还原校验完整原文，未知内容使安装或审计失败。
  glob 保护同时覆盖字符串解析和直接 AST 遍历，RSA 保留合法 NULL 参数省略语义。
  `dependency-compatibility.test.ts` 覆盖漏洞输入和正常消费者，
  `production-audit-gate.test.ts` 覆盖篡改、副本、版本及公告范围变化。
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
- 图片索引读取 I/O 失败直接传播，保留文件并允许下次重读；只有读成功后才进行内容解析和文件核对。定时写入立即观察拒绝，显式 `flushRemoteImageCacheManifest()` 仍报告原错误，下一次写入可以恢复。
- 列表图片达到 50% 可见并持续 250 ms 后才进入持久化 scope；在线资源作为主路径，本地压缩文件只作回退。失活只暂停落盘，不把已显示 source 置空。
- 存储管理显示范围、统计范围和删除范围必须来自同一策略与适配器。不得清空整个 Expo 缓存目录，以免删除框架字体等非业务文件。

### WebView 与内存

- `ChartPreviewScreenShell` 只允许当前会话的精确页面 URI 导航，不放行任意子框架。关闭共享/第三方 Cookie、混合内容和文件页访问任意来源；保留实际暂存媒体、皮肤与相对资源需要的文件读取，iOS `allowingReadAccessToURL` 指向当前 session。错误只进入白名单诊断入口，不原样输出 WebView URL、原生事件或播放器消息。
- GIF 使用 `assertChartPreviewGifFrameCount` 在解码前限制 4,096 帧，单帧像素和所有保留 bitmap 的累计像素分别走公共 GIF/纹理预算；晚到资源与取消必须关闭 bitmap、decoder 和视频并结算等待。

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
  小节跳转和背景范围；步进与步退每次移动一拍，小节跳转按四拍定位。音乐缺失时保留谱尾。
  音源自然结束不清除公共 `PlaybackClock`，
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
  热度轨道、刻度与播放头委托公共 `HeatTimelineView`；`backgroundMedia.ts` 的 `SimaiBackgroundMedia`
  独占背景图片/视频元素、就绪状态与视频回绕同步，播放状态只作为每帧输入读入。
  三者的视图与桥回执都经 `SimaiPlaybackHost` / `SimaiBackgroundMediaHost` 回调接线。
  Phigros 与 Phira 在 `features/phigros-chart-preview/webview-player/`：`playback.ts` 的
  `PhigrosPlaybackSession` 独占播放位置（谱面秒）、命令代次、音乐音源、打击音调度与 rAF，
  设置对象由宿主持有、会话只读取当前值；seek 固定目标时间并提升代次，撤旧帧、音源与打击音后恢复，旧帧不能改写目标；`timelineView.ts` 的 `PhigrosTimelineView`
  将时长与音符条目传入公共 `HeatTimelineView`，不复制密度计算或播放状态。
  Rizline 的 `PreviewSession` 同样独占播放位置、音源、帧循环与命令代次，并通过可选的
  `PreviewSessionEnvironment`（`defaultPreviewSessionEnvironment`）注入音频上下文与帧循环，
  生产调用点不传该参数。osu! 的 `PreviewSession` 与 `PlaybackHandle`
  （`features/osu-chart-preview/webview-player/playback.ts`）同样持有会话，
  `main.ts` 只保存句柄与界面状态。会话状态由会话类内部改写，`main.ts` 只接线、不声明位置、时钟、
  代次或音源字段。公共 `PlaybackClock` 与 `chart-preview-shared/webview-player/` 的桥接、
  拨轮壳仍是各自的公共入口，命令与事件语义由共享桥接合同决定。
  合同见 `chart-preview-playback-ownership.test.ts`、`chart-preview-simai-playback-session.test.ts`、
  `phigros-chart-preview-playback-session.test.ts`、`rizline-chart-preview-playback.test.ts`、`player-event-scope.test.ts`。
- osu! 谱面确认在设置关闭背景视频时，下载 `novideo` 包并且不把视频条目放进资源计划。
- Phira、TUF 和 osu! 的无限列表使用 `components/game-content/InfinitePageFooter.tsx`，页脚表示加载中、后页失败重试或已经结束，已载列表保留。
- 谱面下载、解压、事件、循环、纹理和 GIF 使用 `chart-preview-shared/chart-preview-resource-budget.ts` 的有限预算。明确超限抛出 `ChartPreviewBudgetExceededError`，无法确定的声明量仍抛基类 `ChartPreviewBudgetError`。循环超过 4,096 次后按时间求值。ZIP 先核对声明大小和条目数，再由 `readBudgetedZipEntry` 读取实际解压块：每块在保留前校验条目/总量与声明，超限、伪造声明或取消会销毁上游 inflater；不使用完整 `entry.async()` 后补查大小。JSZip worker 适配先核验运行时能力，取消不越过受控调用栈形成未捕获异常。CRC 每 64 KiB 检查取消并让出；同一次准备用 `actualBytes` 累计。Phira notes 和预览下载显式使用 256 MiB 公共预算，notes 中 info/chart 另限 6/32 MB，JSON 解析受字节限额，RPE/PGR/PEC/PBC 遍历每 128 步让出，假音符同样计入 100,000 音符预算。声明量、实际字节、像素和进程内存分别计算，常量不等于进程内存上限。
- 成绩图前台收到内存警告后卸掉预览，页内提供降低分辨率并重新加载。警告到达时不按当前分辨率自动重建，重复警告也不重新挂上 WebView。`best-image-memory-recovery.test.tsx` 覆盖这个恢复。
- 成绩图预览只挂载当前页 WebView，其余页使用轻量占位；不得让多份大 HTML 常驻。
- 谱面确认和下载任务必须响应卸载、后台与 AbortSignal，不得在取消后继续写缓存或显示成功。
- 作为下游 memo 依赖的数组或对象必须保持稳定引用，避免无意义重算和重渲染。

## Majdata 与 Simai 公共路径

- `http-json.ts` 的 `JsonRequestOptions<T>` 支持 `init`、`authenticated`、`maxResponseBytes`、
  `onHttpError` 与 `onResponse`；JSON、字节和 `requestProviderResponse(options, read)` 共用
  实际字节预算、取消、超时、重试与 Schema。`onResponse` 只在有效成功响应后执行并等待；
  Majdata Cookie 提交失败保留持久化错误，不误归网络错误或重新发请求。
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
  `stored-zip.ts` 的 `writeStoredZip` 使用原生文件句柄以 64 KiB 固定块写 STORE ZIP/ZIP64，
  CRC 复用 `createChartPreviewCrc32()` 增量状态，读写按实际偏移验证进度。
  不读取整文件或生成整包内存数组，不新增大小拒绝条件。保存使用 `saveChartPackage` 的文件入口，
  等待保存完成后释放自身暂存；清理失败独立记录，不覆盖保存、取消或原始失败结果。
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

机厅服务 `services/nearcade-client.ts` 与 Phigros 平均 ACC 的 `loadPhigrosAccAverages` 复用 `requestJson`，分别保留 12 秒、10 秒期限和一次尝试，响应经 schema/现有解析器校验。机厅游戏列表允许网络失败回退，但取消原样传播；平均 ACC 为可选展示数据，失败返回空集合，取消或超时不继续高档位查询。`useTransientDetailedMaimaiCatalog` 向 Provider 传递 AbortSignal，失活或卸载中止该次请求。
谱面资源准备继续复用 `prepareChartPreviewWebviewFromPlan`；`stageAsset(moduleId, fileName, directory, signal?)` 在资源解析前后校验共享写入代次，远程缓存复制在字节读取后再次校验，清缓存后的迟到结果不能重建文件。通知动作的同步异常和 Promise 拒绝统一进入 `recordRuntimeError`，不向 console 输出原始错误。osu!catch 的生产构建只计算判定与显示时间线，不运行控制台用的逐毫秒轨迹扫描，来源声明与集成摘要保持可校验。

## 项目不变量

独立原生诊断使用 `services/native-storage-probe.ts` 的 `runNativeStorageProbe(publish)`。
该入口仅使用临时数据检查真实桥接能力，不读取账号或替代业务存储入口；结果由调用方
直接显示，不依赖日志、数据库或文件写入成功。生产构建保持 `expo-router/entry`。

- 读取失败不删除原数据。账号目录和会话索引在 JSON 损坏时保留原文并尝试保存 `.corrupt` 副本，未知版本或顶层结构错误保存 `.unrecognized` 副本并抛出类型化错误，后续写入不能静默覆盖；旧版会话迁移源解析失败时跳过但不删除。偏好工厂的 `readFailure: 'throw'` 让严格消费者区分读取失败与缺失，默认模式在读取或解析抛错时返回默认值，解析失败尝试保存 `.corrupt` 副本并保留原键。SQLite 成绩、曲库和资源快照在 schema 版本不符或 JSON 损坏时保留原行并返回 `null`，不创建文本副本；数据库 I/O 错误向调用方传播。
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

## CI 公共合同

常规检查与构建统一由 `.github/workflows/quality.yml` 编排；独立桥接诊断仍手动运行，
`android-account-recovery` 在完整检查成功且账号范围命中（或手动选择 all）时执行受控原生账号闭环。
诊断 Metro 只将 `expo/fetch` 映射到测试适配器；适配器通过公开的 `expo/fetch.js` 入口取得同一原生实现，
避免按目录缓存的解析结果产生自引用。`native-account-config.test.ts` 使用真实 Metro 解析缓存验证两种导入顺序，
Vitest 的两种模块名称共用现有 Fetch shim。
`build-admission` 汇总构建前检查，双端构建独立消费准入结果；末端 `quality-gate` 汇总全部应执行作业，包含双端构建、Android 冒烟和交付。
`ci-gate.mjs` 从原始事件核验成功与预期跳过，拒绝缺失、失败、取消和意外跳过。纯文档只在范围、轻检查成功且其余作业明确跳过时通过。PR 使用 head.sha，分支使用
github.sha；policy 输出、质量检查、门禁、checkout 与构建输入必须对应原始事件同一源码。

| 公共入口 | 输入与输出 | 合同测试 |
|---|---|---|
| `.github/scripts/build-policy.mjs`：`buildPolicy({ eventName, event, repository, ref, sha })` | 返回 `{ build, production, sha }`；核验原始事件仓库、分支、删除状态、PR 来源与 40 位 SHA。本仓库分支 push/手动运行允许发布构建；同仓 PR 与 fork 自身运行只检查；fork PR 到 master 只允许无生产凭据构建。CLI 对无法验证的事件失败，不输出事件正文 | `build-policy.test.mjs`、`ci-contract.test.mjs` |
| `.github/actions/changed-scope/action.yml` | `base-sha` / `head-sha` / `account-checks`（auto/all）；返回固定枚举 `functional` / `account` / `reason` 与计数 `changed-count`。账号与共享运行路径触发专项，已知展示路径可省略，未知范围执行；all 强制专项。CI、依赖、构建配置走完整检查；任意目录下的 `*.md` 文件、文档目录、许可与根级 README 截图可以跳过；文档与代码或 CI 混合改动仍走完整检查；无基准或比较失败按功能改动处理 | `changed-scope/self-test.mjs`、轻检查破坏样例 |
| `.github/scripts/android-account-recovery.mjs` 与 `apps/mobile/native-account-recovery-entry.tsx` | 独立包名、每次生成的测试签名及同源码 SHA。首进程一次领取随机合成凭据，经公共绑定/存储写入读回；强杀并确认退出后，第二进程在同次安装上通过 `restoreAppAccounts()`、真实 Provider 和 ScoreHub `fetchMe()` 认证，禁止再次注入。服务端核对原令牌，失败也清理测试包、端口和服务器；记录固定子步骤、白名单错误分类与清理结果，成功失败都输出领取/拒绝计数和认证布尔值；脱敏证据进入日志与工件，拒绝保存原始异常、logcat 正文或凭据 | `account-recovery.test.mjs`、`ci-contract.test.mjs`、`native-account-{config,fetch,recovery}.test.ts`；真实原生作业另行运行 |
| `.github/actions/android-build/action.yml` | `source-sha`、字符串布尔 `production`、`signing-mode`、`expected-certificate-sha256`、`optimization-mode`；返回 `artifact-name`、`manifest-digest`、`delivery-name`。同一入口完成四 ABI Release 编译、签名校验和候选工件封存；环境复用 `android-setup`，冒烟和正式交付为独立作业，按准确工件名与摘要消费候选；发布模式独立校验 GITHUB_SHA。现有发布选择 `legacy-debug` 并锁定旧证书，fork 只用 `test-debug`；`release` 私有签名模式仍要求完整 keystore 配置 | `ci-contract.test.mjs`；实际 Gradle 与托管设备另行执行 |
| `.github/scripts/android-smoke.mjs` | `production` / `native`、APK、明确设备序列号、证据目录。生产检查复用页面路由；主题与日志恢复的强杀重启直接携带目标 VIEW URL，避免导航未就绪时丢失事件。仍要求主题持久化、日志恢复与系统分享通过，设备命令与流程分别位于 `lib/android-device.mjs`、`lib/android-smoke-flow.mjs`。独立 XML 路径杜绝旧快照，空根节点、未生成或不完整 XML 在期限内重试；设备错误、崩溃、断言和超时分别记录，诊断失败不替换首个错误。失败快照只保留固定页面文案和匿名化控件状态 | `android-smoke.test.mjs`、`ci-contract.test.mjs` 覆盖空根恢复、旧 XML、超时、ADB 失败、持久化、分享和诊断失败；真实托管设备另行执行 |
| `.github/scripts/android-artifact.mjs`：`sealCandidate(directory, sourceSha)`、`verifyCandidate(directory, sourceSha, digest)` | 清单锁定来源、每个文件的 SHA-256、准确文件集合及四 ABI 验证记录。编译只产出一次候选；失败重跑复验原候选，交付名包含验收尝试号 | `android-artifact.test.mjs`、`ci-contract.test.mjs` |
| `.github/scripts/android_signing.py`：`verify_android_signing(apksigner_output, mode, expected_certificate_sha256=None)` | 仅接受单一签名者的证书 DN / SHA-256，兼容编号标签与 Build Tools 37 的 V1/V2/V3.0 标签；签名者数量若存在必须唯一且为一，重复、混合或未知证书标签失败。来源戳及公钥摘要不替代 APK 证书。`legacy-debug` 必须带合法 pin，任何给定 pin 均严格匹配；`release` 拒绝调试证书。四 ABI 校验器以 verbose 输出复用同一入口，返回同源签名证据与说明，旧调试签名不标为正式签名 | `android_signing.test.py`，含新旧工具格式、额外签名者与四 ABI 验证入口 fixture |
| `.github/actions/ios-build/action.yml` | `source-sha`、字符串布尔 `production`。Pods 复用 React Native 的 `ENTERPRISE_REPOSITORY` 指向官方 Maven Central；该安装步骤的临时 `CURL_HOME` 统一 HTTP/1.1、连接/传输/低速超时和有限重试，成功失败均清理。正式模式校验 GITHUB_SHA，预留编号、签名 Archive/IPA，先保存制品再提交 TestFlight；测试模式不安装签名、不请求 ASC。私钥、profile 与 keychain 在部分失败时仍清理 | `ci-contract.test.mjs` 使用真实 curl 验证半截下载重试、持续失败退出及配置清理；实际 Xcode、签名与 Apple 处理另行执行 |
| `.github/scripts/ios-build-number.mjs`：`nextIosBuildNumber(latestBuild, reservedBuilds?)`、`queryReservedIosBuildNumbers(options)`、`reserveIosBuildNumber(env, options?)` | 在全局 iOS 发布锁内取 Apple 最大整数与可信预留最大值加一。查询当前/历史运行的官方仓库 ID、事件、workflow 路径与 SHA；不采信 PR/fork/其它工作流，不下载 artifact 正文。CLI 返回 `build_number` / `artifact_name` / `reservation_path`，预留上传成功后才允许提交 Apple | `ios-build-number.test.mjs`、`ci-contract.test.mjs` |
| `.github/scripts/verify-ios-archive.py`：`verify_app`、`verify_ipa` | 校验实际 Archive 与最终 IPA 的 Expo buildCommit、Info.plist 包名、版本与构建号。IPA 只读取唯一且有界的配置与 manifest，脱敏身份 JSON 不包含 OAuth 或签名材料 | `verify-ios-archive.test.py` |
| `.github/scripts/lib/workflow-yaml.mjs`：`validateWorkflow`、`validateAction`、`collectBashRuns`、`collectPowerShellRuns` | 使用固定真实 YAML 解析器，按解码后的 shell 文本检查；PowerShell 只解析 AST，不执行构建脚本。解析器或 shell 不可用时失败 | `check-light.mjs --self-test` |

发布作业只进入 `production-release`，并有独立原始事件守卫；fork 构建作业无发布环境、无
secrets 引用、checkout 不持久化 Git 凭据。正式 iOS 使用全局串行队列并保留最多 100 个
等待项，预留 artifact 保留 90 天；失败/取消的预留仍占用。环境、密钥与分支保护是远端配置，
不能从 YAML 修改推断已部署。自动化仅证明相应合同，不代表原生出包、真实账号或设备验收。

## 可复现检查

在 `apps/mobile` 执行 `npm run check:architecture`、`npm run check:generated`、
`npm run check:lossless-assets`、`npm run benchmark:optimization`、
`npm run benchmark:phigros-push`、`npm run audit:all`、`npm run audit:prod`。播放器生成检查从当前
源码重新打包，同时验证 HTML、player.js 与 player.bundle；基准比较保留固定提交的绘制
命令及搜索结果，报告桌面 CPU 分布，不推断手机帧率。推分基准用确定性存档测量
30/300/1000 条成绩的总耗时与事件循环最大阻塞，不设 CI 耗时门槛。生产审计门槛分执行、校验、
完整性、政策四层（退出码 0 通过 / 1 政策失败 / 2 执行失败 / 3 报告不合法 / 4 报告不足以判断）：
critical 无论能否解析出公告编号都失败；报告缺字段、条目与 metadata 不自洽、未知严重级别、
无法识别的公告，以及空 `via`、悬空引用、成环而无可解析根因都按失败处理；基线记录的分类值、
包名与版本必须与锁文件一致；接受理由类型由脚本定义，当前接受基线为空。
完整审计通过同一脚本的 `--all` 执行 `npm audit --json`，包含开发依赖，所有未修复级别均失败，
不复用生产接受基线。仅两项已修复公告可在实际安装补丁通过完整性核验后通过；不删除报告条目，
不伪装为零漏洞。新的公告、critical、缺失或改写的补丁仍阻断，审计不自动修补依赖。
无损 PNG 检查验证 CRC、解压扫描线、RGBA、透明度及所有非 IDAT 块。完整命令和双端云端比较流程见技术架构文档。

仓库轻检查在仓库根目录执行 `node .github/scripts/check-light.mjs`（`--self-test` 额外用故意
破坏的样例证明每类检查都会失败）：用固定的真实 YAML 解析器（`yaml` 2.9.0，声明在
`.github/scripts/package.json`，与 `apps/mobile` 依赖树无关）解析 workflow 与 action，
按解码后的标量检查 `run:` 的 shell 文本、执行 `bash -n` 与 PowerShell AST、检查 `.mjs`/`.cjs` 的
`node --check` 语法，并运行分类器自检 `node .github/actions/changed-scope/self-test.mjs`。
它只读仓库文件，不安装移动端依赖树。

CI 合同在仓库根目录执行：

```powershell
node --test .github/scripts/*.test.mjs
python -B .github/scripts/verify-ios-archive.test.py
python -B .github/scripts/android_signing.test.py
```

这些命令只运行事件、门禁、编号与脱敏制品 fixture，不执行播放器、Expo prebuild 或原生构建。
