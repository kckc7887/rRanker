# rRanker 公共逻辑

实现、公开导出和实际调用方是当前事实。公共包由 `platform/sdk` 提供，以下 SDK 内路径均相对于 `platform/sdk/src`。游戏规则属于游戏适配器，上游协议属于数据源插件，额外功能属于工具插件；宿主只装配插件并提供通用页面入口。

## 插件合同与装配

`plugins.ts` 定义 `GameAdapter`、`DataSourcePlugin`、`ToolPlugin`。`GameId`、`ProviderId`、`PluginId` 都是字符串，新增游戏、数据源或工具不需要修改平台联合类型。包的 `package.json` 显式导出供其它包使用的入口；插件通过 `@rranker/sdk` 及其公开子路径复用平台能力。

| 类型 | 公开内容 | 业务归属 |
|---|---|---|
| `GameAdapter`，`kind: 'game'` | 游戏与模式资料、页面、目标解析、数据装配、摘要、资源刷新及存储归属 | 游戏模型、评分、筛选、展示与所需数据合同 |
| `DataSourcePlugin`，`kind: 'provider'` | 数据源资料、账号恢复和管理、绑定界面、凭据解析、账号客户端、公共资源客户端及同步 | 上游认证、请求、响应转换、来源缓存与示例数据生成 |
| `ToolPlugin`，`kind: 'tool'` | 工具目录、页面、能力要求、总览操作与卡片、详情操作、谱面下载及文件缓存 | 适配器专属工具、模板、工具偏好和操作流程 |

`apps/mobile/src/plugins.ts` 是应用的插件装配点，导入各包描述符并提供 `plugins`。`apps/mobile/index.js` 在加载 Router 前调用 `initializePlugins`，建立插件、游戏、模式组和数据源索引；重复插件 ID、游戏 ID 或数据源 ID 会报错。描述符保留轻量元信息，页面与实际业务在对应回调中延迟加载。

官方实现分别位于 `plugins/games`、`plugins/providers`、`plugins/tools`。`game-example`、`provider-example-test`、`tool-example` 展示同一个游戏的三类独立包：游戏声明自己的数据与页面，数据源实现游戏公开的数据合同，工具使用游戏公开模型和 SDK 组件。第三方包采用相同合同，加入依赖和宿主装配后随应用打包。

游戏包通过自身 `data-source.ts` 公开需要的账号与资源能力。数据源包实现这些合同，游戏页面从公共解析入口取得客户端；游戏不导入具体数据源或工具包。工具可以依赖对应游戏的公开模型、计算和 UI；真实共享的格式解析留在 `plugins/shared`，公共 UI 与生命周期留在 SDK。

`registry.ts` 提供 `getGameAdapter`、`getGameDefinition`、`getDataSource` 等查询。`getGameResourceSource(gameId)` 从当前可用且提供 `createResources` 的来源中，按 `resourcePriority` 降序、插件 ID 升序选择；`resolveGameResources(gameId)` 调用该来源。账号客户端由 `resolveAccountClient(accountId)` 根据已绑定来源创建。两类客户端的具体类型由所属游戏合同表达，平台不解释其业务方法。 曲库刷新接收生命周期 signal，在取消或失效查询后检查是否已取消，并将后续取消转给该曲库 Query 的内部 signal。

`ToolPlugin.requiredCapabilities` 按游戏声明能力名，工具可用性要求游戏适配器存在、已启用且满足相应能力。`getGameTools`、`getPluginPage`、`getOverviewActions`、`getOverviewCards` 和 `getChartDownload` 都过滤不可用插件。工具导航使用 `gameToolHref` 或 `gamePageHref`；未找到可用贡献时返回 `null`，调用方隐藏入口。

`subscribePlugins` 同步通知变更，组件使用 `usePluginRevision` 订阅。`state/plugin-store.ts` 保存启停偏好，保存成功后调用 `services/plugin-lifecycle.ts` 的 `applyDisabledPlugins`。停用使账号选择重新派生，释放所属客户端、失效写入代次并取消和移除所属 Query；账号、凭据、个人曲库和磁盘缓存继续保留。管理和缓存统计仍可查询已安装插件。

## 页面、目标与展示

`GameAdapter.pages` 支持 `overview`、`best`、`records`、`catalog`、`library`、`detail`。`apps/mobile/src/components/GamePageScreen.tsx` 根据当前游戏分发常规页面；`apps/mobile/app/detail.tsx` 校验游戏可用性，调用适配器的 `parseDetailParams`，再装配详情页。缺失页面、无效参数和不可用游戏各自显示空态。

`navigation.ts` 的 `DetailTarget` 为 `{ gameId, params }`，`params` 是字符串记录；`detailHref` 生成 `/detail` 地址。`PluginPageTarget` 通过 `pluginHref` 生成 `/plugins/[pluginId]/[pageId]` 地址。平台只封装导航，歌曲 ID、难度、谱面类型和模式等字段由游戏自己的 `domain/targets.ts` 解析，字符串身份保留前导零。 难度参数按各游戏现有领域范围校验，详情与备份导入共用该解析；舞萌宴谱使用固定索引 0。

`components/game-content/OverviewPageShell.tsx` 接收游戏提供的显示名、评分卡参数、个人库汇总方式及提示。公共壳负责账号选择、查询状态、滚动、下拉刷新、工具箱、普通置顶工具和个人曲库入口。`accountRating` 为账号列表贡献评分展示，`scoreCardPreview` 为个性化页贡献卡片示例；无专属评分组件时使用游戏声明的公共主题。

总览操作由 `ToolPlugin.overviewActions` 贡献，额外卡片由 `overviewCards` 贡献。公共壳提供 `syncBusy`、`onSync`、操作互斥和 `registerRefresh`；注册刷新操作返回取消注册函数，组件卸载时释放。没有操作贡献时保留默认同步按钮。普通工具置顶使用 `state/toolbox-pins.ts` 的 `pinsByGame`，牌子、收藏品等专属置顶由工具自己保存并渲染。

`ToolPlugin.detailActions` 接收 `PluginDetailProps` 的真实 `LibraryTarget` 和可选标题。详情的现有操作区域通过 `GameChartResultCard` 导出的 `ToolDetailActions` 装配当前游戏可用的工具贡献，停用工具或适配器后自动移除操作。Phigros 的谱面确认由 `tool-chart-json` 贡献，示例游戏的“查看实力分析”由 `tool-example` 贡献并打开已有分析页面；游戏包只传入当前歌曲或谱面目标。

`BestListPage`、`RecordsListPage`、`CatalogListPage` 统一列表边距、安全区和可见性。`GameScoreCard`、`ScoreCardMetric`、`ScoreCardBadges`、`GameSongRow`、`GameDifficultyBadge` 接收所属游戏的展示值；评分档位、状态规则和筛选条件不进入公共组件。`FilterShell` 管理折叠、摘要和重置，具体选项由游戏或工具提供。

详情共用 `SongDetailChrome`、`SongDetailHero`、`SongMetadataTable`、`GameChartResultCard`，操作通过 `ChartAction` 提供。`GameNoteTable`、`JudgementTable` 接收实际行和汇总。`CollectionArtwork` 处理素材比例和预览，游戏自己的封装决定图片地址及语义。Simai 通用成绩布局、状态和雷达组件复用 SDK，舞萌档位、宴谱规则与 Majdata 展示规则由各自适配器维护。

`ChartCarousel` 按谱面键保存标签草稿，只装配当前与相邻卡片；下载、弹层和保存中的卡片继续保留。活动状态传给当前卡，显式初始目标及 `resetKey` 变化才重置定位，宽度变化保留当前卡。详情在首次有效查询尚未返回时显示加载状态，刷新保留已有内容。

## 数据装配、查询与取消

`data.ts` 定义 `GameDataBundle`、`DataSource`、`AccountSummary` 和开放的 `GamePayloads`。各游戏在自己的 `domain/game-data.ts` 中声明载荷并扩充 `GamePayloads`；SDK 只拥有空载荷和通用元信息。`AccountSummary.displayData` 保存游戏解释的显示字段，平台不设置专属评分字段。

`hooks/use-game-data.ts` 从会话取得账号与来源，经 `services/game-data-loaders.ts` 分发到适配器 `loadData`。`GameDataLoaderContext` 提供账号、客户端、QueryClient、取消信号、提交资格检查，以及实体读写和发布方法。适配器返回当前 `bundle` 和可选后台刷新 Promise；`summarizeData`、`getDataStatus` 分别提供账号摘要与数据状态。

`services/game-data-query.ts` 是实体发布和后台结果的共同入口。后台更新等待进行中的首屏查询提交后再发布，发布前复核资格；刷新读取实际后台结果与已提交数据，返回 `success`、`noop`、`partial`、`failed` 或 `cancelled`，保留失败目标和来源时间。页面使用这些结果判断同步完成，不复制轮询器或根据缓存字段猜测成功。

`hooks/use-overview-sync.ts` 依次取消当前账号查询、调用数据源 `sync`、调用适配器 `refreshResources`、刷新当前游戏数据。全过程使用前台信号并订阅账号、游戏与来源代次；切换账号、退出页面、清缓存或停用所属插件时中止在途同步，迟到结果不能发布。部分刷新失败保留可用数据，并通过公共通知说明未完成的数据部分。`useGameResourceSync` 按当前适配器和公共资源来源进入刷新，离开游戏或作用域失效时取消请求；无关插件启停不重启刷新。

Query 归属通过 `meta.pluginId`、`meta.sourcePluginId`、`meta.gameId`、`meta.accountId` 表达，停用与清理沿这些实际作用域取消；来源停用不扩大为整个游戏的查询清理。公共曲库查询不附账号身份，账号成绩和私人明细包含真实账号，osu! 各模式使用各自游戏 ID。实际来源由当前解析结果提供，查询键继续表达资源或实体身份。

`state/query-client.ts` 创建唯一 QueryClient，默认最多重试一次，并遵守 `ProviderError.retryable`。`providers/http-json.ts` 处理请求、取消、错误转换与 `totalAttempts`；上游认证、请求参数和响应校验由数据源实现。网络与磁盘边界保留校验，可信的内部转换直接使用已校验类型。

`services/cache-first.ts` 提供缓存首屏和后台刷新，缓存值保留原来源和抓取时间。`domain/refresh-result.ts` 表达刷新与快照元数据。`createInflightGuard.share` 共享同键工作并独立取消消费者，`useBoundedQueries` 管理批量明细。资源清理先失效写入代次，异步结果在最终状态或存储提交处检查资格。

`hooks/use-local-search.ts` 在逐项准备和匹配中按 4 ms 预算分片，通过 `scheduleIdleTask` 继续；输入、快照与活动状态变化取消旧工作。`utils/search.ts` 缓存结构化搜索文档，游戏自己的搜索入口处理别名、常数、版本和分类。完整结果按同一快照与筛选身份复用，派生列表与分析结果不另存一份业务状态。

示例数据由 `bindingKind: 'fixture'` 的来源产生。`readDemoPage`、`createDemoScore`、`createDemoBest` 等能力位于相应游戏合同，实际生成由来源客户端实现；页面按能力使用同一明细和列表组件。示例查询具有独立账号身份，生成成绩不写真实账号成绩快照，缺失 PP、判定或连击沿游戏既有空值语义展示。

## 账号、凭据与恢复

`state/account-store.ts` 保存账号、凭据及选择状态。`state/session-store.ts` 的 `useSession` 是它的派生视图，结合插件和示例账号偏好计算活动账号、游戏、会话与 `sourceClient`。账号集合保持完整，活动选择和 `useVisibleBoundAccounts` 只使用当前可用账号。

`state/session-provider-resolver.ts` 根据账号、凭据引用、显示名和插件修订缓存客户端，调用所属 `DataSourcePlugin.createClient`。数据源收到 `SourceClientContext` 的账号、凭据、提交资格和 `commitCredential`；页面不创建认证 Provider，不保存第二份客户端状态。

`services/account-restoration.ts` 与 `storage/secure-session-store.ts` 恢复当前安全索引和被引用的凭据，数据源通过 `parseCredential` 解释内容、通过 `restoreAccounts` 恢复自己管理的账号。成功读取后发现不支持的结构，只重建对应索引或条目；I/O 失败保留数据并显示重试入口。恢复不扫描孤立分片。

账号删除先提交索引与凭据引用，再清理失去引用的凭据和数据源附属内容；共享凭据继续保留。`DataSourcePlugin.removeAccount`、`cleanupAccount`、`cleanupCredential` 通过平台提供的提交和清理步骤执行，附属清理失败单独反馈，不撤销已经完成的索引移除。

`services/session-credential-service.ts` 提交轮换时检查预期凭据、当前归属与写入资格。共用凭据的账号读取同一份新值；解绑、重新绑定或较新轮换使旧请求失效。持久化失败保留待写结果，前台恢复时重试。`LargeSecureValueStore` 按当前清单和分片保存长值，正常写入以 SecureStore 的结果为准。

`services/account-write-scope.ts` 为账号请求捕获游戏、来源和账号写入代次，并检查账号仍绑定且来源可用；`captureAccountWrites` 为上传的读取账号与目标账号复用同一资格。`cancelBoundAccountQueries` 先失效账号写入，再取消和删除查询。`services/account-hydration.ts` 通过数据源的 `hydrateAccount` 补全资料，账号缩略图统一保存头像、评分显示及 `displayData`；需要持久化的显示名由账号元数据入口提交。共享资料请求在游戏、来源或账号代次失效时取消，资料仅在仍属于当前账号时提交，缩略图保存跳过没有实际变化的字段。

绑定通过 `useAccountBindingRequest(visible, providerId, gameId?, cancelOnBackground?)` 处理取消和结果发布，来源贡献 `loginPanel` 或 `bindingSheet`。请求捕获游戏与来源写入代次，同步订阅失效并取消；队列中的账号保存和状态发布使用同一提交资格。OAuth 回调页按数据源提供的 `oauthCallback` 分发，授权协议与登录失效判断留在来源包。成功绑定后的账号选择使用 `switchBoundAccount`，错误进入当前可见通知层。

示例账号仅在调试偏好已恢复且开启后可用。关闭示例入口或停用插件只改变选择与可见性，不删除账号和个人数据。偏好保存成功后才发布开关；被拒绝的账号切换不写活动账号偏好。

## 持久化与个人曲库

`storage/rranker-database.ts` 提供连接、`runDatabaseWrite` 和串行 schema 初始化。业务 schema、事务与读改写共用队列，队列任务内不重复进入同一队列；日志数据库单独处理。

`SqliteSnapshotRepository` 提供泛型 `getAccountScore`、`saveAccountScore` 与资源缓存操作，游戏或来源传入自己的 schema 和版本。失效正文或版本只删除读到的受影响行，条件删除保留排队期间写入的新缓存；I/O 错误直接传播。舞萌成绩专属封装位于 `plugins/games/maimai/src/storage/score-repository.ts`。

`createPreferencesStore` 校验当前格式，成功读取不支持的内容才重建所属键。`preferences-write-coordinator.ts` 合并恢复期间的真实编辑并串行保存，读取未完成时不会把占位默认值写回。随机筛选复用 `createPersistedRandomChartsFilterStore`，成绩图偏好复用写入协调器，业务字段及所属游戏、账号键由各自工具维护。

`library.ts` 的 `LibraryTarget` 包含 `gameId`、`kind`、稳定 `id` 和字符串 `target`。平台以游戏、种类、ID 组合生成条目键，`target` 作为不透明的详情参数保存；`libraryDetailTarget` 直接生成 `{ gameId, params: item.target }`。适配器的 `parseLibraryTarget` 校验实际目标并核对规范 ID，不依赖联网曲库。

`services/user-library-service.ts` 是收藏、练习、标签、预设、备份的业务入口；`storage/sqlite-user-library-repository.ts` 执行真实事务。条目与标签预设都按游戏隔离，单项动作只更新所属行，清理某游戏保留其它游戏。当前个人库保存元信息、条目及按游戏的预设三类表，不支持的结构仅重建个人库所属表。

`hooks/use-user-library.ts` 向页面和 `LibraryTagEditor` 提供同一份条目、预设及读取状态。首次成功读取前阻止标签编辑，失败可以重试。`UserLibraryList` 接收页面已有的 library 对象；标签历史在打开弹层时计算，预设和标签保存失败保留当前输入。预设提交完成后再提交选择，保存期间的新输入继续保留。

个人曲库页右上角菜单只导入、导出当前游戏。`createBackup(gameId)` 在同一队列任务中读取该游戏条目与预设；备份包含 `format`、当前 `version`、`gameId`、导出时间、条目和预设。`restore(gameId, backup, mode, signal?)` 在写入前拒绝旧格式、异游戏、混合游戏、无效目标及不可用适配器。

合并将同一目标的收藏或练习标记取并集、标签去重，保留最早创建时间和最新更新时间；替换仅替换当前游戏。条目与预设在同一事务提交，上限错误或取消使事务回滚。导入过程同步订阅插件可用性，停用当前适配器立即取消待写任务。`user-data-file-service.ts` 复用系统文件选择和分享，临时文件使用后清理。

`features/storage-management/game-storage-adapters.ts` 将适配器的 `storage` 与工具的 `cache` 贡献组成实际计量和清理入口，未提供专属定义时按游戏账号归属处理。可重下载缓存、持久账号数据和个人曲库分别处理；停用插件的缓存仍可管理。多游戏清理先失效选中作用域，再使用同一库存执行清理，失败按所属分类反馈，释放量取实际前后统计。

## 生命周期与公共 UI

`AppLifecycleProvider`、`useAppRuntime`、`CachedTabScreen` 共同管理前后台与页面活动。后台取消前台工作，前台恢复仍活动的未完成工作；普通失焦保留已挂载画面和局部状态，内存警告允许卸载隐藏页、清理非活动查询及图片内存。`StackScreenActivityScope` 将原生转场完成、焦点和前台状态合并为详情及个人库页的活动条件。

`scheduleIdleTask` 是可取消的空闲调度入口。批量曲库明细暂停后续领取并保留成功结果，返回时继续读取；osu! 个人库明细使用四路有界查询，与详情共用查询身份。当前卡、列表可见项和页面活动共同决定图片及明细工作。

`AppNotification` 统一提示、选择与带进度的操作通知。`AppSheet` 和 `AppModal` 统一弹层、安全区、关闭与通知出口，账号选择、绑定、上传、标签和素材选择传入各自操作。`PublicPlayerPickerSheet`、`OAuthLoginPanel`、`OAuthResultCard` 提供公共交互，搜索和授权仍由数据源负责。

`RemoteImage` 使用 `cacheProfile` 声明 thumbnail、artwork、native 或 none。`services/remote-image-cache.ts` 管理原图、压缩图、文件身份与清理；`acquireRemoteImageOriginal` 返回原字节文件及 `release`、`invalidate`。同一原图下载由消费者共享，取消彼此独立，身份包含请求信息和游戏，清理代次隔离旧工作。

原图发布后保持稳定路径，活跃引用阻止提前回收，释放后按索引和 LRU 裁剪。失效操作只作用于已取得文件，保留后来替换的有效文件；解码失败通过所属入口重建。压缩在图片成功显示且页面活动时进行，已有有效缩略图在原图失败时继续显示。

## 成绩图、预览与工具

`features/best-image` 提供 `useBestImageScreenController`、`useBestImagePreview`、`useBestImageExport` 及共享页面壳。工具包拥有模板、素材选择、游戏专属设置和成绩筛选。`useBestImagePreferences` 使用公共偏好协调器，恢复时合并实际编辑，保存失败保留当前选择并通过前台恢复重试。

`load-best-image-session.ts` 按账号建立素材会话，远程素材通过公共原图入口获取原字节并复制入会话。`useBestImageAssets` 同时按会话、请求键和缓存代次过滤结果与进度；`usePreparedBestImageSources` 按模板声明准备素材并异步写入 HTML。重试和后台恢复复用已完成内容，旧结果不进入新预览。

预览和导出等待字体、图片加载与解码、当前 HTML 和真实布局就绪。导出使用独立 WebView 与捕获布局，期间暂停预览；进度和取消复用通知。离开或更换账号先失效会话，等待截图和临时文件清理再回收；后台取消当前导出，恢复后可重新发起。清缓存跳过活跃会话，启动维护回收残留会话目录。

`features/chart-preview-shared` 提供原生页面壳、资源准备、消息桥、播放时钟和 Stage 公共运行时。`plugins/shared/chart-simai`、`chart-json`、`chart-osu` 分别提供格式解析和播放器；格式自己的时序、绘制层次和媒体规则留在对应包。`tool-simai`、`tool-chart-json`、`tool-osu` 拥有预览页面和原生输入准备。 Majdata 与 Phira 元数据经游戏资源合同读取，准备请求捕获实际 `sourcePluginId`；来源停用同步取消准备并释放播放器，迟到结果仅执行清理。已携带完整 Phira 谱面数据的请求直接使用载荷。

游戏通过 `gamePageHref(gameId, 'chart-preview', params)` 导航，通过 `getChartDownload(gameId)` 取得当前可用下载贡献，避免直接引用工具实现。`features/chart-download-shared` 统一进度、取消和文件保存，工具负责组装格式包。多个下载通知独立取消，保存任务串行等待系统目录选择结束；提交前复核前台与取消状态，失败只清理本次创建的目标和临时目录。

`services/verified-release.ts` 与 `utils/resource-integrity.ts` 提供资源发布清单、字节完整性和原生文件处理。游戏资源、预览素材和工具绘图资源复用实际下载与校验入口，来源地址和资源解释由各包负责。

Phigros 成绩图的模板资源与构建入口位于 `plugins/tools/phigros/src/assets` 和 `plugins/tools/phigros/scripts`，构建脚本更新同包内的 UI 资源清单。应用壳的图片目录只保存原生图标、启动图与网站图标，游戏和来源图标由所属插件声明。

舞萌上传由 `plugins/tools/maimai` 的上传控制器管理唯一任务，任务拥有取消、前台等待和曲库等待；关闭弹层保留任务，显式取消或所选账号的数据源停用时终止。启动读取和写入前确认账号仍绑定，提交时复核捕获资格，来源重新启用不恢复旧任务。全部目标确认写入且完成页面刷新后才关闭当前上传弹层，失败或取消保留可重试状态。舞萌和中二同步引导由各自工具贡献，总体同步仍复用公共总览入口。

随机选曲工具共用 `RandomChartsPage` 与 `pickRandomItems`，曲池和筛选由所属工具及游戏模型决定。缺少成绩时可普通抽取并显示缺失值，启用成绩条件则等待对应数据。实力分析工具共用结论、推荐和成绩列表组件，算法与数据解释留在所属包，分析结果不持久化。

机厅搜索、地图、筛选与相关偏好属于 `plugins/tools/arcade-finder`。公共页面和距离计算使用 WGS84，原生地图边界处理坐标转换；页面焦点和前台生命周期控制请求，旧定位或查询结果不覆盖当前中心。格式解析、工具业务和地图服务不进入游戏适配器的页面分发。

## 诊断与行为验证

`services/runtime-diagnostics-recorder.ts` 是运行日志入口，日志数据库独立于业务事务。页面通过日志服务读取、清理和分享；普通诊断按文件队列提交，快照等待先前记录结束，临时分享文件按实际生命周期清理。数据源记录请求场景与公共错误类型，凭据和上游敏感正文不进入日志。

修改公共入口前先检查导出、调用方和同类实现。`apps/mobile/tests` 使用实际业务入口验证插件可用性、账号和凭据提交、查询取消、缓存清理后的迟到结果、单游戏备份事务及 UI 交互；`example-ui.test.tsx` 从适配器公开详情页消费工具贡献，验证实际导航和停用后的操作变化。游戏与来源测试分别验证真实身份、转换、评分、资源和错误差异。输入输出、持久化与外部副作用是行为边界，内部目录、函数名称和代码形状不是合同。
