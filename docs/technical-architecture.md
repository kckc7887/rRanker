# rRanker 技术架构

## 文档定位

本文描述当前仓库中实际运行的移动端工程。内容以 `apps/mobile` 的源码、`package.json`、Expo 配置、路由和测试为依据，不承担产品路线图或历史记录职责。

代码、配置、类型和测试是事实来源。修改工程结构、运行链路、数据流、持久化、生命周期、构建命令、CI 或平台限制时，必须同步更新本文。

## 技术栈与工程入口

| 项目 | 当前实现 |
|---|---|
| 应用目录 | `apps/mobile`，npm 工程，入口为 `expo-router/entry` |
| 运行框架 | Expo 54、React Native 0.81、React 19，启用 React Native New Architecture |
| 语言 | TypeScript 5.9，严格模式，`@/*` 映射到 `apps/mobile/src/*` |
| 导航 | Expo Router 6；根级 `Stack` + 五个 `NativeTabs` |
| 服务端状态 | TanStack React Query 5 |
| 本地状态 | Zustand 5 |
| 持久化 | Expo SQLite、`expo-sqlite/kv-store`、Expo SecureStore、受控文件目录 |
| 校验 | Zod 4、Vitest 单元测试、Jest Expo UI/合同测试、ESLint、TypeScript |

Node.js 最低版本由 `apps/mobile/package.json` 约束为 20.19；当前 iOS CI 使用 Node.js 22 和 `npm ci`。应用同时包含 iOS、Android 配置，Web 配置存在，但项目执行规范禁止启动 Expo Web。

## 路由与运行时装配

`apps/mobile/app/_layout.tsx` 是运行时装配中心：

1. 最外层安装 `AppLifecycleProvider`，将 `active`、短暂 `inactive`、后台和内存警告转成统一生命周期状态。
2. 启动阶段并行恢复主题、图标字体、SecureStore 会话和各类本地账号档案；准备完成前只渲染加载态。
3. 准备完成后安装 React Query、应用主题、全局通知和根导航栈。
4. 根部唯一 `useSyncAccountMetadata` 订阅当前账号结果；页面只读取。首帧交互结束后，根布局与账号列表通过 `hydrateAccountDisplayData` 共享缩略信息和本地 Rating 恢复，再执行存储维护。
5. 后台时暂停上传任务并取消查询；回到前台后产生新的可取消工作代次；内存警告时释放非活动 Query 和 Expo Image 内存缓存。

根栈承载主标签页、个人曲库、游戏管理、存储管理、个性化、歌曲详情、成绩图、谱面确认和 OAuth 回调等文件路由。主标签页位于 `app/(tabs)/_layout.tsx`，固定为总览、最佳、成绩、曲库、设置五项；各标签内部通过 `MainTabStack` 和 `CachedTabScreen` 保持导航及页面状态。

## 模块职责

| 目录 | 职责 |
|---|---|
| `app/` | 文件路由、页面级装配、导航参数边界 |
| `src/components/` | 通用组件及按游戏组织的容器/表现组件；跨游戏组件集中在 `game-content/` 等公共入口 |
| `src/domain/` | 游戏原始领域类型、统一稳定语义、纯函数、主题规则和注册表 |
| `src/features/` | 成绩图、谱面预览与下载、存储管理、工具箱等可组合功能族 |
| `src/hooks/` | React Query 查询、组合读取和页面数据适配 |
| `src/providers/` | 上游认证、请求、DTO 校验和 Provider 契约 |
| `src/repositories/` | 快照、曲库、资源和用户曲库的持久化接口 |
| `src/services/` | Provider 与仓库之间的业务编排、缓存加载、上传、账号切换和资源处理 |
| `src/state/` | Session、主题、筛选、生命周期、QueryClient 和界面状态 |
| `src/storage/` | SQLite/SecureStore/KV 具体实现及存储工厂 |
| `src/theme/` | 应用主题和主题色解析 |
| `tests/` | Vitest 纯逻辑测试、Jest UI 测试、结构哈希与字符串金样合同 |

## 游戏、Provider 与数据链路

`src/domain/game-bind-options.ts` 的 `GAME_OPTIONS` 是前台游戏与绑定方式注册表。当前可用板块包括舞萌 DX、中二节奏、Phigros、Phira、冰与火之舞、喵斯快跑、聚合展示的 osu!standard、osu!mania、osu!catch、osu!taiko，以及列表末尾的 Majdata Net。Provider 包括账号密码、OAuth、设备授权、公开玩家、本地账号和示例账号等形态；`test` 仍是类型层保留的空壳 GameId，不是当前选择器条目。账号分组消费同一注册表的顺序与家族能力，不另行维护游戏名单。

游戏、家族和查分器身份图标由该注册表静态导入 `assets/images/` 的 17 份包内资源，
随 Android/iOS 导出进入应用，首次离线启动不依赖图片下载。图标保留原尺寸、RGBA
像素和色彩信息；osu! 通用图标与 Majdata 保留 PNG，其余使用无损 WebP，Phira 保留
原始 ICC。Muse Dash 与 MuseDash.moe 使用相同图像，共用一份资源。
选择器、登录、账号分组和缺省头像/封面继续消费注册表；真实用户头像与歌曲封面仍走
原有远程资源路径。包内模块 ID 不进入 `RemoteImage` 的受控远程压缩缓存。

主数据读取链路为：

```text
文件路由 / 游戏容器
  -> 查询 Hook（useGameData 或游戏专属 Hook）
  -> Service 编排与缓存策略
  -> Provider / Repository
  -> 上游 HTTP、SQLite、SecureStore、KV 或受控文件目录
  -> 游戏原始模型
  -> GameContentAdapter 与展示适配器
  -> 共享页面和共享卡片
```

`useGameData` 是当前账号总览数据的中央编排点，会根据游戏、Provider、账号和会话模式分派到对应加载器。注册表和中央编排允许显式枚举游戏；可复用渲染核心不承担游戏查询，也不应通过 `gameId` 分支解释游戏语义。

每个游戏保留自己的上游 DTO、Zod Schema、缓存快照和计算规则。跨游戏稳定身份和展示语义通过 `domain/game-content.ts`、`features/game-content/presentation.ts` 及各游戏适配器输出；个人曲库继续使用既有 `ChartType`、`levelIndex` 和存储键，不由展示层改写。

### Majdata Net

`majdata-net` 在游戏、Provider、账号和存储管理注册表独立注册。`MajdataProvider`
通过公共 `requestJson` / `requestProviderResponse` 调用 `https://majdata.net/api3/api`；
登录提交用户名、MD5 密码与 `rememberMe=true` 表单。`HttpCookieSession` 按来源、路径、
安全标志和有效期生成 Cookie，请求禁用环境 Cookie。安全仓库只保存 Cookie，会话与账号
分别索引；不保存明文或 MD5 密码。`SecureSessionStore.upsertAccount(account, signal?)`
在取消时阻止或回滚账号索引写入，继续沿用既有安全凭据的串行变更、恢复和删除流程。
添加游戏、来源与账号入口共用包内 `assets/images/majdata.png` 图标。
`createMajdataBoundAccount` 统一各入口的账号资料；玩家头像来自
`account/Icon?username=<编码用户名>`，使用公共头像、缩略信息持久化与失败回退。
启动恢复包含所有已绑定 Majdata 账号，账号管理与切换共用分组；账密解绑依据 Provider
绑定能力生成。旧账号、Cookie、快照和用户曲库的持久化键保持兼容。

`useGameData` 调用 `majdata-service` 保存账号的玩家、最好成绩和 Recent 快照。总览
`DX · Classic` 为完整最好成绩列表 Σ(DX＋Classic) 的单值合计，合计后保留四位小数并附 `%`，
账号列表使用相同格式；离线从成绩快照重新计算。该值使用中性主题，不参与舞萌档位或星级计算。
筛选只影响成绩列表；单谱与难度详情只展示 DX 达成率。Recent 时间倒序、
保留重复游玩与上游实际字段。排名由 `useMajdataRanking` 按账号和歌曲共享查询，仅匹配
当前玩家、当前难度，已知 HASH 不同时不使用该排名。

`useMajdataSongs` 保留上游页码，每页 30 首，通过原始页长判断下一页；分页只在 React Query
会话中保存，只展示已加载数量。难度名称多选和线上标签多选各自取并集、两组取交集；
筛选后空页继续下一上游页，失焦后暂停自动续页。线上标签由 `tags` 与 `publicTags` 合并，
本地标签不参与筛选。筛选器每项独立横向行，收起和重置关闭展开的下拉。

详情与个人曲库通过同一资源仓库读取。`majdata-net:song:{id}` 保存当前元数据，
`majdata-net:song:{id}:{hash}` 保存修订；`chart:{id}:{hash}` 保存完整文本，
`parsed:{id}:{hash}:{level}` 保存共享 Chart 模型和六类物量，均有 `majdata-net:` 前缀。
首次详情优先返回本地缓存再刷新；刷新失败保留旧数据。抓取谱面后复核上游 HASH，避免把
新文本写入旧修订。歌曲请求代次、账号请求代次、取消信号和公共资源写入代次阻止旧请求回填。
清理器归属 Majdata 的数据和图片缓存，收藏、练习与标签仍在公共用户曲库仓库中保留。

舞萌与 Majdata 的列表、成绩卡、难度徽章、封面和收藏行使用 `game-content` 中同一实际
布局；游戏适配层提供原始难度字符串、可选类型徽章和右侧指标，不向共享渲染层增加游戏分支。
`MajdataSongDetail` 与舞萌详情共用 `SimaiSongDetailLayout` / `SimaiSongDetailStyles`，
包括封面文字与遮罩、返回/收藏按钮、安全区位置、元数据表、成绩区、物量网格和操作样式。
物量在转场后、当前可见难度启用请求；未加载时显示文字，成功后才绘制六列网格。
Easy 与 Phigros HD 复用公共蓝色主题。歌曲信息只含简介、线上标签和 HASH；歌曲、谱面
分别使用同一 `TagEditor` 保存各自标签，标题只由编辑器渲染一次。UUID 原样保存，
原始索引 0～6 映射到 `inote_1`～`inote_7`，排序为 5、4、3、2、1、0、6。
用户曲库仅用 `SD` 作为既有结构的内部兼容字段，不展示类型或据此构造资源地址。
预览路由为两种游戏组装资源与参数，Simai 运行时不构造 LXNS 或 Majdata 网络地址。

### Phigros 发布资源

`src/services/phigros-resources.ts` 的 `phigrosResources` 是曲库、定数、头像别名、
谱面确认和下载的唯一发布读取入口。`current.json` 每次检查使用缓存绕过参数；
修订或清单标识变化后读取同一发布的 manifest、catalog、物量表、定数表和可选头像别名。
指针可带 `manifestSha256`，旧指针仍可读取；资源实际字节必须符合清单大小与 SHA-256。
所有必需元数据完成校验后才替换会话对象，失败保留上次有效数据；曲库不落 SQLite 或文件。
`chapters.csv` 独立于游戏版本发布，不进入发布事务。曲库检查经 `refreshPhigrosCatalog` 调用
`getCatalog(signal, true)`，用缓存绕过参数校对会话中的章节副本；内容变化后重建章节映射。
校对失败保留上次章节，首次失败才回退游戏版本号。章节变化只替换曲库查询，不使成绩查询失效。
谱面、音乐和曲绘在使用时经同一服务校验，缺资源、404 或校验失败时强制重读发布信息并重试一次。
修订 URL 使用 `resourceVersion`；同一游戏版本重发也会更新地址。取消的旧事务不得提交，
并发消费者共享请求，其中一个取消不会取消其余消费者。
谱面确认与下载优先选择 `<songId>.0` 默认谱面目录，与发布的默认音乐保持一致；
兼容无编号目录和唯一编号目录。Random 等多变体歌曲不因存在其它编号谱面而被判为重复。
Phigros 预览页在资源准备前读取所选难度的编号谱面清单；多谱歌曲先通过公共
`AppNotification` 提供“继续播放谱面 / 查看里谱”，后者关闭当前弹窗后按数字顺序列出非 `.0` 谱面。
`usePhigrosChartVariantSelection` 在选择期间保持共享播放器壳等待，选择完成才启动资源准备及超时。
离开页面或进入后台会取消未完成读取并撤销弹窗。所选 `variantIndex` 经既有资源入口匹配同编号谱面
和优先使用的 `music/<songId>.<编号>.ogg`；清单未发布同编号音乐时使用歌曲共用的
`music/<songId>.ogg`。已声明的专属音乐下载或校验失败仍走发布恢复并报错，不替换为共用音乐。
默认预览与谱面下载保持原行为。

根布局的 `usePhigrosResourceSync` 在恢复选择完成并进入 Phigros 时调用
`refreshPhigrosCatalog`；总览手动同步复用同一入口。标签切换与普通前后台切换不触发额外检查。
查询通过唯一 QueryClient 去重，更新后替换曲库并使 Phigros 成绩查询失效。
成绩 Provider 的定数和 Best30 缓存、持久化成绩载荷均记录资源修订，避免沿用旧定数计算结果。
曲库刷新失败时保留列表并标记来源过期；预览、下载与手动同步继续使用各自既有错误出口。

## 状态、持久化与资源生命周期

- `state/session-store.ts` 保存当前游戏、账号、Provider、会话映射和运行时 Provider 实例；持久凭据由 `storage/secure-session-store.ts` 管理。
- `state/query-client.ts` 提供进程内唯一 QueryClient；账号最终数据使用 `services/game-data-query.ts` 的版本化键。
- SQLite 的进程内连接由 `storage/rranker-database.ts` 集中管理；`runDatabaseWrite` 串行化 schema 初始化、快照和用户曲库写入。批量清理以 500 个绑定参数分批，在同连接事务内执行；文本统计使用 UTF-8 字节，数据库分配页单列。表结构和个人数据键不变。
- 缓存读取优先走本地首屏、后台刷新和 AbortSignal 取消链路。共享任务按消费者计数取消；清缓存先提升游戏写入代次并取消/移除 Query，解绑只失效所属账号。后台刷新及实际 SQL 提交前复核游戏/账号代次，旧结果不能重新填回缓存。短暂 `inactive` 与普通后台不会被当作内存压力；只有内存警告触发非活动 Query 和图片内存释放。`CachedTabScreen` 在这些状态下保持已挂载画面，只通过 active context 暂停重工作。
- `RemoteImage` 统一远程图片加载。受控压缩缓存是 v3，总预算 10 MiB、单项上限 10 KiB；列表项达到 50% 可见并持续 250 ms 后才允许持久化。在线原图仍作为主加载源，缓存文件只作本地回退。失活只暂停落盘，不把已显示 source 置空。可见性通过条目级订阅通知，保持列表 renderItem、extraData 和窗口参数稳定；等价 URL/请求头/cacheKey 不触发图片缓存重查。
- 存储管理通过 `GAME_STORAGE_ADAPTERS` 统一统计和清理各游戏资源。显示的可清理范围与实际删除范围必须使用同一适配器和缓存策略；不得直接清空整个 Expo `Paths.cache`。

最佳列表共用 `BestListPage` 的分组列表入口。分组标题和尾部在 React Native 可见性
转换中仍会经过键提取器，共享入口按分组对象身份保护提取器，并在图片订阅和业务回调前
移除非条目事件。弱引用身份表兼容分组更新后的迟到回调，真实条目的键、分组布局、
列表窗口与图片持久化门槛保持一致。

## 设置诊断与日志

设置页的“诊断”进入 `app/diagnostics.tsx`，提供手动日志开关、1000/2000/5000 条容量选择、
最近两份记录的独立分享。页面分为记录控制与最近日志，开关使用个性化曲绘开关相同的
主题色；记录状态依据当前记录与失败状态显示，不以开启偏好代替实际记录状态。
日志沿数据库创建顺序标记最新记录、上次记录，独立展示状态、本地秒级时间和保留条数。
每份日志分享自动附带简要诊断；无日志且加载成功时，空态提供“分享诊断信息”，
调用 `exportRuntimeDiagnostics()`，没有独立的底部导出区。容量默认 2000 条，开关默认关闭，两者通过
公共偏好工厂保存。开启期间不能修改容量；开启后持续生效，直到用户手动关闭。
每次应用启动先将未结束记录恢复为“已中断”，再按保存的开关决定是否创建一份新日志，
包含当前记录在内始终只保留最近两份。重复初始化、页面卸载和前后台切换不创建新记录。
页面按压复用 `DetailGestureRoot` / `DetailPressable`，通知复用 `AppNotification`；
操作期间禁用重复动作，加载与失败不显示无日志空态，保存失败保留重试入口。
手动关闭保存关闭状态并结束当前记录；“已中断”不等于发生崩溃。

`services/runtime-diagnostics-recorder.ts` 是事件与错误的唯一采集入口。现有生命周期、
内存、任务与页面内容事件分发给简要诊断和手动记录器；路由模板、公共 HTTP 结果、
查询/变更错误、公共预览与导出错误只进入开启的手动记录。简要诊断继续保留最近三次
启动、总计 256 条白名单事件，并由 `exportRuntimeDiagnostics()` 导出。

简要诊断正文由 `runtime-diagnostics.ts` 在既有串行队列中读写
`Paths.document/rranker-runtime-diagnostics.json`。有效正文优先；不存在或损坏时依次读取
同目录 `.previous` 完整副本、缓存目录中的同名正文。写入先完成 `.pending` 暂存，
再保留有效正文并提升暂存文件，成功后回收副本；未提交暂存不参与读取。读取、部分写入
或替换失败后仍可恢复记录，重复初始化不会创建重复会话。公共缓存策略精确保护待迁移
的 JSON，启动维护与手动清理不会提前删除它，共享缓存与清理前后物理统计均排除它，
迁移不计为释放空间。正文计入文档目录占用，TXT 分享副本仍写入 `Paths.cache`，
沿公共临时文件规则清理。

手动事件补充发生时的路由模板，模板来自 `useSegments`，支持 `b50` 等带数字的
固定路径及动态参数占位符，不读取路由参数。公共 HTTP 选项的 `diagnosticScenario`
由调用处明确指定曲库、玩家查询、发布清单、谱面、音乐、曲绘等受限场景；不解析完整
地址推导场景。`request-start` 与每次尝试的 `request` 共享进程内递增的 `operationId`，
结果包含尝试次数、单次耗时、状态码和归一化错误码，取消与超时分开记录。

公共谱面壳按每轮准备关联准备结果、加载完成和播放器桥接就绪；同一内容代次的重复
阶段只记录一次，取消后的迟到结果不记成功，旧内容回调不写新代次日志。成绩图公共壳
记录预览加载和就绪，公共控制器关联权限、等待画布、捕获、保存与最终结果，页序号
从 1 开始。`operation.durationMs` 是自本次操作创建起的累计耗时；内容挂载、加载完成、
桥接就绪均不证明实际播放或音频正常。本链路不采集逐帧状态、图片正文及桥接设置。

`storage/rranker-database.ts` 管理独立的 `rranker-runtime-logs.db` 连接；Schema 初始化
经过 `runSerializedSchemaInit`，记录事务不共享业务数据库。`RuntimeLogRepository`
同步增量写入、裁剪每份最早事件，并在成功创建记录的同一事务中保留最近两份。
正文不进入可清理缓存目录；应用版本、构建号和平台保存在记录上下文中，不随事件裁剪丢失。
上下文还包含系统版本、运行环境和开发模式。构建号优先取当前 Constants 原生平台
字段，缺失时取 Expo 配置，并以 `buildVersionSource` 区分 `native`、`config` 和 `unknown`；
当前 Android Constants 原生平台对象为空，通常使用配置来源，不能据此证明实际安装包构建号。
追加事务成功后控制器增量更新条数和最后时间，避免逐条重查列表；创建、恢复和停止时
从数据库刷新列表，失败事件不计入已保存数量。
保存失败暂停当前记录，保留已提交内容与开启偏好；用户可重试，下次启动仍按开启偏好
创建新记录。不会将日志失败再送入日志；关闭偏好保存失败时保持原记录和开关状态。

异常入口根据实际运行时开关选择 React Native 异常监听或保留原处理器的 ErrorUtils
包装，根路由错误边界补充渲染错误并显示可重试文案。关闭时不写手动日志。
错误摘要由类别生成，堆栈只保留源文件名和数值位置，最多 30 帧、单条最多 8 KiB。
不序列化任意错误对象、账号资料、请求正文、完整地址或查询参数。

`shareRuntimeLog(id)` 在第一次异步等待前生成该记录的文本快照，不停止记录；仅用户
点击时调用系统分享。临时文本使用 `rranker-` 缓存前缀，由现有共享缓存规则回收。
JSON 文本包含 `formatVersion: 1`、session、context、entries、`snapshotAt` 和
`summary`：数据库序号对应累计成功保存条数，减去保留条数得到裁剪数量；时间范围和
类型统计只计算快照保留的事件。统计及正文在第一次异步等待前固定，无须迁移表或
清空旧记录。统计不推断崩溃原因。
日志分享在固定所选日志后立即调用 `snapshotRuntimeDiagnostics()`，通过简要诊断的
同一串行队列排入读取，隔离随后到来的事件；返回的独立对象以 `diagnostics` 字段
附在导出文件中，不合入所选日志的事件或统计。文件完成后才打开分享面板。
无日志时的 `exportRuntimeDiagnostics()` 复用同一快照入口，仅导出简要诊断。
两种分享均在操作期间防止重复调用，结束或失败后解除锁定；失败经页面通知提示重试。
应用日志不能提供原生崩溃或系统内存终止的完整报告，也不能保证进程终止瞬间的事件落盘；
系统分享、前后台和异常结束恢复仍需 iOS/Android 真机验收。

## WebView 与文件型功能

- 谱面确认由 `features/chart-preview-shared/` 提供 React Native 壳、资源暂存、桥接、注入工厂和播放时钟；游戏目录只提供解析、资源计划和配置。每次预览仍使用独占 session 目录；远程 `url+bytes` 资产可先写入 `Paths.cache` 下 `rranker-` 前缀目录（大小匹配则跳过下载），再写入 session。舞萌皮肤在 session 内编码为 `skin-data.js` data URL，播放器不通过 `file://` 直接读 PNG；该文件随共享缓存一并统计和清理。
- 谱面下载由 `features/chart-download-shared/` 统一处理临时目录、取消、进度、文件名和保存位置，游戏功能负责组装具体资源。`useChartPackageDownload.start` 可接收 `optionalVideoUrl`，将视频可用性检查、选择与下载放在同一重复点击锁、超时与取消生命周期中；后台、卸载和取消后的迟到结果不能再弹窗或启动下载。
- Phigros 谱面确认先通过 `loadPhigrosChartPreviewResources` 下载并验证谱面、音乐和曲绘，再将文本和 Base64 交给既有预览暂存计划；准备阶段超时为 120 秒。Phira 兼容下载对 Phigros 资源使用同一校验与重试入口，下载本身仍委托 `downloadChartResource`，校验通过后才组包。发布端缺音乐时客户端不能补出音频，必须修复发布内容后完成真机播放和导入验收。
- 成绩图由 `features/best-image/` 统一处理偏好、资源、WebView 状态、预览、导出和共享屏幕控制器；预览轮播同一时刻只挂载当前 WebView 页面。
- 上述功能涉及 WebView 内容进程、文件选择、相册权限、原生手势和大图内存，自动化测试不能替代真机验收。

### Simai 谱面确认内核

`features/simai-chart-preview/configuration.ts` 是注入层与播放器的配置类型来源。
`chart-preview-inject.ts` 保留原导出，设置存储、页面桥接和 LXNS 谱面/音乐入口继续使用
既有公共链路；普通难度和 Buddy `inote_2` / `inote_102` 使用同一解析器。

舞萌与 Majdata 的 Simai 语义集中在 `features/simai-chart-preview/engine/`：`SimaiParser` 输出带来源位置、实际时间、HS/SV、
Each 分组和分支/分段的音符模型；`prepareChart` 预计算路径与判定事件；`buildFrame`
按指定实际时刻生成有序绘制命令；`MainRenderer` 用 Canvas 2D 执行贴图、三切片与遮罩。
解析基准是 MajSimai 2.2.2 锁定 commit，表现数据来自本地 MajdataViewX。
滑条各段书写时长保存在模型；播放按 ViewX 的合并路径总时长与路径长度分配视觉速度。
`ScrollTimeline` 只影响视觉位置，音乐、正解音、结束和判定使用实际时间。
播放器通过共享 `PlaybackClock` 重建暂停、跳转和变速状态；变速/跳转取消旧正解音调度。
`webview-player/timeConversion.ts` 的 `resolvePlaybackRange` 将各侧实际谱面时长按主谱引导拍
对齐，再与解码音频结束位置取较晚值；音乐转换包含 `firstMs`、偏移和 BPM 事件。
终点、进度条、拖动、小节跳转与背景共用这一范围，不能仅由 Simai 小节数决定结束。
音频自然结束后公共时钟继续驱动剩余谱面；达到播放终点且音源已自然结束才停止。
音频不可用或从音乐结束后开始播放时使用帧时间推进；暂停、跳转与退出仍释放旧音源和时钟。
Simai 预计算位置、Each/Slide 分组和开始、结束、烟花事件索引，保留相同时刻的原始顺序；
SV 为零、负值和非单调时继续做完整可见性判断。RPE 原地稳定压缩活动数组，保持绘制层次
及内部顺序，不调整音频时钟、帧率、判定或特效。

皮肤清单保存 SHA-256、尺寸与透明边界；缓存文件名包含资源修订，正解音文件名包含
内容哈希。仍由共享计划执行器按大小检查缓存及落盘，通过 `skin-data.js` 注入 PNG。
`skinSemantics.ts` 解释语义名、S3 别名、默认 100 PPU、显示尺寸覆盖、中心锚点及切片/朝向；缺少必需贴图
或尺寸不匹配时阻止播放。线上对象不因命名修正而变化。
粉色开关经同一帧命令入口替换普通单星和双星，使用 S3 原始粉色贴图；1254 像素单星
按原单星显示尺寸绘制。Each、Break、Mine 与 EX 专用贴图不参与替换。
图片缓存和视频共用等比完整容纳、居中和圆形裁剪的背景入口；圆直径等于方形画布边长，
背景底色为纯黑，保留 45% 暗化；背景遮罩不裁剪音符和判定层，画布尺寸变化使图片缓存失效。
打击特效跳过星型贴图，保留非星型图层及独立烟花；HOLD/TOUCH HOLD 持续粒子使用
Each 金色。Slide 不区分判定时使用六种方向的 `just_*_p.png`，区分模式保留原提示及 Break 闪烁。
判定区使用应用内原始 `assets/maimai-chart-preview/sensor.webp`，经共享计划暂存后写入
同一 `skin-data.js`。舞萌渲染器按原图图案中心与 197 PPU 校准判定区；判定点和判定线
按 S3 `outline.png` 的点径、线宽绘制，坐标复用音符的 `buttonPoint`，判定区叠加同一判定线。

独立参考程序位于 `apps/mobile/scripts/maimai-reference/`；原始 C# 路径输出和
MajSimai 输出作为 TypeScript 测试的外部基准。素材审计和浏览器截图位于本地被忽略的
`apps/mobile/build/`。语法范围、素材映射、复现命令与验收限制见
`docs/maimai-chart-preview.md`。八张 ViewX 内置特效贴图及其层级由
`effectSprites.generated.ts` 随播放器加载，皮肤仍通过 S3/`skin-data.js` 加载。
特效生成器经 `scripts/lib/recompress-png.mjs` 只重压缩 PNG 的 IDAT，保留其它块、
像素与色彩信息，并重算 CRC；`sourceSha256` 对应原始 PNG，`sha256` 对应内嵌内容。
`scripts/generate-maimai-geometry.mjs` 将路径表的重复数值编码为字典索引，生成模块
初始化时原地还原 `SLIDE_TABLE` / `AREA_LOOKUP`，随后释放字典引用；不改变数值精度。
`maimai-generated-data.test.ts` 校验全部路径/区域数据、场景定义、PNG 块与解码像素。
烟花 Shader 使用 Canvas 预计算颜色贴图和径向遮罩；Unity 画面对照与原生平台仍待验收。

## 开发、测试与构建

所有 npm 命令在 `apps/mobile` 执行：

完整单元测试使用 Node.js 22.13 或更新版本；日志事务测试通过内置 `node:sqlite`
运行真实内存数据库，CI 的 Node.js 22 满足该要求。

```powershell
npm ci
npm run lint
npm run typecheck
npm run check:architecture
npm run check:generated
npm run check:lossless-assets
npm run test:unit
npm run test:ui
npm test
```

`npm run test:unit` 使用 Vitest 运行 `tests/**/*.test.ts`；`npm run test:ui` 使用 Jest Expo 串行运行 `tests/**/*.test.tsx`。公共 UI 还由 Host Tree/Style 哈希、HTML/脚本字符串金样和虚构游戏合同保护，禁止仅更新基线来接受未解释差异。

应用类型检查与独立播放器检查共同组成 `npm run typecheck`：
`tsconfig.maimai-player.json` 覆盖 Simai 引擎/入口，`tsconfig.phigros-player.json` 覆盖
Phigros/Phira 及 RPE 入口。播放器源码改动后分别运行 `npm run build:chart-preview`
或 `npm run build:phigros-chart-preview`；两者共用 `scripts/lib/build-preview.mjs`。
`npm run check:generated` 不写文件，从源码重新构建并验证 HTML、player.js、player.bundle
与交付产物一致。打包成功不代表手机 WebView 播放验收通过。

`npm run benchmark:optimization` 与固定基线比较完整 Simai 帧命令和 RPE Canvas 绘制
命令，覆盖跳转、暂停、变速、镜像、长 Hold、连接 Slide、Each、Mine、Break 和非单调 SV；
另测 6000 音符场景的 CPU 分布与 5000 首/20000 成绩搜索。Phigros 搜索通过
`indexSongsById` 一次建立曲库索引，保留首次匹配、别名、排序和筛选合同。
结果写入被忽略的 `build/optimization-performance.json`，包含基线/候选 SHA 和工作区状态。
测试中的请求数、数据库调用数和条目重绘次数是受控测量，不代表真机帧率。

本地原生命令包括 `npm run android`、`npm run ios`、Android prebuild 与 APK 脚本。Release、APK、EAS 或原生构建成本较高，只有用户明确要求时才执行；修改原生/Fabric/WebView 行为时，JS 测试通过也不能代替对应平台构建和真机验证。

### 生产包体积约束

`metro.config.js` 保留 Ionicons 字体子集映射，并只在 iOS/Android 将当前安装的 Zod
内部 `v4/locales/index.js` / `index.cjs` 解析到 `src/utils/zod-locales.ts`。
该模块仅导出默认英文语言；Zod 自身的初始化、Schema 与错误类仍使用原库。
二维码服务只导入 `jpeg-js/lib/decoder.js`，其类型引用 jpeg-js 自身声明。
不启用实验性全局摇树，也不把未引用的参考素材或测试文件算作包体积收益。

`plugins/with-android-abi-splits.js` 在顶层 `android {}` 插入 ABI 分包配置，并通过
Gradle properties 启用 Release R8 与资源裁剪，将默认 ProGuard 文件设为
`proguard-android-optimize.txt`。自定义保留规则、签名与 Hermes 配置继续由原生工程
决定。插件可重复应用；已有本地原生目录须先运行 `npm run prebuild:android` 才能
获得更新配置，直接执行 `apk:release:abi` 不会自动运行 prebuild。

双端体积检查使用 `npx expo export --platform android --platform ios --source-maps
--dump-assetmap --output-dir build/size-audit --max-workers 4`，不启动 Expo Web。
统计主程序 Hermes、独立播放器和按实际内容 SHA-256 去重的导出资源，source map 不计入交付体积。
播放器已经包含在资源合计内；gzip 只作压缩参考，不代表 APK/IPA 或安装体积。
Android R8 收益必须通过相同 ABI 的原生 Release 包验收，iOS 需 macOS 出包验收。

`npm run check:lossless-assets` 对照固定基线核验已改 PNG；优化器只选择更小的 IDAT
压缩流，CRC、解压扫描线、RGBA/透明度和全部非 IDAT 块必须保持一致。原始来源 hash
与生成 hash 分别保留。基线中不存在的新增 PNG 单独验证 CRC 和完整解码，在报告的
`addedFiles` 中列出，不计作基线无损比较或压缩收益。仓库素材减少不直接等于导出收益，
导出中未引用素材不计入收益。

`.github/workflows/build-ios.yml` 在每次 push、PR 创建/更新/重新打开及手动触发时运行：Ubuntu 质量任务运行 lint、typecheck 和全部测试；macOS 任务读取版本、向 App Store Connect 查询下一构建号、执行 Expo prebuild、安装 Pods 与签名材料、Archive、导出 IPA，先上传保留 14 天的 Actions artifact，再提交 TestFlight。来自外部 fork 的 PR 只运行质量任务，跳过需要仓库签名密钥的 macOS 任务。同仓库 PR、push 和手动触发均执行完整构建与上传流程；这些流程共用串行并发组。Windows 本地无法证明 Xcode Archive、签名、上传或 TestFlight 处理成功。

`.github/workflows/build-android.yml` 在每次 push、PR 创建/更新/重新打开及手动触发时运行：Ubuntu 质量任务运行
lint、typecheck 和全部测试；构建任务使用 Node.js 22、Temurin JDK 17 与 Android SDK，
执行 `npm ci`、`npm run prebuild:android` 和 Gradle `:app:assembleRelease`。
prebuild 复用 `plugins/with-android-abi-splits.js`，一次生成 `armeabi-v7a`、`arm64-v8a`、
`x86`、`x86_64` 四份 APK。版本与构建号分别读取 `app.json` 的 `expo.version` 和
`expo.android.versionCode`，不自动递增。工作流检查 Gradle 输出清单、APK 内部 ABI、
Manifest 包名与版本及 APK 签名，全部通过后按 `rRanker-版本(构建号)-ABI.apk` 复制到
`apps/mobile/build/android-apks/`，上传为保留 14 天的 Actions artifact。
当前沿用 Expo 生成工程的默认调试密钥签名，属于 Release 模式测试安装包；流程不发布
GitHub Release 或上传应用商店。实际云端构建与真机安装需运行工作流后验证。
