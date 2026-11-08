# rRanker 技术架构

## 工程与装配

rRanker 使用根 npm workspace 和根 `package-lock.json`。`plugins` 是固定提交的官方插件子模块，对应独立仓库 [rRanker-plugins](https://github.com/kckc7887/rRanker-plugins)。安装与集成构建从主仓库执行，应用在 `apps/mobile/package.json` 显式依赖参与装配的包。

| 目录 | 职责 |
|---|---|
| `apps/mobile` | Expo 应用壳、文件路由、设置页面、启动和插件装配 |
| `platform/sdk` | 插件合同、账号运行层、查询与持久化、共享组件、搜索、图片与媒体基础设施 |
| `platform/resource-integrity` | 公共资源完整性校验原生模块 |
| `plugins/games` | 游戏领域模型、评分、展示、页面、详情目标与个人曲库目标 |
| `plugins/providers` | 各数据源的认证、凭据、客户端、响应转换与账号目录 |
| `plugins/tools` | 游戏专属工具、总览贡献、成绩图、谱面准备与下载 |
| `plugins/shared` | Simai、osu!、JSON 谱面格式与播放器实现 |
| `plugins/native` | 官方插件使用的原生模块 |
| `apps/mobile/tests` | 业务输入、持久化、取消和界面交互验收 |
| `scripts`、`.github` | 外部包消费、质量检查与云端原生构建 |

移动应用使用 Expo 57、React Native 0.86、React 19.2、Expo Router 57、TypeScript 6，启用 New Architecture。Node 最低版本为 22.13。`apps/mobile/index.js` 先加载 `src/plugins.ts` 的显式插件清单，调用 `initializePlugins`，再启动 Expo Router。

公开包通过各自 `package.json` 的 `exports` 提供 TypeScript 源码、组件和资源。第三方工程通过实际包导出消费，应用的 `@/` 别名只用于应用壳内部。

## 扩展边界

`@rranker/sdk` 定义三类扩展：

- `GameAdapter` 提供游戏和模式信息、数据装配、账号摘要与评分展示、页面、详情和个人曲库目标解析、存储归属，以及公开能力声明。
- `DataSourcePlugin` 面向目标适配器的数据合同，实现登录、授权回调、凭据解析和比较、客户端构造、摘要补全、同步、账号创建及清理。
- `ToolPlugin` 声明目标游戏及所需能力，提供工具入口、页面、总览卡片和操作、详情操作、谱包下载、缓存目录。

依赖方向为插件依赖 SDK，数据源与工具依赖目标游戏的公开合同，应用依赖实际装配的插件。SDK 不导入具体插件，游戏不导入数据源或工具。适配器在 `GamePayloads` 上做模块扩充，保留自己的数据模型；平台只处理 `GameDataBundle` 与通用摘要。

适配器和数据源入口装配轻量元数据、目标解析与摘要规则。异步取数、账号操作和解析引擎通过 `import()` 按访问加载，页面、客户端及存储实现由原生模块加载器按需取得。Simai、Phigros、Rizline、osu! 的谱面能力参与工具可用性判断，包的类型导出约束具体调用。

官方示例由 `game-example`、`provider-example-test`、`tool-example` 组成，使用与其他插件相同的绑定、取数、页面、收藏和工具入口。示例账号与示例游戏由调试偏好控制显示。

## 页面与导航

应用保留总览、最佳、成绩、曲库、设置五个标签。`GamePageScreen` 根据当前适配器分发页面。`/detail` 接收显式 `gameId` 与适配器参数，先由 `parseDetailParams` 解析，再交给适配器详情页；链接通过 SDK 的 `detailHref` 生成。

`/plugins/[pluginId]/[pageId]` 分发工具页面，`/oauth/[providerId]` 分发数据源声明的授权回调。平台不登记各游戏详情页和各工具的独立路由。谱面准备载荷通过 SDK `page-navigation.ts` 传递引用，避免路由序列化复制大对象。

`CachedTabScreen` 保留已经进入的标签及局部状态。失焦和后台暂停查询通知、图片处理和页面任务，内存警告允许卸载隐藏页。`StackScreenActivityScope` 等待原生栈转场完成后开始重内容；详情难度轮播只挂载当前及相邻卡片，正在下载、编辑或保存的卡片继续保留。

总览的工具卡片、操作按钮和置顶内容由工具贡献。详情页通过 `ToolDetailActions` 传递适配器定义的 `LibraryTarget`，装配目标工具的 `detailActions`；工具负责自己的页面与操作。个人化页的成绩卡预览由适配器提供。共享通知、弹层、主题、列表和图片组件位于 SDK，游戏提供真实展示内容。

## 账号与凭据

`state/account-store.ts` 保存账号列表、`selectedAccountId` 和按凭据 ID 保存的一份凭据。账号通过 `credentialId` 引用凭据。`state/session-store.ts` 派生活动账号、游戏、数据源和会话，`sourceClient` 通过 `state/session-provider-resolver.ts` 的 `resolveAccountClient(accountId)` 按需构造与缓存。

实际活动账号从当前可用账号中选择。停用依赖时暂时回退到其他可用账号，没有则显示未绑定，默认游戏跳过调试开关隐藏的示例；保存的选择和账号信息继续保留，依赖恢复后重新使用原选择。

客户端收到 `SourceClientContext`，包含账号、实时只读的 `credential`、数据提交资格和 `commitCredential`。凭据读取与回写固定到构造时的凭据 ID 和来源代次。普通数据请求受游戏和账号写入代次约束，重新绑定或移除账号使旧提交失效。共享凭据的其他可用账号仍存在时可以完成凭据轮换；同 ID 重绑、清除会话或插件停用使旧轮换失效，重新启用后旧请求仍不可提交。

凭据更新沿 `session-credential-service.ts` 提交。磁盘返回过时或不存在时，仅在内存仍是本次新值的情况下撤回该值；后续更新继续保留。I/O 失败保留最新凭据并进入串行重试，连续轮换沿用最早尚未持久化的预期凭据；恢复前台时继续待保存工作。

`SecureSessionStore` 将账号索引保存在 KV，将凭据保存在分片 SecureStore。解绑先提交索引，再回收无引用凭据。成功读取后发现不支持结构，只重建对应索引或移除损坏凭据关联的账号；I/O 失败保留原数据并报错。未安装的数据源与损坏凭据分别处理，插件缺席不会删除其账号目录。

本地、示例和公开玩家目录由所属数据源恢复、创建、改名和清理。恢复失败按数据源和游戏单独记录并重试，其他成功账号继续可用。账号恢复先等待插件偏好；插件偏好读取失败时显示恢复重试入口，重试仍先读取该偏好。调试偏好读取失败时普通账号继续恢复，示例账号保持不可用。

## 取数与摘要

每个适配器在自己的 `data-source.ts` 声明实际读取合同，数据源的 `createClient` 返回该合同实现。公共曲库、目录和资料通过数据源声明的 `createResources` 取得，`getGameResourceSource` 在可用来源中按 `resourcePriority` 降序、插件 ID 升序选择，`resolveGameResources` 返回对应实现。页面不直接构造另一插件的客户端。

`useGameData` 和 `game-data-query.ts` 共用 QueryClient。每次查询按请求捕获的账号 ID 解析当前客户端，取消旧工作后重新取得具备当前提交资格的实例。适配器返回载荷及可选后台刷新结果，平台负责缓存首屏、后台发布、失败和取消。缓存回退保留真实来源、抓取时间和过时状态。

查询元数据携带 `pluginId`、`sourcePluginId`、`gameId`、`accountId` 中适用的作用域。清理和停用先使写入代次失效，再取消查询并删除对应缓存，迟到请求不能回填已清理内容。

账号头像、评分和展示资料共用 `account-hydration.ts`。`hydrateAccountDisplayData` 先恢复缩略图，再通过数据源的 `hydrateAccount` 补全资料；同一账号的在途请求共享结果，游戏、来源或账号代次失效时中止底层请求，摘要提交共用 `commitAccountMetadata`。`account-thumbnail.ts` 负责缩略图的读取、恢复和合并保存，内存摘要、缩略图与凭据索引中的展示资料使用同一账号提交资格。数据源优先使用已有查询和快照；Phigros 在读取磁盘前后都复核当前查询，LXNS、公开玩家和本地来源保留各自的真实读取方式。游戏专属摘要保存在 `displayData`，由适配器解释。

HTTP 使用 `totalAttempts` 表示总尝试次数，认证、轮询和有副作用的请求保留各自重试规则。QueryClient 默认最多重试一次并遵守 `ProviderError.retryable`。共享请求独立取消消费者，最后一个消费者离开时才取消底层请求。

## 插件启停

设置中的插件管理按适配器、数据源、工具分组，展示启用状态和目标依赖是否可用。偏好沿原有存储队列串行保存，保存失败保留当前启用状态。启动恢复账号前先恢复插件偏好。

停用通过 `applyDisabledPlugins` 使资源写入代次失效、取消所属查询、释放客户端并通知已打开的页面。停用来源仅取消来源及其账号的工作，同游戏其他来源和工具的查询继续保留。`useAccountBindingRequest` 同步订阅来源和游戏代次，取消登录与公开玩家绑定；`createAccount` 将同一提交资格传入账号目录写队列。登录和授权回调页面随来源可用性卸载。播放器停止媒体会话，成绩图取消准备与导出，下载取消尚未提交的保存。

停用保留账号、凭据、收藏、练习、标签、偏好和置顶记录。工具或游戏重新可用时恢复原有选择；未知插件 ID 的偏好继续保留。

## 个人曲库与备份

平台保存收藏、练习、标签和时间，适配器定义稳定的歌曲或谱面 ID 与详情参数。`LibraryTarget` 使用 `{ gameId, kind, id, target }`，SDK 不解释具体难度编号。osu! 四个模式使用各自游戏身份。

`UserLibraryService.createBackup(gameId)` 只读取指定游戏的条目和标签预设；`restore(gameId, backup, mode)` 在写入前检查备份游戏、结构和全部目标。错误游戏、混合游戏、旧结构及无效目标直接拒绝。

合并和替换在同一数据库事务内处理目标游戏。空备份替换也只清空目标游戏。标签预设按游戏单独保存，游戏切换或插件停用会取消尚未提交的导入。数据库异常回滚，不会把读取失败解释为空数据。

导入与导出入口在个人曲库右上角“⋯”，使用系统文件选择和分享。设置页不提供全游戏备份。`user-library-service.ts`、`sqlite-user-library-repository.ts` 和 `use-user-library.ts` 是同一条业务路径。

## 存储与生命周期

`runDatabaseWrite` 串行处理业务数据库初始化、事务和写入。`createPreferencesStore`、KV 键队列及偏好写入协调器复用已有机制。结构不变的数据继续读取；不支持的结构只重建所属键、条目或表。

适配器通过 `storage` 声明查询键、账号快照、资源前缀和持久数据归属；工具通过 `cache` 声明文件目录和当前资源版本。没有专属存储声明的游戏按账号目录中的 `gameId` 统计与清理，账号 ID 不要求游戏前缀。存储管理从装配结果收集这些声明，统计与清理包含已停用插件的数据。可重新获取的缓存与本地成绩分开统计和清理。

工具箱置顶按游戏保存，牌子与收藏品置顶由各自工具保存。格式播放器偏好由共享格式库管理；成绩图偏好和会话按游戏、账号隔离。

启动维护、清缓存、页面退出、后台活动和内存警告继续使用共享请求、图片缓存、事务队列、页面活动控制与媒体会话。诊断与运行日志由 SDK 的独立日志存储管理。

## 成绩图、搜索与谱面

舞萌、中二、Phigros、Rizline 的模板和专属素材位于各工具包。SDK `features/best-image` 管理素材会话、HTML 准备、WebView 预览、分页截图、保存与取消。素材选择器复用 `useLocalSearch` 的 4 ms 分片搜索、搜索文档缓存和可见行图片处理。

Rizline 的曲包、定数范围、默认曲目和排序根据成绩及曲库快照记忆化。素材进度跳过相同值，成功、失败与取消通过当前会话立即更新。账号切换、插件停用和退出页面使未完成的准备失效，释放会话等待正在进行的截图结束。

`chart-simai`、`chart-osu`、`chart-json` 提供格式解析和 WebView 播放器；游戏定义领域载荷，工具读取资源并装配播放器输入。公共 `chart-preview-screen-shell.tsx` 管理准备、WebView、暂停、定位、AB 循环和释放。桥接只处理当前事件与设置，控件、播放时钟及媒体会话共用 SDK。

谱包下载复用 `saveChartPackage` 串行选择保存目录。排队取消不打开选择器；已打开的原生选择器结束并恢复前台后，再检查取消和执行写盘。视频与音频资源属于当前播放会话，退出先取消工作再回收资源。

播放器源码、HTML、脚本和许可证归对应格式包。生成脚本输出在各包的 `src/assets`，应用通过包导出引用。Simai、PGR、RPE、osu!、Rizline 保留自己的时间解释、渲染顺序和规则。

## 安装、检查与云端构建

```sh
git submodule update --init --recursive
npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm test
npm run check:generated
npm run check:packages
```

`check:packages` 将 SDK、适配器、数据源、工具、格式库和原生包实际打包，安装到独立消费工程，再编译只使用公开接口的外部游戏、数据源和工具。其解析环境不使用应用的路径别名。

Vitest 执行纯业务与异步模块测试；Jest 执行页面和 `*.native.test.ts` 的原生客户端、存储集成测试。两者通过 `tests/plugin-setup.ts` 装配轻量插件清单，原生外部依赖由各业务用例模拟。

CI 的 push 与 PR 入口均检出固定子模块提交，使用根锁文件安装。质量检查覆盖 lint、类型、业务和 UI、生成物一致性、外部包消费及 CI 脚本。生成物不一致时，云端额外生成播放器资源并上传供维护；该次一致性检查仍失败，提交资源后重新检查。

Android 使用相同 Expo 配置构建四 ABI Release APK，并执行包、签名及设备入口验证。iOS 在 TestFlight 队列中构建、签名、校验并上传。应用版本由现有 Expo 配置决定。

`app.config.js` 装配公共配置与插件原生配置。原生能力通过应用显式依赖和 Expo autolinking 接入。Android 最低版本为 7，compile/target SDK 为 36；iOS 最低版本为 16.4，构建要求 Xcode 26.4 或更新版本。

对外 APK 文件名为 `rRanker-arm64.apk`、`rRanker-armeabi.apk`、`rRanker-x86.apk`、`rRanker-x86_64.apk`。正式 Release 发布流程沿 `resource-release.yml` 将校验后的附件同步到资源仓库。
