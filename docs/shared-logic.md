# rRanker 公共逻辑

实现、导出和调用方是当前事实。改动前先检查已有入口，复用实际业务路径；不为测试或假想扩展增加公共 API。测试模拟外部依赖，验证产品结果。

## 领域与查询

| 内容 | 公共入口 |
|---|---|
| 游戏身份与绑定 | `src/domain/game-bind-options.ts`、`bound-account.ts` |
| 游戏载荷 | `src/domain/game-data.ts`、`src/services/game-data-loaders.ts` |
| QueryClient | `src/state/query-client.ts` |
| 页面取数 | `src/hooks/use-game-data.ts`、各游戏查询 hook |
| 展示模型 | `src/features/game-content/adapters` |
| 详情身份与 URL | `src/domain/detail-target.ts` |
| 筛选与搜索 | `src/components/game-content/FilterShell.tsx`、`src/utils/search.ts` 与所属游戏模型 |
| 难度标记 | `src/components/game-content/GameDifficultyBadge.tsx` |

展示模型使用实际 `GameId`。`DetailTarget` 描述游戏内真实目标，URL 必须携带 `gameId`；osu! 谱面使用 `beatmapId`，舞萌谱面带类型和难度索引。行、卡片、随机工具和个人曲库都通过 `detailTargetHref` 跳转。

Provider 负责上游请求与响应转换，页面不拼接认证请求。HTTP 使用 `totalAttempts`，有副作用的请求按实际规则限制重试；取消在公共请求入口处理。上游当前格式中的字段和平台必需的 SDK 适配继续由所属模块处理。

`cacheFirstLoad` 提供本地首屏和后台刷新，返回缓存必须保留抓取时间与来源。`refresh-result.ts` 定义当前刷新结果和快照元数据，`useGameData` 发布实际状态；调用方不再读内部字段或复制轮询器推断刷新是否成功。

`createInflightGuard.share` 共享同键工作并独立取消消费者。`useBoundedQueries` 管理实际批量明细；服务的实际网络请求使用现有队列。清缓存先失效对应资源代次，真实异步结果在最终提交处检查资格。

## 会话与账号

| 内容 | 公共入口 |
|---|---|
| 状态与活动账号 | `src/state/session-store.ts` |
| Provider 解析 | `src/state/session-provider-resolver.ts`、`src/services/session-providers.ts` |
| 恢复与展示资料 | `src/services/account-restoration.ts` |
| 凭据绑定与轮换 | `src/services/session-credential-service.ts` |
| 安全账号仓库 | `src/storage/secure-session-store.ts` |
| 账号增删 | `src/services/account-management.ts` |
| 可选账号目录 | `src/storage/create-account-list-store.ts`、`create-demo-account-store.ts` 与所属 Store |

恢复读取当前账号索引和引用的当前凭据，不搜索旧来源或孤立分片。不支持的整个索引重建为空，单个不支持的凭据只删除关联账号；I/O 失败继续报错。恢复界面提供当前读取失败的重试与清除操作。

凭据轮换提交检查当前账号、期望会话与取消信号。共用凭据的账号一起更新；解绑、重新绑定或较新轮换发生后，旧结果不能覆盖新凭据。实际持久化失败保留待保存会话，前台恢复时重试。Provider 通过模块函数接线，不提供运行时替换或空 setter。

`LargeSecureValueStore` 使用当前清单与分片保存长值，遵守 SecureStore 单值字节限制。写入以 SDK 返回结果为准，不在正常路径再次读回自证。提交失败后的回滚检查用于保护当前引用，属于实际故障处理。

可选账号目录成功读到不支持的数据时重建所属键；读取失败不覆盖。账号变更通过 `enqueueKeyMutation` 按存储实例和键串行，前一个失败不阻塞后续操作。示例账号的当前开关与显示保留。

## 存储、偏好与个人曲库

`rranker-database.ts` 提供数据库连接和 `runDatabaseWrite`。业务 schema、事务与写入共用队列；日志数据库单独串行。任务内不可再次进入同一队列。

`SqliteSnapshotRepository` 提供当前成绩与资源缓存。版本不符或正文损坏仅删除受影响条目；等待写队列后的删除使用读到的值作为条件，保留后来写入的有效缓存。I/O 错误传播，不按失效内容处理。

`createPreferencesStore` 读取并校验当前格式，成功读到不支持的结构才写当前默认值。`preferences-write-coordinator.ts` 管理真实页面选择、串行保存和失败补写，恢复未完成时不把占位默认值覆盖到磁盘。

`UserLibraryService` 是收藏、练习、标签、预设、导入导出的业务入口；`SqliteUserLibraryRepository` 在真实事务内读写。单项动作只改对应行；清游戏保留其他游戏和全局预设。当前库 schema 为 4，不支持的表结构只重建个人库所属表。

备份只支持版本 3，`gameId` 必须存在。`parseUserDataBackup` 在导入前拒绝旧格式；`mergeBackup` 在同一事务内合并/替换条目与预设，条目或预设上限失败不会留下部分写入。`user-data-file-service.ts` 通过系统文件选择与分享读写当前备份，临时副本使用后删除。

存储管理通过 `features/storage-management/game-storage-adapters.ts` 统计和清理各游戏当前缓存。用户数据、凭据、日志与可重新下载的资源按实际归属处理；清理释放量以实际前后统计为准。

## 上传与生命周期

`upload-maimai-from-friend-code.ts` 执行好友码上传，`upload-task-controller.ts` 保存唯一任务。任务持有自己的取消信号、前台等待和曲库等待；关闭弹层保留任务，显式取消终止。迟到阶段、回调、刷新和通知不能进入下一任务。

`UploadPrefsStore` 按好友码保存选择，UI 的 `selectedAccountIds` 从当前好友码派生。`ScoreHubAccountStore` 保存 v3 索引与安全令牌，只有当前结构。删除先提交索引再清理引用；附属清理失败不能假装账号仍存在。

`AppLifecycleProvider`、`useAppRuntime` 与 `CachedTabScreen` 管理前后台和页面活动。后台取消前台工作；内存警告释放非活动查询、图片内存和必要的 WebView。前台仅恢复仍活动的未完成工作，不额外刷新已有缓存。

## 图片与共享 UI

`RemoteImage` 是远程图片入口，使用 `cacheProfile` 明确 thumbnail、artwork、native 或 none。`remote-image-cache.ts` 管理压缩图片、缓存身份和文件清理。先显示已落盘缩略图，在线图成功显示后才开始新落盘；失活或清理取消待写任务。

通用行、卡片和封面位于 `components/game-content`，游戏组件只提供实际展示差异。`GameDifficultyBadge` 使用普通样式覆盖，保留尺寸、渐变和文本。列表的页面活动、可见性与图片落盘通过现有共享组件传递。

绑定弹层复用当前输入、按钮、扫码和 `useAccountBindingRequest`。公共错误文案隐藏无助于用户决策的底层异常；实际错误进入诊断记录。

## 成绩图与谱面功能

成绩图公共入口位于 `features/best-image`：`useBestImagePreview`、`useBestImageExport` 与共享页面壳。各游戏负责当前素材、字体和布局。预览、导出、取消和资源释放消费同一真实控制路径，不提供测试 reset 或统计快照。

谱面公共入口位于 `features/chart-preview-shared`：

- `chart-preview-screen-shell.tsx` 管理宿主准备、WebView、取消、暂停和释放。
- `chart-preview-bridge.ts` 解析当前播放器事件、设置信封和宿主命令。
- `chart-preview-navigation.ts` 交接当前预览请求。
- `webview-player` 提供四套播放器共用的设置 UI 与手势。

`webview-player/controls.ts` 的 `installPreviewControls` 复用原按钮与监听，固定标题和画面，下方控制与参数独立滚动；`stageAspectRatio` 保留各游戏比例，画面高度不超过标题下方可用空间的 55%。舞萌实时信息固定两行，首行为 BPM、拍位置和 FPS，次行为 COMBO、BREAK；每行高度固定、数字等宽，超宽时横向滚动。所有谱面确认页隐藏 WebView 与页面内部滚动条，保留滑动。`setPreviewFullscreen` 保存、恢复普通模式滚动位置。

`heading.ts` 的 `renderPreviewHeading` 同行显示曲名和难度数值。曲名按内容宽度排列，标签紧随其后；曲名最大宽度为 12 个汉字，超长往返滚动；标签只渲染 `PreviewDifficulty.value`，沿用游戏侧配色。舞萌、Phigros、Rizline 使用真实定数，osu! 使用星数，Majdata、Phira 使用原生难度值；缺失显示“—”。

`playback-loop.ts` 的 `PlaybackLoop` 由四套会话分别持有，端点沿用各自时间单位、不持久化；`toggle` 记录、清除、交换端点，`target` 在两个不同端点就绪并到达 B 时返回 A。`bindPlaybackLoop` 同步普通与全屏按钮和 `HeatTimelineView.updateLoop`。各会话先检查循环再处理结束，回跳沿用原 seek/播放路径同步音频、打击音、背景与渲染。

`fullscreen-controls.ts` 的 `bindFullscreenControls` 共用整页非控件区域点击与 5 秒隐藏计时；拖动不切换显隐，操作期间暂停计时，结束后重新计时。游戏入口保留方向与锁定状态，方形锁定按钮与全屏控制器右侧对齐，位于控制器上方 16px，锁定时只唤出解锁入口。行为由 `chart-preview-loop-controls.test.ts`、各播放会话测试和浏览器交互验证，浏览器结果不替代真机验收。

设置采用当前信封格式，暂停和 seek 使用当前命令；释放只清理所属会话的帧、音源、监听器和临时资源。共享播放器源变更后重建四套生成物并运行 `check:generated`。

Simai 统计和预览共用 `simai-chart-preview/engine`。Phigros/Phira 共用 PGR/RPE 配置与资源路径。osu! 四模式共用宿主与当前谱面、皮肤、回放入口。Rizline 使用实际音频和发布资源依赖。

Phigros/Rizline 预览和下载共用 `phigrosResources`、`rizlineResources`、`VerifiedReleaseSession` 与 `verifyResourceBytes`；调用方提供实际进度或落盘回调。`resourceObjectPathSchema` 限定资源组、分类与哈希文件名。Phigros 曲绘、头像、成绩图和预览通过清单逻辑路径查找对象，实际 URL 来自 `objectKey`；默认谱、里谱和共用音乐选择仍由 `phigros-chart-preview.ts` 处理。哈希 URL 不附加全局发布版本，未变化资源可以继续命中缓存。

`PhigrosKyouProvider` 在一次调用中固定已验证的清单，再按表名读取并校验字节；别名、标签、引用关系和完整性检查共用现有 Provider 入口。Rizline 曲库缓存使用格式 2，并沿用 `SqliteSnapshotRepository` 对结构失效与 I/O 失败的区分。

Phigros 存档展示缓存和账号头像缓存使用格式 2。账号缩略图读取时校验 Phigros 头像属于当前哈希地址结构，失效缓存通过所属仓库入口重建；头像同步会重新解析结构失效的地址，其他游戏头像缓存格式保持各自合同。

`features/chart-download-shared` 提供原生下载、进度和取消；各游戏负责组装谱面包。

## 工具与诊断

KALEIDXSCOPE 的课题、日程和进度通过 `domain/kaleidx-scope.ts`、`state/kaleidx-scope-progress.ts` 与当前工具页面读取。进度按账号保存，独立补记关卡和课题；估计日程不能冒充已确认状态。

`runtime-diagnostics-recorder.ts` 是运行日志入口；日志数据库独立于业务事务。页面通过 `runtime-diagnostics.ts` 和日志服务读取、清理、分享，不直接拼接数据库操作。文件 pending/previous 是当前替换协议，临时分享副本可清理。

## 修改与验证

先读实际导出和调用方，再修改当前入口；不维护额外模块登记、结构基线或检查器。真实行为测试覆盖输入输出、交互、取消、缓存清理后的迟到写入、账号轮换、当前备份往返和 I/O 失败。

在 `apps/mobile` 运行 `npm run lint`、`npm run typecheck`、`npm test` 和 `npm run check:generated`。CI 脚本测试位于 `.github/scripts`。原生 APK、iOS、真实账号和云端 CI 的结果分别验证和报告。
