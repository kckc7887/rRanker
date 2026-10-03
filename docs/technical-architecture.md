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

Node.js 最低版本由 `apps/mobile/package.json` 的 `engines` 约束为 22.13；CI 的 Node.js 22 与 `npm ci` 满足该要求。应用同时包含 iOS、Android 和 Web 配置，Web 行为不能代替移动端原生验收。

## 路由与运行时装配

`apps/mobile/app/_layout.tsx` 是运行时装配中心：

1. 最外层安装 `AppLifecycleProvider`，将 `active`、短暂 `inactive`、后台和内存警告转成统一生命周期状态。后台中止前台 AbortSignal；从后台经 inactive 回到 `foreground-ready` 时在同一转换中重建信号并提升前台代次，短暂 inactive 本身不中止、不换代。交互队列中的过期恢复回调不能替换当前信号或代次。
2. `useAppStartup` 并行恢复主题、图标字体和账号；准备完成前只渲染加载态。主题读取等待最多 1.5 秒，未完成的读取仍归唯一写入协调器管理，界面可以继续启动。`services/account-restoration.ts` 统一安全会话、可选账号档案和旧默认本地玩家快照迁移，真实本地 Rating 延后读取。可选来源公开独立读取状态，失败时保留已加载账号并继续恢复其他来源；本地目录读失败时不从旧快照重建档案。调试偏好同时恢复，但不阻塞主界面；恢复前示例添加入口关闭。
3. 准备完成后安装 React Query、应用主题、全局通知和根导航栈。
4. 根部唯一 `useSyncAccountMetadata` 在独立的 `AccountMetadataObserver` 中订阅当前账号结果，与主题和导航子树并列；查询通知不触发根导航重渲染，导航主题按应用主题记忆。页面只读取。`useAppRuntime` 在首帧交互结束后通过 `hydrateAccountDisplayData` 与账号列表共享缩略信息和本地 Rating 恢复，存储维护每次挂载执行一次。
5. `useAppRuntime` 统一路由记录、前后台与内存联动：后台暂停上传任务、主题偏好重试并取消查询；前台恢复等待该次查询取消结算，再经 `resumeInterruptedActiveQueries` 恢复仍活动、启用且处于 pending/idle 的未完成首查，不重取已有缓存、错误或正在读取的查询，旧前台恢复回调在再次离开前台后失效。前台同时触发主题补写、失败账号来源重读和待保存凭据补写。每个前台代次恢复一次展示数据，任务被短暂 inactive 取消后可以重新排队；只有内存警告释放非活动 Query 和 Expo Image 内存缓存。

根栈承载主标签页、个人曲库、游戏管理、存储管理、个性化、歌曲详情、成绩图、谱面确认和 OAuth 回调等文件路由。主标签页位于 `app/(tabs)/_layout.tsx`，固定为总览、最佳、成绩、曲库、设置五项；各标签内部通过 `MainTabStack` 和 `CachedTabScreen` 保持导航及页面状态。

成绩与曲库两个标签页只做「按当前游戏挂载对应页面」：舞萌专属页（`src/screens/maimai/MaimaiRecordsScreen.tsx`、`src/screens/maimai/MaimaiCatalogScreen.tsx`）自带本游戏的查询、筛选 Store、搜索索引与派生链，其余游戏沿用各自 `screens/*Screens.tsx` 或页面组件；未接入的游戏落到空态。共同路由负责页面装配，各游戏页面负责自己的派生链。

`utils/search.ts` 的搜索文档首次读取文本时才生成假名和罗马音，空关键词浏览不承担全曲库转写；关键词变体只缓存最近一个词，同次筛选复用。Phigros 成绩页的标题与惰性搜索文档独立保存；Rizline 按歌曲对象复用惰性搜索文档，曲库索引和成绩排序只随输入变化更新。`loadAliasedCatalog` 并行读取曲库和可选别名，别名失败仍保留曲库。各游戏查询和 `useUserLibrary` 在驻留页失活时以 `notifyOnChangeProps: []` 暂停通知，激活渲染读取最新缓存；根部元数据订阅保持活动。`useBoundedQueries` 只为已领取明细建立观察者，加载、重试与重取共用队列：Muse Dash 为 6 路，未启用相关筛选时不建立明细查询；osu! 详情成绩为 4 路。

歌曲详情统一为 `/songs/[songId]`：`src/domain/detail-target.ts` 的 `decodeDetailTarget(activeGameId, params)` 把 URL 参数解析成已校验的 `DetailTarget`（舞萌带 `chartType` + `levelIndex`；Phigros/中二/Majdata/Rizline/Muse Dash 用难度索引；Phira 用谱面 ID、TUF 用关卡 ID、osu! 四模式用 `beatmapsetId` + 可选 `beatmapId`/`scoreId`，并按游戏拒绝越界或跨游戏槽位）。显式 `gameId` 决定目标游戏，旧链接回退当前游戏；`app/songs/[songId].tsx` 在跨游戏时复用账号选择入口，切换成功后继续原目标，取消时不挂载错误游戏的详情，解析失败显示统一空态。共享卡片的 presentation 携带 `DetailTargetRoute`，跳转经 `detailTargetHref(route)` 生成；`encodeDetailTarget(target)` 总是携带 `gameId`。

总览路由负责页面编排，`features/game-content/adapters/overview-presentation.ts` 将各游戏载荷转换为评分卡展示参数；舞萌与中二的收藏展示分别由 `MaimaiOverviewPins`、`ChunithmOverviewPins` 承载，共享评分卡不识别游戏。
歌曲路由中的舞萌业务由 `components/maimai/MaimaiSongDetail.tsx` 管理，包括难度选择、个人曲库动作和成绩展示。
`app/best-image.tsx` 只做游戏分派，舞萌页面位于 `screens/maimai/MaimaiBestImageScreen.tsx`；筛选与分页由 `use-maimai-best-image-filters.ts` 派生，包内素材、封面和导出资源由 `use-maimai-best-image-resources.ts` 管理。页面继续复用公共成绩图控制器、屏幕壳与导出会话；详细曲库、封面和素材共同决定预览资源代次。

## 模块职责

| 目录 | 职责 |
|---|---|
| `app/` | 文件路由、页面级装配、导航参数边界 |
| `src/components/` | 通用组件及按游戏组织的容器/表现组件；跨游戏组件集中在 `game-content/` 等公共入口 |
| `src/domain/` | 游戏原始领域类型、纯函数、主题规则、注册表、详情定位与刷新/快照契约；网络与发布 I/O 编排留在 `src/services/` |
| `src/features/` | 成绩图、谱面预览与下载、存储管理、工具箱等可组合功能族 |
| `src/hooks/` | React Query 订阅、组合读取和页面数据适配；非 React 的选项、确保读取与刷新放在服务层 |
| `src/providers/` | 上游认证、请求、DTO 校验和 Provider 契约 |
| `src/repositories/` | 快照、曲库、资源和用户曲库的持久化接口 |
| `src/screens/` | 游戏页面组件（页面文件名在架构模块登记表中声明游戏归属）与共享的账号、存储管理页面；舞萌专属列表页位于 `screens/maimai/` 子目录 |
| `src/services/` | Provider 与仓库之间的业务编排、缓存加载、上传、账号切换和资源处理 |
| `src/state/` | Session、主题、筛选、生命周期、QueryClient 和界面状态 |
| `src/storage/` | SQLite/SecureStore/KV 具体实现及存储工厂 |
| `src/theme/` | 应用主题和主题色解析 |
| `tests/` | Vitest 纯逻辑测试、Jest UI 测试、结构哈希与字符串金样合同 |

## 游戏、Provider 与数据链路

`src/domain/game-bind-options.ts` 的 `GAME_OPTIONS` 是前台游戏与绑定方式注册表，`GameId` 则只有 `SUPPORTED_GAME_IDS`（maimai、chunithm、phigros、phira、adofai、musedash、majdata-net、rizline）、`OSU_MODE_GAME_IDS`（osu-standard、osu-mania、osu-catch、osu-taiko）与 `RESERVED_GAME_IDS`（test）这三份列表一个来源，`GAME_IDS` 由三者拼接，各注册表与登记校验都从它派生；`test` 是类型层保留的空壳 id，不在 `GAME_OPTIONS` 里。注册表的登记顺序为舞萌 DX、中二节奏、冰与火之舞、喵斯快跑、Phira、Phigros、osu! 四模式（家族 `familyId: 'osu'`，anchor 之外的三个成员 `hiddenInPicker`）、Majdata Net、Rizline，账号列表顺序另由 `accountOrder` 决定（舞萌 0、中二 1、Phigros 2、Phira 3、冰与火之舞 4、喵斯快跑 5、osu! 四模式 6～9，未指定的按注册顺序追加）。Provider 包括账号密码、手机号验证码、OAuth、设备授权、公开玩家、本地账号和示例账号等形态；账号分组消费同一注册表的顺序与家族能力，不另行维护游戏名单。
`src/domain/game-registry.ts` 的 `gameRegistrationSnapshot` / `gameRegistrationIssues` / `assertGameRegistryComplete` 是登记校验入口，由 `game-registry.test.ts` 与 `game-registry.type-check.ts` 覆盖：正式游戏必须有添加入口、展示资料与工具箱登记，保留测试 id 不得进入添加入口，添加入口不得引用未登记的查分器或未定义的游戏 id，同一查分器不得在不同游戏登记不同绑定方式。`GAME_DATA_LOADERS` 的穷尽性由 `Record<GameId, GameDataLoader>` 在编译期保证。

游戏、家族和查分器身份图标由该注册表静态导入 `assets/images/` 的 18 份包内资源，
随 Android/iOS 导出进入应用，首次离线启动不依赖图片下载。图标保留原尺寸、RGBA
像素和色彩信息；osu! 通用图标、Majdata 与 Rizline 保留 PNG，其余使用无损 WebP，Phira 保留
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
  -> features/game-content/adapters/ 的展示适配器（present*）
  -> 共享页面和共享卡片
```

`useGameData` 是当前账号总览数据的中央编排点，会根据游戏、Provider、账号和会话模式分派到对应加载器。分派经 `src/services/game-data-loaders.ts` 的 `GAME_DATA_LOADERS` 注册表执行（`Record<GameId, GameDataLoader>` 穷尽映射，遗漏任一游戏即编译失败，没有默认舞萌回退），各游戏加载器保留自己的缓存读取、快照装配与展示转换；Hook 只负责查询键、查询选项、端口注入与后台句柄登记。加载器构造数据包时经 `domain/game-data.ts` 的 `gameDataBundle(bundle)` 约束「游戏身份 + 载荷」，`GAME_PAYLOAD_KIND_BY_GAME_ID` 是 `satisfies Record<GameId, …>` 的载荷 kind 穷尽映射。注册表和中央编排允许显式枚举游戏；可复用渲染核心不承担游戏查询，也不应通过 `gameId` 分支解释游戏语义。

认证与账号请求使用 `providers/http-json.ts` 的公共执行器：原生传输使用 Expo Fetch 流，
实际正文默认限制 64 MiB，读取 JSON、文本和字节使用同一预算；`onResponse` 仅在状态、
正文与 Schema 均通过后执行并等待。凭据请求禁用自动重定向与环境 Cookie，并检查服务来源。
LXNS 使用 PKCE；LXNS 与 osu! 的 state 均为非空单字符串、有效 10 分钟，读取、消费与发起
授权串行，消费 pending 后才发送 token POST；并发或迟到回调不能复用或删除新 pending。
换码与轮换 POST 只尝试一次，token 正文最多 256 KiB。授权准备、浏览器打开、回调验证、
远端拒绝、构建配置、安全凭据与本机索引失败通过公共类型和固定文案区分，不显示原始异常。
账号持久化仍使用既有绑定服务和安全仓库，Session Store 只发布内存视图。Phigros 账号恢复以安全仓库中的账号 ID 关联凭据，玩家昵称只作展示名；昵称更新不会改变账号 ID 或断开会话。

osu! 多模式绑定先完成全部模式验证，再取 Provider 最终会话，经
`SecureSessionStore.upsertAccounts(accounts, { activeAccountId, signal?, assertCurrent? })` 单次合并提交；
共享凭据只写一次，首个所选模式在磁盘与内存同时激活。重新授权由 `setOsuBinding`
更新全部仍关联该凭据的会话、所选账号元数据与 Provider 缓存，再一次发布活动视图。
落雪绑定的 `signal` / `assertCurrent` 贯穿请求、快照与同一批量保存入口；索引写入及其
后置守卫通过定义为提交完成，此前取消回滚，此后退出保留绑定并停止激活、清理与通知等页面动作。
落雪回调页的 `useFocusEffect` 在失焦和卸载时撤销请求，复用登录面板在隐藏或卸载时撤销。

Phigros 授权、身份交换、存档列表和二进制存档读取通过 `providers/phigros-auth.ts` 消费公共 `requestJson` / `requestBytes`，统一超时、取消、错误分类与安全日志。授权等待与减速仍由既有轮询处理，公共 HTTP 不额外重试；认证请求禁止重定向并省略环境凭据，公开存档下载保留 CDN 重定向与既有大文件能力。
Phigros 云存档加载由 `services/phigros-game-data-service.ts` 的 `loadPhigrosGameData` 执行：
首次查询检查快照与发布修订是否兼容，离线可返回旧快照；显式同步重新读取云存档。
七路元数据读取与头像解析完成后复核取消、账号/游戏写入代次及发布修订，实际快照提交前再次复核。
`domain/game-data.ts` 的 `phigrosPayloadFromSnapshot` 为真实与示例账号生成相同展示结构。
Hook 拥有 Query Key、查询选项与后台句柄登记，发布、读取其它实体与失效经查询适配层端口，服务不依赖 Hook。

每个游戏保留自己的上游 DTO、Zod Schema、缓存快照和计算规则；投影到共享 `ScoreRecord` 只在自己的领域层做一次显式转换（如 `domain/phigros.ts` 的 `PhigrosScoreRecord` 与 `phigrosSharedScoreRecord`）。展示语义通过 `features/game-content/presentation.ts` 的 presentation 类型与 `features/game-content/adapters/` 的 `present*` 适配器输出；`domain/game-content.ts` 只保留物量分组展示形状 `GameNoteValue` / `GameNoteGroup`。详情页定位经 `domain/detail-target.ts`。个人曲库继续使用既有 `ChartType`、`levelIndex` 和存储键，不由展示层改写。
个人曲库入口由 `domain/user-library.ts` 的 `libraryDetailTarget(target)` 生成游戏专属 `DetailTarget`，再交给 `encodeDetailTarget` 与 `detailTargetHref`。舞萌保留类型槽位，其余游戏只输出各自定位参数；没有详情能力的目标禁用跳转。

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
本地标签不参与筛选。难度通过带难度色的横向按钮直接多选，保留原始 0～6 索引；
筛选器每项独立横向行，收起和重置关闭展开的下拉。

详情与个人曲库通过同一资源仓库读取。`majdata-net:song:{id}` 保存当前元数据，
`majdata-net:song:{id}:{hash}` 保存修订；`chart:{id}:{hash}` 保存完整文本，
`parsed:{id}:{hash}:{level}` 保存共享 Chart 模型和六类物量，均有 `majdata-net:` 前缀。
首次详情优先返回本地缓存再刷新；刷新失败保留旧数据。抓取谱面后复核上游 HASH，避免把
新文本写入旧修订。收藏详情通过有界查询读取，缓存首屏立即返回；`majdata-service` 的实际歌曲请求及谱面修订核验共用 4 路队列，缓存命中后的后台刷新也受此限制。同键消费者共享请求，单个取消不影响其他消费者；最后一个取消、进入后台或清理旧代次后停止领取新项并取消在途网络。歌曲请求代次、账号请求代次、取消信号和公共资源写入代次阻止旧请求回填。
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

### Rizline

大陆服手机版注册为 `rizline`，查分器为 `rizline-official`（官方账号）。包内图标为
`assets/images/rizline.png`，由用户提供的 240×240 WebP 保留 RGBA 像素转换为 PNG。
接入代码的来源、固定提交、修改说明和完整许可索引见根目录 `THIRD_PARTY_NOTICES.md`；
`LICENSES/` 保留 RizlineGameSaveData、rizline_b40_tool、RizlineSavingTest 与 noble-ciphers 的许可全文。
`RizlineLoginPanel` 默认通过公共 `SmsLoginPanel` 接收手机号与验证码，也可切换到公共
`PasswordLoginPanel` 做账密登录；复用 `ProviderLoginSheet` 的忙碌状态、关闭和通知出口。
验证码与表单态密码只留在面板状态，关闭或进入后台时清空；发送验证码只尝试一次。
公共短信面板按来源保留会话内冷却时间，默认 60 秒，遵守服务端更长的 Retry-After，关闭弹层
不会重置冷却。验证码按钮位于手机号输入框右侧，发送后只保留按钮倒计时，到期显示“重新获取”；
实际错误继续通过公共文案出口显示。账密登录成功后把密码写入 `LargeSecureValueStore`
（`rranker.secure.rizline-password.<accountId>`），不进入 `RizlineSession` 或 zustand。
设备 UUID 通过公共偏好工厂保存在
`rranker.rizline.device.v1`；账号会话另在 SecureStore 保存手机号、令牌、设备 UUID 和渠道。

`providers/rizline-provider.ts` 的 `RizlineProvider` 通过公共 HTTP 入口和 `expo/fetch`
请求 `https://rizserver.pigeongames.net` 的 `check_phone`、发送验证码、登录与 `/game/rn_login`。
游戏请求带 Unity `User-Agent` / `X-Unity-Version`、`Accept: */*` 和 `phone`（可从 JWT 补全）。
新票读取 `set_token`、`set-token` 与 `token`。`rn_login` 仅把 HTTP 401 标为认证失败；
无存档密码时按 JWT `exp` 预留 60 秒偏斜，过期则不再请求上游。响应存档使用
`@noble/ciphers` AES-256-GCM 校验认证标签后解密，再由 Zod 验证。
令牌与存档的用户 ID 必须匹配；轮换按 `mode + token` 比较后通过 `applyRizlineSessionRotation`
持久化，再更新内存会话。账号、取消信号、期望旧令牌和写入代次共同阻止解绑或重新登录后的迟到写入。
`loadRizlineFresh` 每次从 Session 读取最新令牌；`rn_login` 认证失败后若 Session 中令牌已更新则用新令牌重试，
否则才解密本地密码换票一次；只有明确认证失败才删除密码并要求重新登录，网络、取消或本地提交失败保留密码。恢复、删除和账号展示继续走
现有安全仓库、`createRizlineBoundAccount` 与中央元数据订阅；解绑会同时删除加密密码。

`services/rizline-service.ts` 独立保存 `rizline:account:<accountId>` 原始有效成绩快照；
登录读到的有效存档与后续同步共用 `cacheRizlineSave` 校验账号身份并落盘，首次登录后立即可离线恢复。
`useGameData` 构造有类型的 Rizline 载荷。首次查询优先缓存，后台失败保留旧数据；
明确认证失效在缓存载荷上标记 `requiresLogin` 并提示重新登录，不把网络失败当作凭据失效。
显式同步通过 `refreshGameDataBundle` 等待同一次查询与后台提交终态；成绩失败不能报成功。公开曲库失败时仍尝试
官方成绩同步，若仅成绩成功则提示“成绩已同步，曲库暂未更新”，返回部分失败状态。

`domain/rizline.ts` 保留官方歌曲与谱面 ID 的末尾编号，仅移除存档关卡 ID 的 `track.` 前缀。
SP 是独立条目，记录可展示，最佳计算排除。总 RKS 与单谱 RKS 均来自存档，达成率、RKS、
贡献默认四位小数，有限的原始达成率达到 120 才展示 AP，兼容满达成率向上偏移的浮点误差；
原值低于 120 时不因显示舍入升级为 AP。AH 相容性检查均为推定，
不以“全部 HIT 位于 Riztime”确证 AH；取最高五张候选后排除它们，再取剩余最高 35 张。
同分按稳定谱面 ID 排序，不足数量不填充；贡献为各组总和除以 40，不能替代官方总 RKS。
缺少推定数据且可能影响 AH5 时，贡献保留未知；未识别歌曲和无 RKS 成绩不丢弃。

`RizlineScreens`、`RizlineSongDetail` 与 `RizlineRandomChartsScreen` 通过游戏适配器复用
公共列表、卡片、封面定位、难度轮播、随机抽取、收藏、练习与标签。难度顺序为
SP→AT→IN→HD→EZ；默认 IN，成绩入口定位原难度。歌曲与谱面标签分别存储，内部
`SD`/`levelIndex` 只用于现有用户曲库兼容结构，EZ～SP 对应 0～4。曲库与随机页共用
`domain/rizline-filters.ts` 的难度、曲包和定数规则；难度使用彩色横向按钮单选，再次点击
已选难度取消筛选，选中框与舞萌共用默认胶囊形状。工具箱注册随机歌曲与机厅查找，
总览保留公共个人曲库卡片。
总览 RKS 卡使用柔和的灰绿色渐变。难度标签统一使用白字胶囊；曲库行只显示定数、不显示难度名，
筛选条、成绩卡与详情仍显示难度名。详情练习按钮与谱面确认按钮均采用当前难度实心底色与白色文字，谱面确认位于练习清单下方。
曲库中的成就和更新时间字段仍可维护，歌曲及谱面本地标签分别保留。
谱面确认经 `/songs/rizline-chart-preview` 接入公共播放壳，不提供谱面下载或成绩图。

公开资源唯一基址为 `https://rranker-rizline-data.cn-nb1.rains3.com`。独立发布项目位于
`D:/Projects/rizline-resource-publisher`，其维护说明管理官方导入、人工补充、校验、构建及发布。
维护命令由 `rizline_publisher` 模块提供，`overrides.json` 保留人工修订，
`work/supplement-template.json` 按完整官方 ID 列出缺项。独立项目的
`.github/workflows/publish.yml` 配置每日北京时间 20:00（UTC 12:00）从 `main` 实际发布；
手动触发默认只构建并预览，勾选 `execute` 才上传。工作流串行执行，只需配置
`AWS_ACCESS_KEY_ID` 与 `AWS_SECRET_ACCESS_KEY`；端点、区域、桶名和公开基址由发布器内置。
`publish` 默认不写远端，`publish --execute --workers 4` 通过公共发布入口执行，
资源上传与校验支持 1–16 路并发。实际 GET 字节相同的对象跳过 PUT，包括 current；
所有资源验证完成后才处理 manifest，再处理 current，版本对象仍使用条件写入。
manifest 与 current 验证完成后，以清单文件和 manifest 的精确键集合清理
`rizline/releases/`，使该前缀只保留当前版本的可见对象。前置步骤失败不删除旧资源；
清理失败报错，此时 current 可能已经更新。桶级历史 VersionId 不属于此清理范围。
Actions 完整发布归档与报告保留 90 天，S3 不保留回滚版本；线上回滚须从本地或完整归档
恢复版本目录，校验后重新发布。`rollback` 只选择本地版本，不直接修改线上 current。

客户端 `services/rizline-resources.ts` 验证 `/rizline/current.json` 指定的 manifest SHA-256、
资源路径与修订，再验证完整 catalog 的大小、SHA-256、身份与引用一致性，全部通过后替换。
歌曲 `audioPath`（`.m4a`）和谱面 `chartPath`（`.json`）必须出现在清单 `files` 中。
内存发布对象额外保留 `files`，SQLite `rizline:catalog` 仍只存曲库快照与来源；
失败与离线保留旧数据。封面使用版本化地址走公共
图片缓存。`useRizlineCatalog`、`ensureRizlineCatalog` 和 `refreshRizlineCatalog` 共用查询；
新的元数据只重建账号载荷的派生字段，不重取或改写官方成绩。根部 `useGameResourceSync`
按注册表在恢复完成及进入相应游戏时检查 Phigros/Rizline 资源，不因普通标签或前后台切换重复检查。

发布读取的取消、消费者计数、失败重试和完整候选切换共用
`services/verified-release.ts` 的 `VerifiedReleaseSession`，摘要验证共用 `verifyResourceBytes`。
Phigros 保留自己的发布格式和调用入口。Rizline 缓存统计和清理在 `GAME_STORAGE_ADAPTERS`
中注册；清缓存提升游戏代次并取消旧请求，解绑只失效该账号，用户曲库与备份恢复继续走公共仓库。
短信、真实云存档和 Android/iOS 详情轮播及后台行为仍需真机验收；单元/UI 测试和 Metro 导出不能替代。

### Phigros 发布资源

`src/services/phigros-resources.ts` 的 `phigrosResources` 是曲库、定数、头像别名、
谱面确认和下载的唯一发布读取入口。`current.json` 每次检查使用缓存绕过参数；
修订或清单标识变化后读取同一发布的 manifest、catalog、物量表、定数表和可选头像别名。
指针可带 `manifestSha256`，旧指针仍可读取；资源实际字节必须符合清单大小与 SHA-256。
所有必需元数据完成校验后才替换会话对象，失败保留上次有效数据；曲库不落 SQLite 或文件。
`chapters.csv` 独立于游戏版本发布，不进入发布事务。曲库检查经 `refreshPhigrosCatalog` 调用
`getCatalog(signal, true)`，用缓存绕过参数校对会话中的章节副本；内容变化后重建章节映射。
校对失败保留上次章节，首次失败才回退游戏版本号。章节变化只替换曲库查询，不使成绩查询失效。
谱面、音乐、曲绘和头像在使用时经同一服务校验，缺资源、404 或校验失败时强制重读发布信息并重试一次。
列表曲绘、模糊/低清曲绘和头像路径取 `current.manifest` 所在发布目录，查询参数仍带 `resourceVersion`；
同一游戏版本重发也会更新地址。取消的旧事务不得提交，
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

根布局的 `useGameResourceSync` 在恢复选择完成并进入 Phigros 时调用
`refreshPhigrosCatalog`；总览手动同步复用同一入口。标签切换与普通前后台切换不触发额外检查。
查询通过唯一 QueryClient 去重，更新后替换曲库并使 Phigros 成绩查询失效。
成绩 Provider 的定数和 Best30 缓存、持久化成绩载荷均记录资源修订，避免沿用旧定数计算结果。
曲库刷新失败时保留列表并标记来源过期；预览、下载与手动同步继续使用各自既有错误出口。

曲库的非 React 入口位于 `services/aliased-catalog-query.ts` 与 `services/maimai-catalog-query.ts`、`chunithm-catalog-query.ts`、`phigros-catalog-query.ts`、`rizline-catalog-query.ts`。`ensure*Catalog(client, …)`、`refresh*Catalog(client, …)` 显式接收查询客户端，Hook 只订阅规范选项。`services/game-data-loader-queries.ts` 将这些能力组成加载器端口；Rizline 曲库发布后重建现有账号数据包派生字段，不另读官方存档。

## 状态、持久化与资源生命周期

旧会话迁移按账号和凭据身份校验，混合损坏时恢复无歧义的有效项；`SessionVault.recovery` 与 v4 索引仅保存完整性及拒绝项计数，敏感原文留在安全存储。有效索引是后续恢复的唯一来源，解绑或重新绑定后不再迁移旧来源。顶层损坏和读取失败保留来源并阻止新写入。`SessionState.migrationRecovery` 随恢复结果发布，账号管理页显示可恢复提示。上传偏好同样区分缺失、损坏与 I/O 失败，不用默认值覆盖损坏原文。

ScoreHub、水鱼和落雪上传共用 `providers/http-json.ts` 的 HTTP 执行器。写入经 `requestProviderWrite` 单次发送，响应正文超限、损坏或发送后的未知异常保留为 `unconfirmed`；明确拒绝仍是失败。水鱼通过 Provider 发起一次新鲜只读核验，按唯一谱面身份及相关成绩字段精确比较，无法比较或核验失败不算确认写入。`UploadTargetResult.status` 为 `success`、`unconfirmed`、`failed`，汇总、通知和刷新都保留这一差别。好友码上传与总览落雪传输复用 `UploadTaskController`，每个目标、轮询和刷新重试开始前等待恢复；取消通过监听桥接到底层请求，不用定时取消轮询。

- `state/session-store.ts` 只保存账号状态与纯变换：当前账号、游戏、会话映射、激活账号派生视图以及 Provider 解析端口，激活字段由同一转换路径生成。Store 不构造具体 Provider、不调用安全存储 API：Provider 实例经 `state/session-runtime.ts` 的 `sessionRuntime()` 端口由 `state/session-provider-resolver.ts` 按「账号 + 凭据版本」缓存解析，失效条件只有 `release`（解绑、清空会话）、凭据版本变化、账号身份或展示名变化；`services/session-providers.ts` 的 `createSessionProviders` 只保留游戏差异（Provider 组合与构造参数），不反向读取 Store。凭据落盘与轮换集中在 `services/session-credential-coordinator.ts` 的 `SessionCredentialCoordinator`，持久凭据由 `storage/secure-session-store.ts` 管理，轮换继续广播到共享凭据账号。新凭据读回一致后才提交账号索引；索引损坏、账号行无效或账号引用的凭据不可读时保留原索引并让恢复失败，不静默丢弃账号或允许后续写入覆盖；无账号引用的凭据不参与恢复，旧版迁移源顶层损坏时保留并报错，混合损坏项由迁移完整性结果隔离。osu! 进程内轮换记录和祖先关系共用 64 项上限，进行中的刷新保留在同一集合里；解除最后一个 osu! 账号或清空会话时调用 `clearOsuRotationCache`。窗口外的旧刷新令牌不能覆盖当前会话。
- OAuth 轮换按凭据世代提交，提交入口是 `SessionCredentialCoordinator`：落雪用 `applyLxnsTokenRotation(accountId, { previous, next })`、osu! 用 `applyOsuTokenRotation(accountId, next, expected)`，两者都按请求开始时消费的会话及协议前代关系解析凭据，只更新仍关联该凭据的账号，再调用 `SecureSessionStore.updateCredentialSession` 写盘，返回 `applied` / `pending-persist` / `stale` / `removed`。发起账号解绑但共享凭据仍被引用时继续提交，同 ID 重绑或重新授权后的迟到结果被拒绝。内存新会话与活动 Provider 投影在一次 Store 提交中发布。落盘失败登记补写：5/30/120 秒最多自动尝试 3 次，耗尽后仍保留任务，前台或显式 `retryPendingRotationWrites()` 可以继续尝试；只有成功、凭据世代失效或不再被账号引用时删除。单个在途补写不得清除其间登记的新任务。`pendingRotationWritesSnapshot()` 与脱敏诊断记录等待和恢复状态。Rizline 与 Majdata Cookie 也经同一协调器，安全仓库返回 `applied` / `stale` / `missing`，仅实际应用且请求仍有效时投影。Store 的会话类型和纯映射来自 `domain/session-vault.ts`，不引入原生存储实现。
- `SessionProviders` 明确分开成绩、可选详细曲库和可选协议成绩能力。`catalogProvider: null` 表示没有舞萌详细曲库能力，查询禁用或显式拒绝；真实空曲库仍是成功数据。`protocolScoreProvider` 登记真实中二或 osu! Provider，加载器使用解析器缓存的同一实例和轮换回调，不重新构造另一份刷新状态。
- 主题 setter 立即应用选择，不回弹、不新增前台提示。`services/preferences-write-coordinator.ts` 独占严格读取基线、脏字段合并、代次和串行完整文档写入；失败保留最新选择，按 0.5/2/10/30 秒自动重试，之后每 30 秒重试。后台停止安排新写入，前台补写；迟到读取不覆盖用户选择，无法识别的持久数据不被默认值覆盖。失败仅进入受限诊断，恢复记录一次成功事件。
- `state/query-client.ts` 提供进程内唯一 QueryClient；账号最终数据的发布、读取与失效经 `services/game-data-query.ts`。`GameDataQueryPort` 声明读取、写入、失效与可选的 QueryCache 观察端口，`publishGameDataBundle` / `publishEntityValue` 在真实查询首屏提交之后再发布后台版本，查询移除后不再发布。`useGameData` 注入端口和 `gameDataCatalogQueries(client)` 的曲库读取能力，加载器不持有 QueryClient。`refreshGameDataBundle` 等待 refetch 与同实体后台终态，按「后台落定值 → 已提交版本 → refetch 返回值」解析；请求范围包括 `data`、`catalog`、`player`、`scores`、`bests`，中二分项完成和机器失败码原样保留。后台句柄保留到下一次查询替换或 QueryCache 移除，整体清理同步回收句柄。`gameDataBundleStale` 集中判定来源过期。TUF、Muse Dash、Phira 的玩家键与查询选项位于各自 `services/*-query.ts`；实体保留完整快照和原抓取时间，总览与页面读取同一已提交版本。
- SQLite 的进程内连接由 `storage/rranker-database.ts` 集中管理；`runDatabaseWrite` 串行化业务 schema、快照和用户曲库写入。日志连接的 `runSerializedSchemaInit(task, 'runtime-log')` 使用独立队列，日志事务由其 Repository 串行管理，业务初始化未完成也不会阻塞日志。`SqliteSnapshotRepository.updateResource` 把读取、转换与写入放进同一队列任务（队列内只用直接数据库调用），同一资源的并发合并按提交顺序串行。批量清理以 500 个绑定参数分批，在同连接事务内执行；文本统计使用 UTF-8 字节，数据库分配页单列。表结构和个人数据键不变。updateResource 可显式返回 { value, write: false }，在同一队列中复核代次而不写入；osu! 重复、低分及空成绩种子保留已有快照时间，同分元数据变化仍提交。
- 缓存读取优先走本地首屏、后台刷新和 AbortSignal 取消链路。共享任务按消费者计数取消；清缓存先提升游戏写入代次并取消/移除 Query，解绑只失效所属账号。后台刷新及实际 SQL 提交前复核游戏/账号代次，旧结果不能重新填回缓存。短暂 `inactive` 与普通后台不会被当作内存压力；只有内存警告触发非活动 Query 和图片内存释放。`CachedTabScreen` 在这些状态下保持已挂载画面，只通过 active context 暂停重工作。
- 刷新的结果与快照时间分开：`domain/refresh-result.ts` 的 `RefreshResult<T, Target>` 用 `RefreshStatus`（`success` / `partial` / `failed` / `cancelled` / `noop`）表达终态，`SnapshotMetadata` 只记录原提供方、抓取时间与修订；只有 `success` / `noop` 才推进抓取时间（`refreshedFetchedAt`），`partial` 保留成功项与失败项并可只重试失败项，`assertFreshSnapshotSource` 让缓存回退不能被当成刷新结果落盘。`services/cache-first.ts` 的 `cacheFirstLoadWithBackground` 返回首屏数据与永不 reject 的后台刷新终态句柄，`CacheFirstLoadOptions` 的 `onFresh`、`onFallback`、`onRefreshFailed` 分别接「取回新数据」「服务声明的缓存/兜底」「刷新抛错」，取消后都不发布，`cacheFirstLoad` 是只要首屏的简化入口；舞萌、Rizline 与 Majdata 的首屏加载复用组合器，异步发布回调也包含在终态中；回调抛错按失败结算。中二个人数据经 `ChunithmPersonalService.refresh` 分项结算，加载器直接保留其结果。真实成绩与中二分项请求复用 `createInflightGuard.share`，单个消费者取消不停止其它消费者。
- KV 的默认入口是 `storage/key-value-storage.ts`，账号目录、偏好、安全会话索引、缓存维护和播放器设置都使用同一实例。`createSerializedKeyValueStorage(storage)` 按底层实例串行执行完整的 `getItem` / `setItem` / `removeItem` / `getAllKeys` 原生操作，覆盖语句准备、执行与释放；失败保留原错误并让后续任务继续，独立实例使用独立队列，不改变现有键与结构。原生 KV 的打开锁不等于完整操作串行。`key-value-storage.test.ts` 通过 AST 约束生产消费者只走该入口，独立原生探针只可直接构造临时实例，再使用同一协调器。
- 账号列表由 `storage/create-account-list-store.ts` 的 `createAccountListStore` 统一读写：`upsert` / `remove` 经按键 mutation gate 在同一 KV store 与键上串行（前一个失败仍继续排下一个）。`load()` 不进入账号 mutation gate，但其底层原生读取仍进入公共 KV 执行队列；清理后的旧业务任务不能把已删除条目写回。
- 上传用的 `ScoreHubAccountStore` 复用导出的 `enqueueKeyMutation`，完整读取迁移与全部变更按存储实例和索引键串行；内部调用不重复加锁。v3 索引及 v1/v2 迁移保持兼容。普通认证读取遇到被引用的令牌读空或异常，以 `credential_storage` 失败；索引不可解析以 `local_commit` 失败。显式删除与清空先依据有效索引提交，再独立清理引用，不要求先读出损坏令牌。账号信息、同步成绩、机台任务和统计响应由 `score-hub-types.ts` 的 Schema 校验，坏类型和无效计数报协议错误。
- 缓存依赖 `ResourceRepository`、`AtomicResourceRepository` 和 `ResourceMaintenanceRepository` 的实际消费能力。SQLite 的归一化曲库与成绩、Phigros 存档共用 `domain/schemas.ts` 的运行时 Schema；TUF、Muse Dash、Phira 在所属缓存模块校验领域载荷和来源。损坏行返回空但保留原值，存储 I/O 错误继续传播；Phira 原子合并前重新验证旧快照及身份。
- 图片索引 I/O 失败不进入空索引核对或文件清理，下次请求可以重新读取。定时落盘即时观察失败，显式 `flushRemoteImageCacheManifest()` 保留错误并允许后续写入恢复。
- `RemoteImage` 统一远程图片加载。受控压缩缓存是 v3，总预算 10 MiB、单项上限 10 KiB；列表项达到 50% 可见并持续 250 ms 后才允许持久化，任务经 `InteractionManager` 等待交互结束，失去资格取消排队和在途消费。在线原图仍作为主加载源，缓存文件只作本地回退。失活只暂停落盘，不把已显示 source 置空。可见性通过条目级订阅通知，并经 `CachedContentActivityScope` 暂停离屏行的流光与自动滚字；保持列表 renderItem、extraData 和窗口参数稳定。动画同样受前台生命周期控制，`useReducedMotion` 为所有消费者共享一个原生订阅；等价 URL/请求头/cacheKey 不触发图片缓存重查。
- 存储管理通过 `GAME_STORAGE_ADAPTERS` 声明账号归属、资源键/前缀、查询键及文件资源。`storage-adapter-core.ts` 的同一库存选择器用于统计与删除，涵盖没有成绩行的账号资源；SQL 写入仍走既有队列。共享缓存文件操作位于 `shared-storage-cache.ts`，不直接清空整个 Expo `Paths.cache`。

账号管理由 `GameAccountsScreen` 装配列表和弹层，`useAccountBindingFlow` 维护互斥弹层及转场任务，
`useManagedAccountOperations` 复用公共绑定/删除执行器；`services/account-management.ts` 提供档案、缓存和账号创建策略。
删除前先失效并取消账号查询，准备失败中止后续删除，所有退出路径均解除忙碌状态。
`switchBoundAccount` 即时更新内存选择，每次有效选择都保存活动账号，包括同目标重试；
调用方统一显示“当前已切换，账号选择未保存，请重新选择”，公共操作代次抑制迟到错误。
已成功创建的公共玩家或示例账号保留绑定，活动选择保存失败独立提示。
`removeBoundPlayerAccount` 把关键解绑提交（账号或凭据删除）与分项清理分开：关键提交失败返回
`blocked` 并保留账号与凭据，界面仍是重试入口。提交点是 `SecureSessionStore.removeAccount` 的凭据索引写盘：
写盘成功即返回 `{ committed: true, cleanupFailures }`，Rizline 密码引用删除归入提交后的附属清理，
失败只记入 `cleanupFailures` 并按已解绑处理；成绩缓存、派生缓存、个人数据与活动账号持久化失败同样只汇总提示。
因此磁盘与界面在“账号是否解绑”上始终一致：只有提交前失败才会保留界面账号。
恢复失败保留已加载数据，同一页面提供重试恢复与清除登录数据（二次确认）入口；清除先提交 v4 合法空索引，再清理凭据、密码、副本和旧来源；返回 committed 与 cleanupFailures。提交失败保留账号，附属清理失败仍按已清空恢复界面并提示。旧来源不会使账号复活，迁移失败则保留旧来源重试。读入迁移和变更共用仓库串行队列；取消回滚失败先读回实际索引，仅删除可确认未被引用的新凭据。可选来源的失败通过 `getAccountSourceStatuses()` / `subscribeAccountSourceStatuses()` 可观察，`retryFailedAccountSources()` 仅重读失败来源；重试期间被删除、修改或重新绑定的账号不会被迟到结果覆盖。原生凭据 I/O 与账号索引 I/O 分别抛纯领域 `SessionPersistenceError` 的 `credential_storage` / `local_commit`，界面经公共错误文案区分实际失败阶段，取消原因原样保留。

总览的 `useOverviewSync` 处理当前账号刷新与终态判定，`useOverviewUpload` 处理上传选项、
舞萌落雪传输及完成刷新，两者通过 `useOverviewOperation` 共享互斥。同步先取消失效查询、
完成水鱼预刷新与（Rizline 的）曲库尽力刷新，再调用 `refreshGameDataBundle` 并只按它返回的
终态判定：`success` / `noop` 视为成功，`partial` 按实际失败项提示玩家资料、成绩、最佳成绩或曲库未更新，认证失败提示重新登录；其它终态按公共失败文案提示。每一步等待后与通知前复核前台信号、账号、游戏和操作代次，切换后的旧结果不写新状态；调用方不维护逐游戏 waiter，也不二次读取查询缓存推断后台刷新是否落定。
`UploadDataSheet` 的账号偏好、二维码输入与任务执行分别由 `useUploadAccountPreferences`、`useUploadQrInput`、`useUploadTaskState` / `useUploadExecution` 管理。唯一后台任务由 `services/upload-task-controller.ts` 的 `uploadTaskController` 管理，类型位于 `upload-maimai-types.ts`，业务入口 `upload-maimai-from-friend-code.ts` 保留再导出。每个任务持有自己的取消信号、前台等待与曲库等待；阶段、完成、刷新和通知必须验证发起任务身份。取消立即结束前台等待，迟到曲库与回调不能进入下一任务；关闭或卸载弹层不终止任务，显式取消才结束。上传偏好的读取迁移、保存、删除和清空共用按存储键串行的 `enqueueKeyMutation`；好友码切换以选择代次约束迟到回调，读取目标勾选前不写入上一个好友码的选择。
上传取消在 `score-hub-http.ts` 统一通过 `assertUploadActive` 检查 `aborted`，兼容 React Native
缺少 `throwIfAborted` / `reason` 的信号；存在的取消原因保持原样，缺失时返回既有取消错误。
ScoreHub 请求、落雪上传及水鱼只读核验共用该入口，不增加轮询、重传或正常路径等待。
上传账号读取失败保留最后一次完整历史列表并提供重试，首次读取失败保持未就绪；
历史账号选择提交成功后才发布新的好友码与勾选偏好，上传的网络兜底不会吞掉持久化错误。好友码选择代次独立于任务，旧读取与重试不能覆盖新选择；打开期间账号集合更新不取消正在恢复的偏好，恢复完成时使用当前可写账号。

Kyou 别名的一小时会话缓存位于 `services/phigros-kyou-cache.ts`，查询 Hook 和存储清理均依赖该服务。
服务通过 `createInflightGuard.share` 共享请求并独立取消消费者，清理使旧请求失效；迟到失败不能清空新缓存。
`PhigrosKyouProvider` 通过公共 `requestJson` 请求，支持调用方 AbortSignal，保持 12 秒超时、单次尝试和数据交叉校验。

最佳列表共用 `BestListPage` 的分组列表入口。分组标题和尾部在 React Native 可见性
转换中仍会经过键提取器，共享入口按分组对象身份保护提取器，并在图片订阅和业务回调前
移除非条目事件。弱引用身份表兼容分组更新后的迟到回调，真实条目的键、分组布局、
列表窗口与图片持久化门槛保持一致。

## KALEIDXSCOPE 活动工具

`app/tools/kaleidx-scope.tsx` 通过 `domain/kaleidx-scope.ts` 的 `KALEIDX_STAGES` 展示六扇彩色门、
棱镜塔、ERROR、希望之门与最终挑战。`kaleidxStageChallenge(stage)` 统一转换随机三曲、剧情课题、
固定三曲和最终单曲；最终挑战包含双段 LIFE、结局曲及搭档奖励。国服未完整确认的缓和表携带
推算标记、来源和核对日期，只在折叠参考区展示，不参与当前档位计算。

歌曲继续通过 `useDetailedCatalog` 解析真实曲库身份；指定谱面类型的课题只有在该类型存在时才启用
详情跳转，经 `encodeDetailTarget` / `detailTargetHref` 携带舞萌身份与谱面类型。ERROR 乱码课题
只展示剧情说明，不构造歌曲 ID 或详情链接。

`state/kaleidx-scope-progress.ts` 使用公共偏好工厂，沿用 `rranker.toolbox.kaleidx-scope.v1`
的按账号记录；六门保存钥匙曲、单人／多人计划和通关状态，四个后续阶段只使用完成状态。
前置条件用于提示，不限制补记，也不级联改写其他阶段。保存共用串行队列，失败回滚；
缺失阶段默认未完成，恢复时过滤无效曲目与未知阶段。

## 调试设置与诊断日志

设置页的“调试”进入 `app/debug.tsx`，提供“启用测试账号”开关与独立“诊断”入口。
`useDebugStore` 通过 `createPreferencesStore` 在 `debug-preferences-v1` 保存 `testAccountsEnabled`，默认关闭。
初始化共享一次读取，写入串行执行，成功后更新开关；保存失败保留最近成功值并允许重试。
`canBindProvider(provider, testAccountsEnabled)` 根据 `bindingKind === 'fixture'` 统一筛选添加选项；
选择器数量和实际添加入口使用同一判断，恢复完成前不显示示例选项。关闭只限制添加，已有示例账号照常恢复和使用。
开关使用现有主题色原生 Switch，不控制诊断日志开关。

调试页中的“诊断”进入 `app/diagnostics.tsx`，提供手动日志开关、1000/2000/5000 条容量选择、
最近两份记录的独立分享。页面分为记录控制与最近日志，开关使用个性化曲绘开关相同的
主题色；记录状态依据当前记录与失败状态显示，不以开启偏好代替实际记录状态。
日志沿数据库创建顺序标记最新记录、上次记录，独立展示状态、本地秒级时间和保留条数。
每份日志分享自动附带简要诊断；“分享诊断信息”始终可用，包括加载、读取或写入失败时，
调用 `exportRuntimeDiagnostics()`。容量默认 2000 条，开关默认关闭，两者通过
公共偏好工厂保存。开启期间不能修改容量；开启后持续生效，直到用户手动关闭。
开关关闭时启动只读取偏好，不打开日志数据库；进入诊断页才惰性加载历史。开启时先将未结束记录恢复为“已中断”，再创建一份新日志，
包含当前记录在内始终只保留最近两份。重复初始化、页面卸载和前后台切换不创建新记录。
页面按压复用 `DetailGestureRoot` / `DetailPressable`，通知复用 `AppNotification`；
操作期间禁用重复动作，加载与失败不显示无日志空态；偏好、历史读取、当前记录失败分别表示，历史失败不显示成保存失败。历史重试不改变开启开关，也不创建新记录。
手动关闭保存关闭状态并结束当前记录；“已中断”不等于发生崩溃。

`services/runtime-diagnostics-recorder.ts` 是事件与错误的唯一采集入口。现有生命周期、
内存、任务与页面内容事件分发给简要诊断和手动记录器；路由模板、公共 HTTP 结果、
查询/变更错误、公共预览与导出错误沿同一入口采集，手动日志仅在开启时追加。独立的进程内应急环先保存最多 64 条脱敏事件，再分发给两个持久记录器；持久写入失败不能影响业务。简要诊断保留最近三次启动、总计 256 条白名单事件，并由 `exportRuntimeDiagnostics()` 导出。

简要诊断正文由 `runtime-diagnostics.ts` 在既有串行队列中读写；尚未开始写入的连续事件合并为有界批次，一次读取和写入保留顺序，快照请求切断批次边界，后来的事件不进入该快照。正文位于
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
从 1 开始。`operation.durationMs` 是自本次操作创建起的累计耗时，phaseDurationMs 为相邻有效阶段耗时，parentOperationId 关联父操作；内容挂载、加载完成、
桥接就绪均不证明实际播放或音频正常。本链路不采集逐帧状态、图片正文及桥接设置。

`storage/rranker-database.ts` 管理独立的 `rranker-runtime-logs.db` 连接；Schema 初始化
经过 `runSerializedSchemaInit(task, 'runtime-log')` 独立队列，记录事务不共享业务数据库。`RuntimeLogRepository`
通过 appendBatch 同步合批写入，在一次事务内分配序号、插入并裁剪每份最早事件，成功创建记录的同一事务中保留最近两份。普通事件按 32 条或 100 ms 提交并发布一次；致命异常、停止、分享快照与后台同步 flush。后台边界由 initializeRuntimeLogs 订阅 subscribeAppLifecycleSnapshot，在原生 AppState handler 返回前完成，React effect 不重复记录。
正文不进入可清理缓存目录；应用版本、构建号和平台保存在记录上下文中，不随事件裁剪丢失。
上下文还包含系统版本、运行环境和开发模式。构建号优先取当前 Constants 原生平台
字段，缺失时取 Expo 配置，并以 `buildVersionSource` 区分 `native`、`config` 和 `unknown`；
原生字段不可用时使用配置来源；配置来源不能证明实际安装包构建号。
追加事务成功后控制器增量更新条数和最后时间，避免逐条重查列表；创建、恢复和停止时
从数据库刷新列表，失败事件不计入已保存数量。
保存失败暂停当前记录，保留已提交内容与开启偏好；用户可重试，下次启动仍按开启偏好
创建新记录。不会将日志失败再送入日志；关闭偏好保存失败时保持原记录和开关状态。

异常入口根据实际运行时开关选择 React Native 异常监听或保留原处理器的 ErrorUtils
包装，根路由错误边界补充渲染错误并显示可重试文案。关闭时不写手动日志。
条目可选 severity 为 debug/info/warn/error/fatal，阶段、成功及正常取消、重试及回退、失败、实际致命异常依次按对应等级记录，旧记录兼容。开关默认关闭，开启即详细。缓存命中、请求用途和凭据补写原因只记录白名单机器字段。错误摘要由类别生成，堆栈只保留源文件名和数值位置，最多 30 帧、单条最多 8 KiB。
不序列化任意错误对象、账号资料、请求正文、完整地址或查询参数。

`shareRuntimeLog(id)` 在第一次异步等待前生成该记录的文本快照，不停止记录；仅用户
点击时调用系统分享。临时文本使用 `rranker-` 缓存前缀，分享结束后清理自身副本，清理失败独立记录而不覆盖分享结果。
JSON 文本包含 `formatVersion: 1`、session、context、entries、`snapshotAt` 和
`summary`：数据库序号对应累计成功保存条数，减去保留条数得到裁剪数量；时间范围和
类型统计只计算快照保留的事件。统计及正文在第一次异步等待前固定，无须迁移表或
清空旧记录。统计不推断崩溃原因。
日志分享固定所选日志后调用 `snapshotRuntimeDiagnosticsForExport()`，立即固定应急环，简要持久诊断经同一串行队列读取并限时 1.5 秒。读取失败或超时返回 `storageAvailable: false` 与已固定的应急事件，保留所选日志正文；成功时附带持久快照。`exportRuntimeDiagnostics()` 复用该入口。两种导出均先尝试文件分享；文件写入或文件分享不可用时使用 React Native 文本分享，双路径失败才向页面抛错。
两种分享均在操作期间防止重复调用，结束或失败后解除锁定；失败经页面通知提示重试。
应用日志不能提供原生崩溃或系统内存终止的完整报告，也不能保证进程终止瞬间的事件落盘；
系统分享、前后台和异常结束恢复仍需 iOS/Android 真机验收。

## WebView 与文件型功能

四类谱面确认播放器通过 `chart-preview-shared/webview-player/controls.ts` 的
`installPreviewControls` 共用播放详情布局，参数常驻显示；布局保留原按钮和回调，观察器
由各入口的 `PlayerEventScope` 释放。Simai 的实时信息位于时间行与热度轨道之间，Buddy
显示独立 1P/2P 热度并共用进度和 A/B 区间；Rizline 保留设置展开前的舞台比例。
`HeatTimelineView` 接收各会话的时长、音符起点与位置，以至多 200 格的透明度表达密度，
空段留空；位置、播放、跳转与持久化仍由原会话和宿主负责。公共预览壳通过
`chartPreviewAppearanceScript` 注入应用的深浅主题与强调色，并为文字计算可读配色。
布局、密度和输入回归由 `chart-preview-heat-controls.test.ts`、`chart-preview-wheel.test.ts` 覆盖。

公共预览壳仅允许当前 session 的精确页面 URI 导航，关闭共享/第三方 Cookie、混合内容和
文件页访问任意来源，保留暂存媒体、皮肤与相对文件所需的读取权限；iOS 文件读取范围为
当前 session。WebView、准备与播放器异常只进入白名单诊断，不原样输出事件或消息。
ZIP 条目由公共 `readBudgetedZipEntry` 流式解压，每块在保留前检查实际条目/总量预算及
声明大小，超限或取消销毁 inflater，完成后校验 CRC。JSZip 适配核验 worker 能力，不能
只在完整解压分配后检查限额。Phira notes 经公共 HTTP 下载，最长 120 秒、显式 256 MiB，
info/chart 另限 6/32 MB；RPE/PGR/PEC/PBC 遍历和 CRC 定期让出并响应取消，假音符也计入
数量上限。资源预算不代表进程内存上限，JSON.parse 受输入字节预算后一次解析。

- 谱面确认由 `features/chart-preview-shared/` 提供 React Native 壳、资源暂存、桥接、注入工厂和播放时钟；游戏目录只提供解析、资源计划和配置。壳把 native `prepare` 映射到进度条 0～0.9，WebView 解码占 0.9～1，桥接 `ready` 后撤遮罩。全屏方向由可选 `fullscreenOrientation` 控制，默认横屏。每次预览仍使用独占 session 目录；远程 `url+bytes` 资产可先写入 `Paths.cache` 下 `rranker-` 前缀目录（已有非空文件则跳过下载，`bytes` 只作进度权重），再写入 session。舞萌/Majdata 谱面与预览曲在 RN prepare 经 `downloadChartResource` 完成；预览曲写入 `music-data.js`，皮肤编码为 `skin-data.js` data URL，播放器不通过 `file://` 直接读本地 PNG 或音频。这些文件随共享缓存一并统计和清理。
- 谱面下载由 `features/chart-download-shared/` 统一处理临时目录、取消、进度、文件名和保存位置，游戏功能负责组装具体资源。Simai 使用 stored-zip.ts 的文件式 STORE ZIP/ZIP64，以 64 KiB 固定块读写并增量计算 CRC32，保留大文件能力，验证实际偏移处理短读和短写；封面只读取签名小块。等待现有文件保存入口完成后释放暂存，清理失败不覆盖原结果。`useChartPackageDownload.start` 可接收 `optionalVideoUrl`，将视频可用性检查、选择与下载放在同一重复点击锁、超时与取消生命周期中；后台、卸载和取消后的迟到结果不能再弹窗或启动下载。
- 宿主与四套播放器之间的命令合同集中在 `features/chart-preview-shared/chart-preview-bridge.ts`：宿主命令判别联合是 `pause`（`cause: 'manual' | 'lifecycle'`）、`exit-fullscreen`、`dispose` 与 `background-video-confirmation-result`，播放器事件判别联合是 `progress`、`ready`、`fullscreen`、`settings`、`background-video`、`background-video-confirmation` 与 `error`，未声明的消息按扩展消息透传。`applyChartPreviewHostCommand(raw, player)` 是唯一的命令分派器（四个播放器只实现 `pause` / `exitFullscreen` / `dispose` / 可选 `confirm`），`chartPreviewHostCommandScript(command)` 是唯一的命令序列化入口，`parseChartPreviewHostCommand` / `parseChartPreviewBridgeMessage` 只接受已声明的类型与载荷。暂停（手动或宿主 inactive）只停播并释放临时媒体、不改变全屏；进入全屏只由播放器按钮发起；`dispose` 停播、退出全屏并回收资源且幂等，由壳在释放当前会话时注入（卸载与依赖变化、后台与内存警告、手动重载、播放器失败、内容进程退出），四套播放器都有 `pagehide` 兜底释放。旧 `ready`、旧扁平 `settings` 与旧 `stop` 命令在解析层归一化，不做版本协商。合同由 `chart-preview-host-contract.test.ts` 与 `chart-preview-screen-shell-contract.test.tsx` 覆盖，改动后需重建对应播放器生成物并跑 `npm run check:generated`。
- Phigros 谱面确认先通过 `services/phigros-chart-preview-resources.ts` 的 `loadPhigrosChartPreviewResources` 下载并验证谱面、音乐和曲绘，自定义 `read` 走 `downloadChartResource` 字节进度，再将文本和 Base64 交给既有预览暂存计划；准备阶段超时为 120 秒。Phira 元数据、zip 下载、解包和暂存均在同一个 120 秒 prepare 生命周期内：详情页交接的 `chart` 直接复用，只有 chartId 时由 `buildPhiraChartPreviewInput` 经公共 Provider 读取一次元数据，退出或超时取消同一信号；zip 同样经 `downloadChartResource` 计入进度后再解包。Phira 兼容下载对 Phigros 资源使用同一校验与重试入口，下载本身仍委托 `downloadChartResource`，校验通过后才组包。发布端缺音乐时客户端不能补出音频，必须修复发布内容后完成真机播放和导入验收。
- 成绩图由 `features/best-image/` 统一处理偏好、资源、WebView 状态、预览、导出和共享屏幕控制器；控制器组合独立偏好、预览与导出会话，预览轮播同一时刻只挂载当前 WebView 页面。`BestImageScreenShell` 接收外观插槽、预览状态和导出会话三组参数。导出会话独占操作锁、画布等待和临时文件，在权限、捕获与保存前后复核取消；取消后不开始下一步或报告成功，已经开始的原生保存完成后清理临时文件，不删除已保存到相册的图片。
- 四套播放器的 `main.ts` 只接线，播放状态归各自的会话类，宿主与视图只读。Simai（舞萌与 Majdata 共用）在 `features/simai-chart-preview/webview-player/`：`playback.ts` 的 `SimaiPlaybackSession` 独占播放位置（拍）、命令代次、音源与 rAF，位置与音乐时间换算沿用 `timeConversion.ts` 的 `createSimaiPlaybackTimeline` / `resolvePlaybackRange`；`timelineView.ts` 的 `SimaiTimelineView` 由窗口与横屏全屏控制器各持一个实例，热度轨道、刻度与播放头委托公共 HeatTimelineView；`backgroundMedia.ts` 的 `SimaiBackgroundMedia` 独占背景图片/视频元素、就绪状态与视频回绕同步，播放状态只作为每帧输入读入；视图与桥回执经 `SimaiPlaybackHost` / `SimaiBackgroundMediaHost` 回调接线。Phigros 与 Phira 在 `features/phigros-chart-preview/webview-player/`：`playback.ts` 的 `PhigrosPlaybackSession` 独占播放位置（谱面秒）、命令代次、音乐音源、打击音调度与 rAF，设置对象由宿主持有、会话只读取当前值；`timelineView.ts` 的 `PhigrosTimelineView` 将时长与音符起点交给公共 HeatTimelineView。Rizline 的 `PreviewSession`（`features/rizline-chart-preview/webview-player/playback.ts`）独占播放位置、音源、帧循环与命令代次，并通过可选的 `PreviewSessionEnvironment`（`defaultPreviewSessionEnvironment`）注入音频上下文与帧循环，生产调用点不传该参数。osu! 的 `PreviewSession` 与 `PlaybackHandle`（`features/osu-chart-preview/webview-player/playback.ts`）同样持有会话，`main.ts` 只保存句柄与界面状态。会话状态由会话类内部改写，`main.ts` 只接线、不声明位置、时钟、代次或音源字段；公共 `PlaybackClock` 与拨轮壳仍是各自的公共入口。四套入口均复用 PlayerEventScope 管理监听、观察器与定时器，释放后的事件不能产生副作用；osu! 入口元数据取自会话。Phigros 复用公共 0.05/0.01 精度参数控制，按帧预览和操作停止后提交；settings.committed 缺省保持已提交语义，false 仅在宿主当前会话暂存，inactive、后台、卸载及换会话前保存最终值。Phigros 播放中 seek 固定目标时间并提升命令代次，先撤旧帧、音源和已排队打击音再恢复；旧帧不能写回目标。合同由 `chart-preview-playback-ownership.test.ts`、`chart-preview-simai-playback-session.test.ts`、`phigros-chart-preview-playback-session.test.ts` 与 `rizline-chart-preview-playback.test.ts` 覆盖。
- 上述功能涉及 WebView 内容进程、文件选择、相册权限、原生手势和大图内存，自动化测试不能替代真机验收。

公共谱面壳将准备会话与已挂载内容绑定，资源准备默认限时 120 秒，等待播放器 `ready`
默认限时 60 秒，分别可通过请求的 `timeoutMs`、`readyTimeoutMs` 调整；等待用户选择资源
时不启动计时。超时直接显示可重试状态，不依赖底层任务响应取消；旧会话的准备结果、
进度、桥接、设置和内容进程回调不能修改新会话，迟到资源只回收自身。收到 `ready` 前
进度最多显示 99%。内存警告或内容进程退出后释放资源，显示提示与“重新加载”；重载
创建新的准备会话并重置进度。短暂 inactive 只暂停，普通后台释放后可在前台重建，
内存或进程异常的手动重载状态不会因前后台切换而自动解除。

### osu! 谱面确认

四模式详情的难度操作统一为练习清单、谱面确认、谱包下载。`/songs/osu-chart-preview`
使用 `gameId`、`beatmapsetId`、`beatmapId` 定位当前难度，标题仅用于显示。
`features/osu-chart-preview/` 提供配置、资源选择与原生准备，复用 `ChartPreviewScreenShell`、
注入工厂和 `prepareChartPreviewWebviewFromPlan`；准备超时为 120 秒。
播放器普通窗口与横屏全屏均保持 16:9，使用公共热度时间轴；普通窗口提供方形播放按钮与
常驻参数卡片，全屏保留浮动播放控制和锁定交互。参数共用
`chart-preview-shared/webview-player/wheel.ts`，横向微调、刻度跳值和键盘调节沿用同一范围与
设置回调，即时预览按帧合并，操作停止后提交；全屏和退出时结束未完成手势并提交最后值。
公共参数控件将子节点的隐式触摸捕获移交到按钮后继续处理同一指针；只有按钮自身的当前
捕获丢失才结束并提交。纵向触摸仍交给页面滚动，浏览器输入回归覆盖连续拖动与设置桥接。

`prepareOsuChartPreviewWebViewSource` 在下载前捕获 shared 资源写入代次，与谱包保存入口
共用 `downloadOsuBeatmapsetArchive`。完整包按 Sayobot、osu.direct、Catboy、Nerinyan
串行尝试，无视频包跳过 Catboy。源切换只发生在下载编排内，页面显示统一加载进度。
每源连续 15 秒没有新增字节则取消并尝试下一源，外部取消或资源写入代次失效终止整链；
通过 `subscribeResourceWrites` 同步接收清理失效，静默下载无需等到下一次进度才取消。
每次尝试使用独立文件，失败及迟到结果只清理自己的文件。公共 `downloadChartResource`
验证 HTTP 2xx 与非空文件，通过公共错误类型保留失败分类，取消无需等待原生下载结算。
传输字节与落盘文件长度均受预算约束（含未知总长度），读内存前先按文件长度拒绝；
预算超限不再换源。谱包保存用独立预算与专属文案，经条目扫描与逐项受限 CRC 完整
校验后落盘；预览在候选阶段通过 `readOsuChartPreviewArchive`
完成预算校验，再按 BeatmapID 精确匹配，拒绝缺失、匹配歧义、越界路径和可观察的规范化重名，并完成资源提取。
媒体逐项校验后即写入候选目录，每项只读一次；失败时不返回半份清单。
每候选独占媒体子目录，提取损坏同样触发换源；失败和取消清理目录，成功资源才注入播放器。
全部候选失败才显示场景错误，不改变 OAuth 授权，也不跳转下载网页。
原生准备与播放器共用 `resource-plan.ts` 的引用选择：仅读取当前 `.osu`、同目录 `.osb`
和被引用的媒体，保留目录语义并兼容大小写。UTF-16 文本采用平台无关字节解码。
图片、视频写入独占 session；音频单独通过 `audio-data.js` 注入并按实际引用去重解码。
完整谱包不持久缓存，取消、失败、退出与启动维护共用临时目录回收规则；异步恢复与发布前复核代次。

osu! 自动输入与标准判定共用已应用堆叠的谱面坐标，滑条判定和计分逐项消费公共嵌套事件流。
catch 转换在生成时直接消费滑条事件和派生音符，保留原始生成顺序与完整最终音符表。
自动输入的标准模式轨迹和太鼓滚奏逐项生成，播放准备通过 `buildAutoReplay(source, hash, signal)`
分批消费并复用公共解析让出入口响应取消：每 128 个样本检查，首次让出后按 8 ms 工作时间片调度，
时间片状态仅属于当前准备任务，定时器等待不计入计算预算。同步调用消费相同生成逻辑，最终仍保留完整回放帧表。
数值校验保留继承时间点 `NaN` 的普通速度与禁用 tick 语义；香蕉雨遇到单精度累加停滞时用双精度继续。
打击音采样通过公共二分入口查询时间点；媒体准备和音频会话共享已排序的只读打击音表，
不重复排序复制，故事板触发元数据按消费者需求生成。

播放器就绪后停在起点，点击播放或重播才恢复音频并按文件原生模式自动演奏；重载后
保持暂停。转谱入口明确提示实际模式，不提供包内难度选择。
歌曲、打击音、故事板 Sample、视频和谱尾反馈共同决定时间轴，负时间与 AudioLeadIn
计入前导；关闭故事板或视频不改变总时长。视频静音并交由系统解码。
设置从 `configuration.ts` 归一化，经公共壳持久化到 `rranker.osu-chart-preview.settings.v1`。
catch 的六类音符本体使用约 50% 不透明度的实心圆与不透明同色描边，颜色、尺寸、hyperdash 提示和接盘
分别保持既有语义。背景图片、视频与底层故事板先合成，再模糊并应用亮度遮罩；音符、
界面及上层故事板不参与模糊。`PreviewBackgroundBlur` 用微型自绘画布检测实际滤镜能力，
不支持时采用复用双缓冲的降采样与分离高斯卷积，生产绘制不读取媒体像素。模糊缓存按
合成修订、半径与输出尺寸失效，暂停调节与跳转会重绘，退出释放辅助画布。
退出释放音源、视频和位图；本地媒体读取、音画同步及大故事板内存仍需双端真机验收。
`node scripts/check-osu-player.mjs [Playwright 模块入口]` 提供独立浏览器检查，使用小型样本
验证四模式静默就绪和显式播放，以及不支持滤镜时的实际模糊像素、图层边界和透明度。
添加 `--generated` 时，只读取已生成的 HTML、player.bundle 与 player.js，先核对两份脚本
字节一致，再验证四模式就绪、静音跳转、播放、暂停、重播和宿主暂停；不打包源码或像素辅助模块。
`node scripts/check-maimai-player.mjs [Playwright 模块入口] --generated` 同样只执行已生成的
播放器，覆盖普通、Buddy、缺失难度及音频/谱面尾段；默认模式另编译解析器并验证 Majdata
已解析输入和解析器时长。两种模式均明确输出覆盖与省略项，浏览器结果不替代原生 WebView 验收。

`webview-player/engine/source-manifest.json` 固定公开上游提交及逐文件摘要，第三方来源与
许可见根 `THIRD_PARTY_NOTICES.md` 和 `LICENSES/`。构建审计实际依赖清单，并将完整许可
写入相同的 `player.js`、`player.bundle`；皮肤由代码生成，音效缺失时使用合成后备音。

### Rizline 谱面确认

帧布局的音符、线段与特效候选经公共 `createIntervalIndex` 查询，完整绘制顺序在首次使用时准备。相机、画布、速度、颜色及 BPM 时间换算复用不可变轨道索引；负速、长 Hold、区间交界和倒退 seek 保留原有规则。播放终点取音频和加上 offset 的谱面尾部，音频结束后的尾段仍可改变播放速度。

详情难度卡在练习清单下方提供「查看谱面确认」，不提供谱面下载。
`/songs/rizline-chart-preview` 使用 `songId`、`levelIndex` 定位当前难度，标题仅用于显示。
`services/rizline-chart-preview-resources.ts` 经注入端口（默认装配注入
`rizlineResources.withRelease`）按发布曲库与清单 `files` 解析唯一 `.json` 谱面和 `.m4a` 音频，
`domain/rizline-chart-preview.ts` 只保留纯解析；`features/rizline-chart-preview/` 提供配置、
原生准备与 WebView 播放器，复用 `ChartPreviewScreenShell`、`downloadChartResource`、
`verifyResourceBytes`、注入工厂、`PlaybackClock` 与公共拨轮。准备超时为 120 秒。
谱面与音频经 `downloadChartResource` 落盘后，由 writer 写成会话脚本 `chart-data.js` /
`music-data.js`（`window.__RIZLINE_CHART_PREVIEW_CHART__` /
`window.__RIZLINE_CHART_PREVIEW_MUSIC__`），供 file:// WebView 以 `<script src>` 加载；
配置不带资源 URL，也不把谱面正文注入 HTML。会话目录 `rranker-rizline-chart-preview`
走现有临时缓存回收。
舞台按剩余空间铺满，渲染把 1080×1920（9:16）完整放下并留边；全屏保持竖屏，
隐藏设置行、保留时间轴、走带和锁定。设置键为 `rranker.rizline-chart-preview.settings.v1`。
官方 JSON 解析与 Canvas 绘制留在游戏播放器内。真机 WebView 音画同步无法用单测代替。
准备阶段的 `decodeAudio(bytes, environment?)` 只解码，不恢复音频上下文；suspended 状态也能
完成暂停就绪。显式播放经 `PreviewSession.playFrom` 等待 `resume`，随后复核命令代次与释放状态。

### Simai 谱面确认内核

`features/simai-chart-preview/configuration.ts` 是注入层与播放器的配置类型来源。
`chart-preview-inject.ts` 保留原导出，设置存储与页面桥接继续使用既有公共链路；
LXNS 与 Majdata 只提供谱面/音乐 URL，下载在 RN `prepare` 完成后再注入播放器。
普通难度和 Buddy `inote_2` / `inote_102` 使用同一解析器。

舞萌与 Majdata 的 Simai 语义集中在 `features/simai-chart-preview/engine/`：`SimaiParser` 输出带来源位置、实际时间、HS/SV、
Each 分组和分支/分段的音符模型；`prepareChart` 预计算路径与判定事件；`buildFrame`
按指定实际时刻生成有序绘制命令；`MainRenderer` 用 Canvas 2D 执行贴图、三切片与遮罩。
解析基准是 MajSimai 2.2.2 锁定 commit，表现数据来自 MajdataViewX。
滑条各段书写时长保存在模型；播放按 ViewX 的合并路径总时长与路径长度分配视觉速度。
`ScrollTimeline` 只影响视觉位置，音乐、正解音、结束和判定使用实际时间。
播放会话（`webview-player/playback.ts` 的 `SimaiPlaybackSession`）通过共享 `PlaybackClock` 重建暂停、跳转和变速状态，
并按命令代次丢弃等待音频上下文期间到达的旧结果；变速/跳转取消旧正解音调度。
`webview-player/timeConversion.ts` 的 `resolvePlaybackRange` 将各侧实际谱面时长按主谱引导拍
对齐，再与解码音频结束位置取较晚值；音乐转换包含 `firstMs`、偏移和 BPM 事件。
终点、进度条、拖动、小节跳转与背景共用这一范围，不能仅由 Simai 小节数决定结束。
步进与步退每次移动一拍，小节跳转按四拍定位；拍位置经同一时间轴换算为音乐时间。
音频自然结束后公共时钟继续驱动剩余谱面；达到播放终点且音源已自然结束才停止。
音频不可用或从音乐结束后开始播放时使用帧时间推进；暂停、跳转与退出仍释放旧音源和时钟。
Simai 预计算位置、Each/Slide 分组和开始、结束、烟花事件索引，保留相同时刻的原始顺序；
SV 为零、负值和非单调时继续做完整可见性判断。RPE 原地稳定压缩活动数组，保持绘制层次
及内部顺序，不调整音频时钟、帧率、判定或特效。

皮肤清单保存 SHA-256、尺寸与透明边界；缓存文件名包含资源修订，正解音文件名包含
内容哈希。共享计划执行器按已有非空缓存跳过下载，`bytes` 只作进度权重，通过 `skin-data.js` 注入 PNG。
`skinSemantics.ts` 解释语义名、S3 别名、默认 100 PPU、显示尺寸覆盖、中心锚点及切片/朝向；缺少必需贴图
时阻止播放。线上对象不因命名修正而变化。
粉色开关经同一帧命令入口替换普通单星和双星，使用 S3 原始粉色贴图；`SKIN_DISPLAY_SIZE`
保留原单双星显示占位和 EX 对齐。Each、Break、Mine 与 EX 专用贴图不参与替换。
图片缓存和视频共用等比完整容纳、居中和圆形裁剪的背景入口；圆直径等于方形画布边长，
背景底色为纯黑，保留 45% 暗化；背景遮罩不裁剪音符和判定层，画布尺寸变化使图片缓存失效。
打击特效跳过普通 TAP 与 Touch 的星型贴图，保留 Break 星型层、其余非星型图层及独立烟花；HOLD/TOUCH HOLD 持续粒子使用
Each 金色。Slide 不区分判定时使用六种方向的 `just_*_p.png`，区分模式保留原提示及 Break 闪烁。
判定区使用应用内原始 `assets/maimai-chart-preview/sensor.webp`，经共享计划暂存后写入
同一 `skin-data.js`。舞萌渲染器按原图图案中心与 197 PPU 校准判定区；判定点和判定线
按 S3 `outline.png` 的点径、线宽绘制，坐标复用音符的 `buttonPoint`，判定区叠加同一判定线。

独立参考程序位于 `apps/mobile/scripts/maimai-reference/`；原始 C# 路径输出和
MajSimai 输出作为 TypeScript 测试的外部基准。模型、素材与验收边界见
`docs/shared-logic.md` 的谱面确认合同，独立复现命令见该程序目录的 README。
八张 ViewX 内置特效贴图及其层级由
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

`master` 的分支保护属于 GitHub 仓库配置，不能由工作流文件自动部署。
发布策略独立核验原始事件、仓库、分支和源码 SHA，并要求该提交的构建准入检查通过。
必填状态检查应指向最终 `quality-gate` 聚合任务；它覆盖范围、轻检查、完整质量、应执行的账号专项、构建准入、双端构建和 Android 冒烟与交付。

生产依赖审计由 `scripts/check-production-audit.mjs` 和 `npm run audit:prod` 复核；critical
及未接受的 high 使门禁失败，当前接受基线为空。`package.json` / lock 对 XML、URI 解码、
brace-expansion、js-yaml、nanoid、PostCSS 等传递依赖提供兼容修复，Metro 使用 image-size
2.0.4 的字节与异步文件 API，xcode 使用保留 CommonJS v4 合同的 uuid 11。
安装的 postinstall 先运行 `patch-decode-uri-component.cjs`：校验官方 0.5.0 源码 SHA 后
生成仅改变导出形式的 CJS 适配，保留原 ESM 与类型，满足 query-string 7 和 Expo Router
消费者；版本、摘要或格式不匹配直接使安装失败。`patch-metro-image-size.cjs` 校验 Metro
0.83.3 与 image-size 2.0.4 版本，以及原始/适配后 `Assets.js` 摘要，使 `getAssetData`
的文件路径调用官方 `imageSizeFromFile`，ZIP 内字节保持 `imageSize`；适配幂等，未知源码
直接使安装失败。随后执行既有 WebView 原生桥补丁与 `patch-expo-file-handle.cjs`；后者校验 expo-file-system 19.0.24 原始及适配后源码 SHA，将 Android 文件句柄剩余长度按 Long 取最小值后转 Int，循环完成短读和短写，EOF 返回实际字节，零进度明确失败，不改 iOS 文件入口。`package.json` 的 `expo.autolinking.android.buildFromSource` 指定 `expo-file-system`，使原生构建编译适配后的源码。`dependency-compatibility.test.ts`
覆盖重复补丁、版本/摘要拒绝、实际路由/Metro/xcode 消费者与 Expo CLI 的 undici 6.28.1 请求能力，使用真实 PNG、JPEG、WebP
文件路径校验资产尺寸，并保留分辨率缩放与异步插件合同。

```powershell
npm ci
npm run lint
npm run typecheck
npm run check:architecture
npm run check:generated
npm run check:lossless-assets
npm run audit:prod
npm run test:unit
npm run test:ui
npm test
```

`npm run test:unit` 使用 Vitest 运行 `tests/**/*.test.ts`；`npm run test:ui` 使用 Jest Expo 串行运行 `tests/**/*.test.tsx`。公共 UI 还由 Host Tree/Style 哈希、HTML/脚本字符串金样和虚构游戏合同保护，禁止仅更新基线来接受未解释差异。

`npm run check:architecture` 扫描 `src` 与 `app` 的全部生产 TypeScript（import / export / require / 受支持的动态导入），
按 `scripts/lib/architecture-modules.mjs` 的模块登记判定归属并套用
`scripts/lib/architecture-boundaries.mjs` 的依赖矩阵（跨游戏隔离、公共核心反向依赖、领域/状态/存储/Provider 层反向依赖、服务层运行时导入 Hook、
`src` 反向依赖 `app`、共享渲染核心按游戏分支），通过时打印扫描文件数与范围；
默认 `TRANSITION_EXCEPTIONS` 为空；注入例外时必须精确匹配文件、目标和规则。
嵌套游戏页面按完整路径登记；默认值导入混合具名 `type` 时仍视为运行时依赖。
拒绝合同由 `tests/architecture-boundaries.test.ts` 与 `tests/shared-entrypoint-boundaries.test.ts` 覆盖；
脚本异常退出或出现违规即判失败。`@/features/**`、`@/domain/**` 等路径别名同样按仓库内相对路径解析归属。

公共 UI 的宿主结构由 `tests/host-contract-hash.ts` 的 `expectHostContract` 以规范化序列化文本的 sha256 判定，
`tests/host-contract-baselines/<测试文件名>/<用例域名>.json` 只是诊断基线：哈希不一致时用
`diffHostContractTrees` / `formatHostContractDiff` 报告按路径定位的结构差异。基线只在
`HOST_CONTRACT_UPDATE_BASELINE=1` 时改写，测试不会静默写仓库文件；哈希仍是唯一门禁。

应用类型检查与独立播放器检查共同组成 `npm run typecheck`：
`tsconfig.maimai-player.json` 覆盖 Simai 引擎/入口，`tsconfig.phigros-player.json` 覆盖
Phigros/Phira 及 RPE 入口，`tsconfig.osu-player.json` 覆盖 osu! 播放入口及引擎，
`tsconfig.rizline-player.json` 覆盖 Rizline 播放入口。
播放器源码改动后按所属功能运行 `npm run build:chart-preview`、
`npm run build:phigros-chart-preview`、`npm run build:osu-chart-preview`
或 `npm run build:rizline-chart-preview`；
四者共用 `scripts/lib/build-preview.mjs`，公共拨轮修改需重建舞萌、osu! 与 Rizline；
`chart-preview-shared/chart-preview-resource-budget.ts` 由 osu! 播放器
`webview-player/backdrop.ts`、`resource-plan.ts` 与 `events.ts` 引入，进入 osu! 闭包，
修改后同样需重建 osu!。
构建器的可选 `licenseBanner` 保留分发许可，`auditModules` 在写出前审计实际依赖。
`npm run check:generated` 不写文件，从源码重新构建并验证 HTML、player.js、player.bundle
与交付产物一致。打包成功不代表手机 WebView 播放验收通过。共享成绩图屏幕的预览与导出 WebView 显式关闭水平和垂直滚动指示器；禁止把原生滚动条捕获到相册图片中。

`npm run benchmark:optimization` 与固定基线比较完整 Simai 帧命令和 RPE Canvas 绘制
命令，覆盖跳转、暂停、变速、镜像、长 Hold、连接 Slide、Each、Mine、Break 和非单调 SV；
另测 6000 音符场景的 CPU 分布与 5000 首/20000 成绩搜索。Phigros 搜索通过
`indexSongsById` 一次建立曲库索引，保留首次匹配、别名、排序和筛选合同。
`npm run benchmark:phigros-push` 用确定性存档测量推分搜索在 30/300/1000 条成绩下的
总耗时与事件循环最大阻塞，不设 CI 耗时门槛。
测试中的请求数、数据库调用数和条目重绘次数是受控测量，不代表真机帧率。

本地原生命令包括 `npm run android`、`npm run ios`、Android prebuild 与 APK 脚本。Release、APK、EAS 或原生构建成本较高，只有用户明确要求时才执行；修改原生/Fabric/WebView 行为时，JS 测试通过也不能代替对应平台构建和真机验证。

### 生产包体积约束

`metro.config.js` 保留 Ionicons 字体子集映射，并只在 iOS/Android 将当前安装的 Zod
内部 `v4/locales/index.js` / `index.cjs` 解析到 `src/utils/zod-locales.ts`。
该模块仅导出默认英文语言；Zod 自身的初始化、Schema 与错误类仍使用原库。
二维码服务只导入 `jpeg-js/lib/decoder.js`，其类型引用 jpeg-js 自身声明。
不启用实验性全局摇树，也不把未引用的参考素材或测试文件算作包体积收益。

`plugins/with-android-abi-splits.js` 在顶层 `android {}` 插入 ABI 分包配置，并通过
Gradle properties 默认启用 Release R8 与资源裁剪，将默认 ProGuard 文件设为
`proguard-android-optimize.txt`。插件接受 `minify`、`shrink`、`optimize` 布尔选项，拒绝
未开启 minify 却开启 shrink 的组合；重复应用也会更新已有 ProGuard 配置。
`app.config.js` 的 `ANDROID_OPTIMIZATION_MODE` 选择 A（全部开启）、B（全部关闭）、
C（仅 minify）或 D（minify + optimize），缺省为 A，未知值立即失败。
插件在 `proguard-rules.pro` 中幂等保留 `expo.modules.kotlin.records.**` 的运行时注解，
防止全模式 R8 把反射产生的注解实例折叠为空；不关闭代码优化或扩大到整个 Expo/Kotlin 包。
其余自定义保留规则、签名与 Hermes 配置继续由原生工程决定。

`.github/workflows/android-recovery.yml` 是手动原生诊断入口，只允许本仓库分支，使用
GitHub 托管 runner，不读取生产签名或发布凭据。每次固定当前源码 SHA，选择 A、B、C
或 D 优化模式，执行配置单测并生成 x86_64 的独立诊断 APK；它不承担常规质量检查或正式发布。
应用生产入口由 `.github/workflows/quality.yml` 编排，Android 构建统一复用
`.github/actions/android-build/action.yml`。托管 Android 模拟器通过生产路由验收主题
持久化、日志启停与历史、账号启动恢复，通过后才上传四 ABI APK；设备结果独立保留。
主题与日志恢复检查在强杀后直接用携带目标 URL 的 VIEW Intent 冷启动，待目标控件出现才继续；
不在首页启动与导航就绪之间发送可能丢失的跳转事件。其余页面切换仍复用生产路由。
诊断分享和停止后的最新历史日志分享都必须实际打开当前系统 ChooserActivity，再返回
MainActivity 并等分享控件恢复可用，不选择分享目标。日志关闭后等待偏好保存、控制动作和
历史读取结束；历史分享按钮在屏外时，只在应用自身可见滚动区域内最多滚动八次，不能
因按钮不在首屏就判定数据丢失，也不能只凭按钮存在判定历史可读。日志错误文案立即使
验收失败，失败材料只记录预设控件、固定状态文案、边界坐标与错误类别，不保存任意节点
正文或原始设备日志。账号恢复检查同时拒绝安全会话与部分账号来源的读取失败；默认
空目录恢复正常与已有凭据恢复分别验收。文件写入失败后的文本分享兜底由故障注入测试验证，
正常系统分享检查不证明该故障路径已通过设备验收；真实账号登录、授权回调与上传另行验收。
原生诊断使用当前提交和所选优化模式；优化对照需保持源码、依赖、工具链、ABI 与测试签名一致。
`native-diagnostics-entry.tsx` 是独立构建入口，不初始化账号、主题和日志；
`services/native-storage-probe.ts` 只操作临时键、临时文件和临时数据库，检查真实
SQLite、KV 冷启并发、默认 KV、SecureStore、Crypto 和 FileSystem 桥接往返。
冷启测试启动 40 个消费者，经公共 KV 入口执行读写并等待所有任务落定后才关闭数据库。
六项结果保持 `name` / `status` / `detail` 合同；失败文案区分 `operation:`、`cleanup:` 与
`timeout:`，清理失败不覆盖首错。每项等待最多 15 秒，超时不提前关闭仍在执行的原生资源；
迟到完成及其清理结果独立进入 logcat，超时结果仍为失败。
结果直接进入 Text/testID 和 logcat；诊断 APK 不代表生产入口已通过验收。
`BUILD_SOURCE_COMMIT` 注入实际检出的提交身份，优化模式同时进入 Expo extra。

`quality.yml` 的 `android-account-recovery` 使用独立入口 `native-account-recovery-entry.tsx`、
包名 `com.rranker.app.nativeprobe`、每次生成的测试签名和固定源码 SHA，不使用生产凭据。
正式入口保持 `expo-router/entry`；只有选择诊断入口时 app/Metro 配置才启用测试插件和
`tests/native/expo-fetch-adapter.ts`。适配器仅将指定 LXNS / ScoreHub 请求转发至 runner 回环服务，
适配器通过同一公开入口的 `expo/fetch.js` 名称取得原生 Fetch；Metro 只映射 `expo/fetch`，
同目录的解析保持一致，避免目录级缓存把适配器内部导入指回自身。
继续使用真实原生 Expo Fetch，保留认证头、取消和响应流；验证实际响应 URL 且无重定向后，
才投影原请求 URL 以满足既有来源检查。HTTP 放行仅作用于诊断构建。
首进程一次领取随机合成凭据，经 `bindLxnsAccount` 和两个公共存储入口保存并读回核验。
runner 禁止重复领取，强杀并确认旧进程退出后开启恢复认证；第二进程使用同一次安装的同一 APK，
不清数据、不重装、不重新注入，通过 `restoreAppAccounts()` 恢复账号、凭据关联和活动账号，
再由真实 Provider 与 `fetchMe()` 请求。服务器只接受首进程对应的原令牌；双阶段同时校验构建 SHA。
成功与失败均清理合成账号、测试 APK、端口转发、服务器和临时签名。
测试入口在每个存储读取、凭据领取、绑定、写入、读回、恢复和认证步骤前发布固定子步骤。
runner 记录最后子步骤，成功失败均保存领取/拒绝计数和认证布尔值；失败只保留白名单错误分类与清理结果，
不输出原始异常、logcat 正文或凭据。脱敏证据同时进入作业日志与工件，另含 SHA、APK 摘要、进程身份和阶段结果，保留 7 天。
该闭环验证受控原生恢复；正式 Android/iOS 的真实账号保存、强杀、重启与官方认证另行验收。

双端体积检查使用 Expo 导出，指定 Android 和 iOS 平台、source map、资源映射及输出目录，
不启动 Expo Web。
统计主程序 Hermes、独立播放器和按实际内容 SHA-256 去重的导出资源，source map 不计入交付体积。
播放器已经包含在资源合计内；gzip 只作压缩参考，不代表 APK/IPA 或安装体积。
Android R8 收益必须通过相同 ABI 的原生 Release 包验收，iOS 需 macOS 出包验收。

`npm run check:lossless-assets` 对照固定基线核验已改 PNG；优化器只选择更小的 IDAT
压缩流，CRC、解压扫描线、RGBA/透明度和全部非 IDAT 块必须保持一致。原始来源 hash
与生成 hash 分别保留。基线中不存在的新增 PNG 单独验证 CRC 和完整解码，在报告的
`addedFiles` 中列出，不计作基线无损比较或压缩收益。仓库素材减少不直接等于导出收益，
导出中未引用素材不计入收益。

### CI 入口与事件矩阵

`.github/workflows/quality.yml` 统一编排质量检查与双端构建。它监听所有分支 push、PR 的
opened / synchronize / reopened / edited（包含修改目标分支）与手动触发；标签 push 不触发。

| 事件 | 通过范围、轻检查与完整质量门禁后的行为 |
|---|---|
| 本仓库任意分支 push，含 master | 沿用旧签名的四 ABI Release APK、签名 IPA，并将 IPA 提交 TestFlight |
| 本仓库分支的手动运行 | 与分支 push 相同，固定本次 github.sha |
| fork 内 push 或手动运行 | 只做质量检查；fork 须自行启用 Actions |
| 本仓库分支 PR | 只做质量检查 |
| 外部 fork PR 到 master | 测试签名 Release APK、无签名 IPA；不读取生产凭据、不提交 TestFlight |
| 外部 fork PR 到其它分支 | 只做质量检查 |

`changed-scope` 与 `light-check` 并行；`quality` 同时依赖两者成功，有功能或 CI 改动时执行完整检查。账号专项按 `account` 范围标志运行；`build-admission` 独立核对原始事件、来源和应执行的质量作业。双端构建只依赖共同准入，互不阻塞发布。
Android 按编译校验、`android-smoke`、`android-delivery` 顺序运行；末端 `quality-gate` 始终汇总范围、轻检查、完整检查、专项、准入、四个互斥构建作业及 Android 冒烟和交付。`.github/scripts/ci-gate.mjs` 从原始事件重新计算预期：应执行项必须成功，应跳过项必须明确跳过；失败、取消、缺失、意外跳过或意外执行均不能通过。纯文档只运行范围和轻检查。

### 范围、轻检查与完整质量检查

范围分类复用 `.github/actions/changed-scope/action.yml` 与 `classify.sh`，push 使用
`github.event.before`，PR 使用 `github.event.pull_request.base.sha`；基准不在本地时只获取
该提交，再以 `git diff --name-only --no-renames -z` 比较。任意目录下的 `*.md` 文件、
文档目录、许可声明与根级 README 截图全部满足非功能规则时跳过完整检查和构建；
CI、依赖、构建配置及应用资源改动
必须完整检查。无基准、基准不可取或 diff 失败按有功能改动处理；分类任务自身失败则阻断门禁。
`GITHUB_OUTPUT` 仅包含固定枚举和计数 `functional`、`account`、`reason`、`changed-count`。
账号、认证、持久化、公共组件、启动生命周期、依赖、原生配置和 CI 变更触发账号专项；只有已知游戏展示、主题、素材与播放器路径可以省略专项，未知路径或无法比较时执行。手动输入 `account-checks=auto/all`，`all` 强制完整质量检查及账号专项。
路径写日志前转义控制字符，写 summary 前再转义 HTML；改名同时枚举旧、新路径，不能隐藏代码删除。

轻检查只在 `.github/scripts` 安装固定的真实 YAML 解析器 `yaml` 2.9.0，不安装移动端依赖。
`check-light.mjs --self-test` 检查 YAML、shell 解码后的 `bash -n`、PowerShell AST、
`.mjs` / `.cjs` 的 `node --check` 与分类器自检；缺少 bash 或 pwsh 不静默跳过。
故意破坏的样例证明语法与分类错误能阻断。此阶段同时执行 `build-policy.test.mjs`、
`ios-build-number.test.mjs`、`ci-contract.test.mjs`、`account-recovery.test.mjs`、
`android-smoke.test.mjs`、`android-artifact.test.mjs`、
`verify-ios-archive.test.py` 与 `android_signing.test.py`，覆盖事件矩阵、伪造来源、门禁失败、
预留编号、部分签名文件清理、制品身份，以及受控账号闭环的错误令牌与重复领取拒绝。

完整检查在 `apps/mobile` 使用 Node.js 22 与 `npm ci`，依次执行 lint、typecheck、
全部单元/UI 测试、架构检查、`check:generated`、`audit:all` 和 `audit:prod`。
生成物检查从当前源码重新构建并比对正式生成物，不写文件。完整检查不执行 Expo prebuild 或原生编译。
生产审计分执行、解析校验、完整性与政策四层：异常退出、空报告、字段或计数不自洽、
未知严重级别、无法解析根因的空 via/悬空引用/成环都失败；critical 无条件失败，
未接受的 high 失败，接受记录的包名、版本与分类必须符合锁文件，当前接受基线为空。
`audit:all` 复用同一入口执行包含开发依赖的 `npm audit --json`，任何未修复级别都阻断，
不使用生产接受基线。安装阶段的 `patch-audited-dependencies.cjs` 修复 braces 3.0.3 的
glob 解析与 AST 递归深度，以及 node-forge 1.4.0 的嵌套 DigestAlgorithm 元素数量校验。
两项公告仍保留在原始报告中；审计只在公告范围、锁定版本、每个安装副本和完整补丁文件
均符合预期时标记已修复，审计过程不写入补丁。缺失、篡改、未知版本或新增公告仍失败。
这些修复只用于构建工具依赖，不改变应用谱面规模、播放质量或页面加载路径。

### 来源与发布凭据

`.github/scripts/build-policy.mjs` 的 `buildPolicy({ eventName, event, repository, ref, sha })`
只根据原始事件校验仓库身份、分支、PR 来源、删除状态与非全零的 40 位 SHA，返回
`{ build, production, sha }`。PR 一律使用 head.sha，不把 merge SHA 当应用源码；
其它事件使用 github.sha。质量检查、聚合门禁与四个构建作业独立比较 policy SHA 和原始
事件 SHA；正式构建 action 还要求 source-sha 等于 GITHUB_SHA 与实际 checkout。
外部 fork、PR 目标名称或 artifact 自报值都不能提升为正式签名权限。

发布作业只接受 `kckc7887/rRanker` 的分支 push / workflow_dispatch，并进入
`production-release`；该环境须允许本仓库所有分支，并配置 `PRODUCTION_SIGNING_READY=true`。
Android 明确选择 `legacy-debug`，沿用原 Expo 签名，并要求证书 SHA-256 与工作流固定值一致；
不依赖新增 keystore secret，不自动建立或替换签名。旧证书是调试证书，该 APK 为 Release
编译，不能视为商店正式签名制品。iOS 复用现有 ASC、证书、profile、P12 和 keychain 凭据，
缺失时在解码/安装材料前失败。secret 名称存在不证明证书、私钥或密码有效。
测试构建作业不进入发布环境、不引用任何 secrets；checkout 不持久化 Git 凭据。
仓库环境配置、密钥与分支保护独立于工作流文件，文件修改不代表远端配置已部署。

### Android 与 iOS 制品

`.github/actions/android-setup/action.yml` 为正式构建、账号专项与手动诊断统一安装 Node.js 22、Temurin JDK 17、Android SDK、Gradle 和 npm 依赖。
`.github/actions/android-build/action.yml` 执行 Expo prebuild 与 Gradle，使用 A 优化模式并复用 ABI splits 插件，一次产生
armeabi-v7a、arm64-v8a、x86、x86_64 四份 APK。版本与版本代码来自 app.json，不自动修改。
`verify-android-apks.py` 核验输出清单、每包 ABI、Manifest 包名/版本、统一证书、正式包
所选签名模式、旧证书身份、优化配置和 Record 注解规则，并保存源码 SHA、文件及证书摘要。
校验选择已安装的最高稳定 Build Tools 并输出版本，使用 `apksigner verify --verbose --print-certs`；
证书解析兼容编号签名者和 Build Tools 37 的 V1/V2/V3.0 单签名者标签，要求签名者数量为一，
拒绝重复、混合或未知证书标签，来源戳证书与公钥摘要不参与 APK 签名身份判断。编译校验后先保存候选工件，`android-artifact.mjs` 封存全部文件摘要、四 ABI 校验结果与来源。构建作业输出准确工件名和清单摘要，冒烟及交付按该输出下载、复验，失败重跑复用原候选，不重构工件名或重新编译已成功作业。通过生产路由冒烟后交付 APK；候选与最终 APK 保留 14 天，脱敏设备结果保留 7 天。交付名含本次验收尝试号，临时 keystore 始终清理。
`android-smoke.mjs` 保留命令行入口，设备命令与 XML 解析在 `lib/android-device.mjs`，流程在 `lib/android-smoke-flow.mjs`。每次抓取使用独立 XML 路径，空根节点、尚未生成或不完整 XML 在统一检查期限内重试，绝不读取上一快照。设备命令、应用崩溃、业务断言和等待超时分别记录；失败后采集诊断不能覆盖首个错误。
系统分享验收精确识别 framework 的 `ChooserActivity` 与官方 `com.android.intentresolver` 包的 `ChooserActivity` / `ChooserActivityLauncher` 短名和全名，拒绝应用别名、其它 Activity 及组件后缀；分享界面成为顶层活动后，等待该系统包出现已启用且有有效面积的 UI 节点再发送返回键，随后必须回到本应用。
fork 测试 APK 同样为 Release 优化构建，使用调试签名。现有 Android 发布路径与旧包保持
证书一致；默认调试私钥属于公开模板材料，不能获得私有发行密钥的身份安全保证。

`.github/actions/ios-build/action.yml` 是 IPA 的公共构建入口，在 macOS 26 执行 Expo
prebuild、Pods、Archive 与导出。`verify-ios-archive.py` 检查实际 Archive 和最终 IPA
中的 EXConstants/app.config 源码 SHA、Info.plist 包名、版本和构建号；正式 Archive 还验证 codesign。
Pods 安装通过 React Native 的 `ENTERPRISE_REPOSITORY` 指向 Maven Central 的
`https://repo.maven.apache.org/maven2`，保留依赖声明的版本及 Debug/Release 选择。
该步骤单独设置临时 `CURL_HOME`，让 CocoaPods 与 React Native 的 curl 下载均使用 HTTP/1.1、
20 秒连接超时、300 秒单次超时、持续 60 秒低于 1 KiB/s 时失败，以及最多 3 次重试和 900 秒重试窗口。
HTTP 错误与中断均明确失败或有限重试，临时配置无论安装成败都清理，不影响签名和发布请求。
正式作业先保存 IPA 与脱敏身份 JSON（14 天），再提交 TestFlight；上传接受不等于 Apple
处理成功或设备验收。测试作业以 CODE_SIGNING_ALLOWED=NO 归档并打包无签名 IPA，不请求 ASC。

所有正式 iOS 作业共用 `rranker-ios-testflight` 串行锁，`cancel-in-progress:false` 与
`queue:max` 保留最多 100 个等待项；不保证无限队列。`ios-build-number.mjs` 在锁内核验
当前运行与历史 artifact 的官方仓库/运行身份，取 Apple 当前版本最大整数与可信预留编号
的最大值加一。预留 artifact 必须先成功上传（90 天），才能签名、归档或提交 Apple；
失败/取消运行的预留仍占用，避免 Apple 尚未可见或失败重跑重复编号。只读取 artifact
元数据，不下载/执行正文，分页不完整、超时或 API 错误立即失败。预留依赖保留期限，
不应提前删除尚可能在 Apple 处理中的记录。营销版本仍由用户决定。

`app.json` 提供版本、包名和插件列表，`app.config.js` 按 `ANDROID_OPTIMIZATION_MODE` 配置
Android 插件参数，并向 `extra.buildCommit` 与 `extra.androidOptimizationMode` 注入实际检出提交和优化模式。
osu! OAuth 应用凭据不在源码中保存；动态配置从 `OSU_OAUTH_CLIENT_SECRET` 构建环境变量
向 `extra.osuOAuthClientSecret` 注入。
`osu-config.ts` 在调用时读取注入值，测试经同名进程环境变量提供。生产工作流只在本仓库可信
分支 push 或手动构建中注入，fork 测试不注入；缺失时构建仍可完成，
但 osu! 换码与令牌轮换明确报告配置不足。客户端内置授权方式的配置可从安装包提取，
不能把构建注入视为服务端保密；该接入模式不增加后端。
更换签名后的升级兼容与数据保留须在正式发布前实测确认。
