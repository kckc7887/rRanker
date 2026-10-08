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

`cacheFirstLoad` 提供本地首屏和后台刷新，返回缓存必须保留抓取时间与来源。`refresh-result.ts` 定义当前刷新结果和快照元数据，`useGameData` 发布实际状态；调用方不再读内部字段或复制轮询器推断刷新是否成功。舞萌五维难点整库写入 `maimai:dxtag:all` 资源缓存，不设时间有效期。`loadCachedMaimaiDxTag(catalog, signal)` 对照当前 LXNS 曲库中的普通谱面及难度，完整则直接复用，缺失则读取 `DXTag/all.json`；更新失败返回保留原来源和抓取时间的暂存结果，取消或清理后禁止迟到写入。

`createInflightGuard.share` 共享同键工作并独立取消消费者。`useBoundedQueries` 管理实际批量明细；服务的实际网络请求使用现有队列。清缓存先失效对应资源代次，真实异步结果在最终提交处检查资格。

ADOFAI 个人曲库按收藏关卡 ID 调用 `useTufLibraryLevels`，以三路有界查询复用 `useTufLevel` 的查询定义与 `['tuf', 'level', levelId]` 缓存。单项详情失败不删除收藏或标签。`TufRandomChartsScreen` 按当前前台和页面焦点取消补页，恢复后只加载尚未完成的页；`prefetchTufPassPage` 在提交前检查取消信号与资源代次。

舞萌、中二、Phigros、Muse Dash 随机页沿用 `RandomChartsPage` 的状态与重试入口。有缓存时继续使用；没有成绩时允许普通抽取并显示缺失值，启用成绩筛选则暂停抽取。`RandomUnplayedChartCard.scoreAvailable` 区分未知成绩与确认未游玩。Muse Dash 的专辑和定数是随机池必需数据，角色与精灵资料仅用于可选展示。

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

可选账号目录成功读到不支持的数据时重建所属键；读取失败不覆盖。`key-value-storage.ts` 的 `enqueueKeyMutation` 按存储实例和键串行执行完整的读取、失效重建、保存与删除，账号目录、示例账号、临时账号和偏好共用；队列内读取不重复入队，前一个失败不阻塞后续操作。示例账号的当前开关与显示保留。

## 存储、偏好与个人曲库

`rranker-database.ts` 提供数据库连接和 `runDatabaseWrite`。业务 schema、事务、写入与个人曲库外部读取共用队列；日志数据库单独串行。任务内不可再次进入同一队列。

`SqliteSnapshotRepository` 提供当前成绩与资源缓存。版本不符或正文损坏仅删除受影响条目；等待写队列后的删除使用读到的值作为条件，保留后来写入的有效缓存。I/O 错误传播，不按失效内容处理。

`createPreferencesStore` 读取并校验当前格式，成功读到不支持的结构才写当前默认值。`preferences-write-coordinator.ts` 管理真实页面选择、串行保存和失败补写，恢复未完成时不把占位默认值覆盖到磁盘。

`UserLibraryService` 是收藏、练习、标签、预设、导入导出的业务入口；`SqliteUserLibraryRepository` 在真实事务内读写。单项动作只改对应行；清游戏保留其他游戏和全局预设。当前库 schema 为 4，不支持的表结构只重建个人库所属表。

备份只支持版本 3，`gameId` 必须存在。`createBackup` 通过仓库的 `readBackup` 在同一次队列任务内读取条目与标签预设。`parseUserDataBackup` 在导入前拒绝旧格式；`mergeBackup` 在同一事务内合并/替换条目与预设，条目或预设上限失败不会留下部分写入。`user-data-file-service.ts` 通过系统文件选择与分享读写当前备份，临时副本使用后删除。

存储管理通过 `features/storage-management/game-storage-adapters.ts` 统计和清理各游戏当前缓存。用户数据、凭据、日志与可重新下载的资源按实际归属处理；清理释放量以实际前后统计为准。

## 上传与生命周期

`upload-maimai-from-friend-code.ts` 执行好友码上传，`upload-task-controller.ts` 保存唯一任务。任务持有自己的取消信号、前台等待和曲库等待；关闭弹层保留任务，显式取消终止。迟到阶段、回调、刷新和通知不能进入下一任务。

`UploadPrefsStore` 按好友码保存选择，UI 的 `selectedAccountIds` 从当前好友码派生。`ScoreHubAccountStore` 保存 v3 索引与安全令牌，只有当前结构。成功读取到失效令牌时仅移除其账号索引，保留健康账号；I/O 失败不提交部分清理。删除先提交索引再清理引用；附属清理失败不能假装账号仍存在。正常凭据写入以 SDK 结果为准，提交异常时保留引用检查与回滚保护。

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

设置采用当前信封格式。宿主读取设置失败时进入现有重新加载流程并保留原偏好；成功读到损坏内容时只重建对应设置键。暂停和 seek 使用当前命令；释放只清理所属会话的帧、音源、监听器和临时资源。共享播放器源变更后重建四套生成物并运行 `check:generated`。

Simai 统计和预览共用 `simai-chart-preview/engine`。Phigros/Phira 共用 PGR/RPE 配置与资源路径。osu! 四模式共用宿主与当前谱面、皮肤、回放入口。Rizline 使用实际音频和发布资源依赖。

舞萌与 Majdata 共用 Simai 播放器，保护套不额外高亮，绝赞滑轨使用绝赞配色。PGR 的 `pgr-preview-config.ts` 提供 `showBlockArea`（默认开）和 `showBlockAreaBounds`（默认关），通过现有设置桥接保存。`pgr-blocks.ts` 共用区域变换，判定范围仅按 enable/disable 取样；`pgr-block-renderer.ts` 用未扭曲区域合成后的边界绘制青色框，两个显示开关独立。RPE 不显示这两个选项。

`loadMajdataParsedChart(song, level, signal)` 返回预览模型、物量与 `difficultyScores`。难点值由 `features/simai-difficulty` 的 `simaiDifficultyScores(text, slot)` 使用同一份原始文本计算，按键盘、星星、技巧、体力、爆发排列，范围 0–10，保留一位小数；七个槽位均可分析。分析失败或滑轨不完整返回 `null`，不影响已有物量。结果复用按歌曲修订与难度隔离的解析缓存，缺少难点字段的缓存只重建对应条目，I/O 失败不清缓存。详情仅为当前可见难度启用查询，并只在有完整难点值时显示雷达。

`components/game-content/SimaiDifficultyRadar` 为舞萌详情、舞萌实力分析和 Majdata 详情共用雷达，使用相同轴序、刻度与一位小数展示，颜色由调用方传入。

Phigros/Rizline 预览和下载共用 `phigrosResources`、`rizlineResources`、`VerifiedReleaseSession` 与 `verifyResourceBytes`；调用方提供实际进度或落盘回调。`resourceObjectPathSchema` 限定资源组、分类与哈希文件名。Phigros 曲绘、头像、成绩图和预览通过清单逻辑路径查找对象，实际 URL 来自 `objectKey`；默认谱、里谱和共用音乐选择仍由 `phigros-chart-preview.ts` 处理。哈希 URL 不附加全局发布版本，未变化资源可以继续命中缓存。

`domain/phigros.ts` 的 `loadNoteCountsTable` 解析每难度四项或五项非负整数数组，第五项为谱面 `blockAreaList` 数量，正值写入 `PhigrosChartNotes.block`，零值省略。`PhigrosCatalogProvider` 按难度装配物量；详情复用 `GameNoteTable`，有正 BLOCK 时放在 FLICK 与总计之间，缺失或零值不显示整列。`total` 只包含 Tap、Hold、Drag、Flick。解析、已验证资源刷新及详情交互由现有 Phigros 测试覆盖。

`PhigrosKyouProvider` 在一次调用中固定已验证的清单，再按表名读取并校验字节；别名、标签、引用关系和完整性检查共用现有 Provider 入口。Rizline 曲库缓存使用格式 2，并沿用 `SqliteSnapshotRepository` 对结构失效与 I/O 失败的区分。

Phigros 存档展示缓存和账号头像缓存使用格式 2。账号缩略图读取时校验 Phigros 头像属于当前哈希地址结构，失效缓存通过所属仓库入口重建；头像同步会重新解析结构失效的地址，其他游戏头像缓存格式保持各自合同。

`features/chart-download-shared` 提供原生下载、进度和取消；各游戏负责组装谱面包。`saveChartPackage(fileName, output, signal?)` 在目录选择前、目录选择后及写出前检查取消，保持 `ChartPackageDownloadCancelledError`。舞萌、Majdata、Phigros、Phira、osu! 将下载任务的信号传到保存入口。

## 工具与诊断

`components/ArcadeMap` 是音游地图的公共 UI 入口，接收 WGS84 相机目标、恢复中心、机厅与选中 ID；平台视图通过 `NativeArcadeMap` 装配 MapKit 或高德。公共层管理高德首次说明、加载失败重试和手势来源，程序移动相机不发出用户选址事件。`services/arcade-map-platform.ts` 共用地图与地点搜索的架构、配置和同意状态；读取失败转为地图重试状态。`ArcadeFilterBar`、`ArcadeBusinessStatusLabel`、`arcadeFinderPreferencesStore` 与外部导航入口继续共用；距离与机型偏好按游戏保存，默认收起筛选。

`fetchNearcadeDiscover` 接受 WGS84 中心、距离、机型与取消信号，返回当前范围内的机厅。`domain/arcade-coordinates.ts` 提供坐标边界转换与球面距离，`arcade-shops.ts` 共用筛选、展示和营业时间判断；缺失距离为 `null`。跨夜营业以次日小时表达，周表从周一开始，凌晨同时检查前一日。页面按焦点和前台生命周期取消取数，GPS 意图与地图中心分别防止旧定位、旧查询覆盖；图钉和列表共用选中 ID。行为测试覆盖拒绝定位、快速拖图、选中联动、页面退出、迟到响应及跨夜营业。

`searchNearcadeShops` 接受关键词、页码、机型和取消信号，返回 20 条分页机厅及总数、当前页和下一页状态，不接收距离。`searchArcadePlaces` 返回至多 10 条 WGS84 地点候选；`resolveArcadePlace` 为无坐标候选调用原生地理编码。两者通过 `ArcadeMapSupport` 调用原生模块，复用地图服务同意状态并处理取消、超时；服务不可用不阻断机厅查询。`useArcadeSearch` 管理 350 毫秒防抖、独立请求及分页，`ArcadeSearchResults` 展示两类候选与各自重试。页面选择候选后恢复附近列表，选中机厅在附近响应中缺席时仍按当前距离与机型保留。交互测试验证跨城选择、筛选分页、部分失败、迟到地理编码和定位授权期间的短暂失活。

实力分析共用 `app/tools/strength-analysis.tsx` 路由，分别装配 `MaimaiStrengthAnalysisScreen` 与 `PhigrosStrengthAnalysisScreen`。舞萌的 DXTag 维度、类型、文件 ID 与难度匹配函数由 `domain/maimai-dxtag.ts` 提供，详情与分析复用 `useMaimaiDxTag`，查询键为 `['maimai-dxtag', 'all', catalog.source.updatedAt]`；曲库快照更新后重新核对覆盖，多个谱面共用整库请求。持久化数据与账号无关，由舞萌资源缓存统一计量和清理；缺少歌曲或难度时不追加单曲请求，也不填零。`SimaiDifficultyRadar` 接受空维度并支持维度点击；空维度显示暂无数据，不绘制完整多边形。

`buildMaimaiStrengthPool` 使用 `buildBestRecordMap`、`chartVersionKey` 去重，排除宴谱与不完整成绩；达标成绩中定数最高 10 张的均值确定推荐范围 −0.5 至 +0.3。`analyzeMaimaiStrength` 接收曲库、成绩、按谱面身份索引的 DXTag 五维，统一按 100.5% 筛选达标成绩，输出逐维 Top 10 正值均值、支撑成绩、强弱结论及最多三张推荐。每维至少三张才判断强弱，极差不超过 0.3 视为均衡；推荐模拟达到目标后的维度均值增益，最低两维的边界并列项全部纳入，均衡时考虑全部维度。缺失特征不当作零值，分析结果不持久化。分析文案采用简短的能力倾向标签。推荐与支撑成绩统一使用 `ScoreRecordCard`，无成绩时仅传入谱面信息，达成率和 Rating 显示 `-`，曲绘沿用公共成绩卡设置。弹层复用当前公共组件，谱面跳转使用 `encodeDetailTarget` 和 `detailTargetHref`。

KALEIDXSCOPE 的课题、日程和进度通过 `domain/kaleidx-scope.ts`、`state/kaleidx-scope-progress.ts` 与当前工具页面读取。进度按账号保存，独立补记关卡和课题；估计日程不能冒充已确认状态。

`runtime-diagnostics-recorder.ts` 是运行日志入口；日志数据库独立于业务事务。页面通过 `runtime-diagnostics.ts` 和日志服务读取、清理、分享，不直接拼接数据库操作。文件 pending/previous 是当前替换协议，临时分享副本可清理。

## 修改与验证

先读实际导出和调用方，再修改当前入口；不维护额外模块登记、结构基线或检查器。真实行为测试覆盖输入输出、交互、取消、缓存清理后的迟到写入、账号轮换、当前备份往返和 I/O 失败。

在 `apps/mobile` 运行 `npm run lint`、`npm run typecheck`、`npm test` 和 `npm run check:generated`。CI 脚本测试位于 `.github/scripts`。原生 APK、iOS、真实账号和云端 CI 的结果分别验证和报告。
