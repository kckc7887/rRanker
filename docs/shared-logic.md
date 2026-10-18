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
| 筛选与搜索 | `src/components/game-content/FilterShell.tsx`、`src/hooks/use-local-search.ts`、`src/utils/search.ts` 与所属游戏模型 |
| 难度标记 | `src/components/game-content/GameDifficultyBadge.tsx` |

展示模型使用实际 `GameId`。`DetailTarget` 描述游戏内真实目标，URL 必须携带 `gameId`；osu! 谱面使用 `beatmapId`，舞萌谱面带类型和难度索引。行、卡片、随机工具和个人曲库都通过 `detailTargetHref` 跳转。详情初始等待以有效目标的查询 `isPending` 判断，包含页面转场期间尚未启用的查询；非法目标及明确未绑定的空态继续独立处理，已有内容不被刷新状态替换。

`MuseDashQuery` 透传 `isPending`，详情等待相册首个结果后判断歌曲是否存在。`ChunithmCatalogProvider` 的曲库、别名、收藏品与单曲方法，以及对应 loader 接受可选 `AbortSignal`，沿当前 Query 传到公共 HTTP 入口。

Provider 负责上游请求与响应转换，页面不拼接认证请求。水鱼与 LXNS 成绩映射直接接收 Provider 已校验的类型；上游响应与磁盘读取保留校验。LXNS 成绩曲名按上游字符串原样保留，包括空字符串和空白字符；仅缺少 `song_name` 字段时使用缺失占位并标记不完整。HTTP 使用 `totalAttempts`，有副作用的请求按实际规则限制重试；取消在公共请求入口处理。QueryClient 默认最多重试一次，并遵守 `ProviderError.retryable`。上游当前格式中的字段和平台必需的 SDK 适配继续由所属模块处理。

`useLocalSearch` 在实际逐项准备、匹配循环中按 4 ms 预算分片，通过 `scheduleIdleTask` 继续；输入、快照与活动状态变化取消旧工作。页面恢复时复用相同条目、快照、筛选条件和选择函数的完整结果；调用方只将防抖关键词和有效筛选字段纳入条件身份。`searchDocumentFor` 按字段提取函数和原始对象弱引用复用搜索文档，`songSearchDocument` 为同一歌曲及别名快照的曲库与成绩页提供共同入口。匹配字段保持游戏原有语义，命中别名随筛选结果发布。

`cacheFirstLoad` 提供本地首屏和后台刷新，返回缓存必须保留抓取时间与来源。`refresh-result.ts` 定义当前刷新结果和快照元数据，`useGameData` 发布实际状态；调用方不再读内部字段或复制轮询器推断刷新是否成功。舞萌五维难点整库写入 `maimai:dxtag:all` 资源缓存，不设时间有效期。`loadCachedMaimaiDxTag(catalog, signal)` 对照当前 LXNS 曲库中的普通谱面及难度，返回 `coversCatalog` 供 `useMaimaiDxTag` 决定当前修订的 Query 是否持续复用。缺失则读取 `DXTag/all.json`；更新失败返回保留原来源和抓取时间的暂存结果，后续进入保留重试，取消或清理后禁止迟到写入。

`useMajdataSongs`、歌曲及个人库详情、派生结果与排行榜共用 5 分钟无使用者回收时间。搜索和排行榜被回收后重新请求，上游歌曲详情继续沿现有磁盘缓存与刷新路径读取。

示例成绩生成由各游戏的 `maxed-*-test-provider` 提供。`usePhiraDemoBests`、`useTufDemoPasses` 复用所属曲库分页 hook 的可选账号身份；`useOsuDemoScores` 使用 `OsuPublicCatalogProvider` 的搜索与详情读取，响应复用当前 osu! 谱面模型；`useMajdataDemoScores` 使用 `loadMajdataDemoScoresPage` 读取曲库及已缓存文本，再复用 Simai 解析、物量和满分计算。Majdata 通过 `getAvailableDifficulties` 跳过文本中缺失的难度；不支持的谱面语法或无可计分物量同样跳过所属难度，详情的空谱保留未游玩状态，其它读取失败继续整页重试。最佳与成绩页共享查询，生成成绩与详情复用同一入口，查询身份包含示例账号，各游戏清缓存及解绑同时取消所属查询。Rizline 的 `applyRizlineCatalog` 对示例账号按新曲库重新生成存档与 RKS。生成成绩不写玩家成绩快照，单谱 PP、连击或判定缺失沿现有空值语义显示。

中二示例加载通过 `loadChunithmNewVersionTitles(signal)` 调用 `ChunithmCatalogProvider.getNewVersionTitles`，校验水鱼 `/latest_version` 返回的非空版本名称数组。`buildMaxedChunithmSnapshot(catalog, newVersionTitles, displayName?)` 与 `buildMaxedChunithmBests` 使用曲库版本表匹配整个新曲集合，按谱面版本划分 N20 与 B30，未进入 N20 的新曲不进入 B30 或备选。

示例游戏由 `domain/example.ts` 提供固定歌曲、主题和五维数据，`providers/example-test-provider.ts` 的 `exampleTestPayload` 生成成绩与最佳分组，经 `loadGameDataBundle`、`useGameData` 和公共刷新入口装配。展示适配器为 `features/game-content/adapters/example.ts`，页面复用公共列表、成绩卡、难度标签、详情头部、两级 `TagEditor` 和图片缓存。`GameScoreCard.onPress` 允许支撑成绩先关闭弹层再导航；未传时沿用详情目标。`METRIC_GRADIENT_THEMES.rainbow` 使用既有彩虹配色与公共流动生命周期。随机页复用 `pickRandomItems`，`RandomChartsPage` 在 `filter` 为空时省略筛选区域。工具固定与缓存计量通过既有游戏注册入口接入。

`createInflightGuard.share` 共享同键工作并独立取消消费者。`useBoundedQueries` 管理实际批量明细；服务的实际网络请求使用现有队列。清缓存先失效对应资源代次，真实异步结果在最终提交处检查资格。

ADOFAI 个人曲库按收藏关卡 ID 调用 `useTufLibraryLevels`，以三路有界查询复用 `useTufLevel` 的查询定义与 `['tuf', 'level', levelId]` 缓存。单项详情失败不删除收藏或标签。`TufRandomChartsScreen` 按当前前台和页面焦点取消补页，恢复后只加载尚未完成的页；`prefetchTufPassPage` 在提交前检查取消信号与资源代次。

`useOsuBeatmapsetsByIds` 以四路 `useBoundedQueries` 加载个人曲库明细，去重后的等值 ID 序列复用查询定义，与单曲详情保持同一查询键和 60 秒新鲜期。个人曲库路由通过 `StackScreenActivityScope` 控制所有游戏的页面活动，失焦暂停后续领取并保留局部筛选与成功结果。

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

`hydratePhigrosAccount` 优先读取当前账号的游戏查询载荷，再读取 `PhigrosSaveCache` 并复核最新查询；没有载荷时复用账号的实际 `PhigrosScoreProvider` 摘要。补全结果包含 RKS、课题等级、头像、显示名与原来源，不另存已完成摘要。

头像与摘要补全在开始时通过 `captureAccountAvatarWrites` 捕获游戏、账号写入代次和凭据归属，更新状态与存储提交前复核。正常令牌轮换和活动账号切换保留资格，清理、解绑或重新绑定使旧结果失效。并发消费者通过现有共享请求独立取消。`cancelBoundAccountQueries` 位于 `services/invalidate-account-data.ts`，先失效账号写入，再取消并删除所属查询。

`SecureSessionStore.updateAccountMetadata` 接收可选的提交资格检查，在队列执行和索引读取后复核，再写入当前账号元数据。

`lxns-oauth.ts` 共用授权码兑换与令牌刷新请求。`invalid_grant` 表示登录失效；`invalid_request`、`invalid_client`、`unsupported_grant_type` 表示授权配置错误；`server_error` 表示可重试的服务故障。请求通过现有诊断入口记录 `authorization-code` 或 `token-refresh` 场景，不记录令牌和上游错误正文。

`LargeSecureValueStore` 使用当前清单与分片保存长值，遵守 SecureStore 单值字节限制。写入以 SDK 返回结果为准，不在正常路径再次读回自证。提交失败后的回滚检查用于保护当前引用，属于实际故障处理。

可选账号目录成功读到不支持的数据时重建所属键；读取失败不覆盖。`key-value-storage.ts` 的 `enqueueKeyMutation` 按存储实例和键串行执行完整的读取、失效重建、保存与删除，账号目录、示例账号、临时账号和偏好共用；队列内读取不重复入队，前一个失败不阻塞后续操作。`catalog-demo-account-store.ts` 通过现有 `createDemoAccountStore` 保存示例游戏、Rizline、Phira、冰与火之舞、Majdata 和 osu! 各模式的独立示例账号。osu! 同 Provider 的恢复来源按游戏隔离，单模式读取失败及重试保留其它模式。

`session-store` 保留完整账号集合，选择与回退仅允许当前可见账号；`useVisibleBoundAccounts` 为总览、账号管理和详情切换提供同一可见列表。`isTestProvider` 按绑定类型识别全部示例账号，只有调试偏好已恢复且开启时才可见。`restoreAppAccounts` 先读取偏好，再恢复选中账号；`useDebugStore` 保存成功后才发布开关，状态订阅同步更新活动账号。关闭示例功能不删除账号或个人数据，显式切换被拒绝时不写入活动账号偏好。示例游戏详情及游戏选择器同样遵守开关。

## 存储、偏好与个人曲库

`rranker-database.ts` 提供数据库连接和 `runDatabaseWrite`。业务 schema、事务、写入与个人曲库外部读取共用队列；日志数据库单独串行。任务内不可再次进入同一队列。

`SqliteSnapshotRepository` 提供当前成绩与资源缓存。版本不符或正文损坏仅删除受影响条目；等待写队列后的删除使用读到的值作为条件，保留后来写入的有效缓存。I/O 错误传播，不按失效内容处理。

`createPreferencesStore` 读取并校验当前格式，成功读到不支持的结构才写当前默认值。`preferences-write-coordinator.ts` 管理真实页面选择、串行保存和失败补写，恢复未完成时不把占位默认值覆盖到磁盘。

`createPersistedRandomChartsFilterStore` 按字段保留恢复期间的编辑，读取完成后合并已保存偏好，未编辑字段沿用磁盘值。串行写入读取合并后的当前偏好；读取失败保留编辑，恢复成功后继续保存。

`resolveAppearance` 根据用户偏好和系统模式生成当前主题；跟随系统时仅 `dark` 使用深色，`unspecified` 使用浅色。系统主题通过 `Appearance.setColorScheme('unspecified')` 恢复跟随。

`UserLibraryService` 是收藏、练习、标签、预设、导入导出的业务入口；`SqliteUserLibraryRepository` 在真实事务内读写。单项动作只改对应行，并在原事务中只读回所属游戏；清游戏保留其他游戏和全局预设。当前库 schema 为 4，不支持的表结构只重建个人库所属表。

备份只支持版本 3，`gameId` 必须存在。`createBackup` 通过仓库的 `readBackup` 在同一次队列任务内读取条目与标签预设。`parseUserDataBackup` 在导入前拒绝旧格式；`mergeBackup` 在同一事务内合并/替换条目与预设，条目或预设上限失败不会留下部分写入。`user-data-file-service.ts` 通过系统文件选择与分享读写当前备份，临时副本使用后删除。

存储管理通过 `features/storage-management/game-storage-adapters.ts` 统计和清理各游戏当前缓存。用户数据、凭据、日志与可重新下载的资源按实际归属处理；清理释放量以实际前后统计为准。

## 上传与生命周期

`upload-maimai-from-friend-code.ts` 执行好友码上传，`upload-task-controller.ts` 保存唯一任务。任务持有自己的取消信号、前台等待和曲库等待；关闭弹层保留任务，显式取消终止。迟到阶段、回调、刷新和通知不能进入下一任务。

`UploadPrefsStore` 按好友码保存选择，UI 的 `selectedAccountIds` 从当前好友码派生。`ScoreHubAccountStore` 保存 v3 索引与安全令牌，只有当前结构。成功读取到失效令牌时仅移除其账号索引，保留健康账号；I/O 失败不提交部分清理。删除先提交索引再清理引用；附属清理失败不能假装账号仍存在。正常凭据写入以 SDK 结果为准，提交异常时保留引用检查与回滚保护。

`AppLifecycleProvider`、`useAppRuntime` 与 `CachedTabScreen` 管理前后台和页面活动。后台取消前台工作；内存警告释放非活动查询、图片内存和必要的 WebView。前台仅恢复仍活动的未完成工作，不额外刷新已有缓存。

导航主题和焦点状态通过 `expo-router` 公共入口读取，标题高度与导航类型使用 `expo-router/react-navigation`；栈页与标签页沿用同一导航上下文。

`app/about.tsx` 由设置页进入，从 `Constants.expoConfig?.version` 读取当前版本，复用 `DetailGestureRoot`、`DetailPressable` 展示隐私政策与 GitHub 仓库入口。仓库通过 `Linking.openURL` 打开，失败沿用 `useNotification` 与 `recordRuntimeError`。隐私政策通过应用内路由打开 `app/privacy-policy.tsx`，正文页复用应用主题与原生 `ScrollView`、`Text`，保留日期、章节、段落、列表及联系方式。

`scheduleIdleTask` 提供可取消的空闲调度，账号切换与绑定弹层的延后动作共用该入口；重命名输入在 `AppModal` 的原生 `onShow` 后聚焦。`CachedTabScreen` 持续监听焦点、前后台和内存警告；普通失活仅暂停工作，已挂载内容及局部状态持续保留，重获焦点时已有画面不等待空闲任务。真正的内存警告可卸载非焦点页面。`StackScreenActivityScope` 在栈页外层监听原生转场，`useStackScreenReady` 保留首次入场完成状态，活动上下文同时受焦点、转场和前后台约束。

## 图片与共享 UI

`RemoteImage` 是远程图片入口，使用 `cacheProfile` 明确 thumbnail、artwork、native 或 none。`remote-image-cache.ts` 管理原图、压缩图、缓存身份和文件清理；`acquireRemoteImageOriginal(source, gameId, signal)` 返回原字节文件及异步 `release`、`invalidate`，展示和压缩共用下载，消费者独立取消。文件身份包含 URL、请求头、缓存键及游戏，共享请求按清理代次隔离；原生展示使用文件 URI 作为缓存键。两类文件共用格式 4 的索引、50 MiB 总容量、游戏配额和 LRU，压缩图单项上限为 10 KiB。原图发布后保留稳定路径，最后一个消费者释放时解除占用并裁剪，使用中的文件可暂时超额。`invalidate` 只使取得的文件失效，保留后来发布的替换文件；解码失败、缺失和空原图通过所属入口重建。原图不受可见性等待限制，压缩在成功显示且页面活动时开始；压缩缓存命中后持续显示缩略图，取得同一入口的原图文件后替换，原图失败时保留有效缓存。普通页面失活不释放已取得的原图；原图成功显示才通知调用方。清理先失效代次并移除所属索引，正在使用的原图待消费者释放后回收。

通用行、卡片和封面位于 `components/game-content`，游戏组件只提供实际展示差异。成绩卡曲绘、个性化卡片示例以及中二、Phigros 的成绩图歌曲背景选择器统一使用所属游戏的 thumbnail 缓存；Phigros 头像选择沿用 native 缓存。`GameDifficultyBadge` 使用普通样式覆盖，保留尺寸、渐变和文本。列表的页面活动、可见性与图片落盘通过现有共享组件传递；可见性使用列表的稳定条目键，分组列表额外按分组键隔离，同键数据更新保留当前活动状态。

`GameSongRow` 与 `GameSongCover` 将封面失败关联当前游戏和图片来源，来源变化允许新图片加载，旧来源的迟到错误不改变当前图片状态。

`ChartCarousel` 按谱面键保存标签草稿，只装配当前及相邻卡片，下载与标签操作分别保留离窗卡片；`renderItem` 传递当前卡活动状态、受控标签草稿和任务保留回调。滚动只更新活动卡，初始目标及 `resetKey` 变化重置定位，宽度变化保留当前卡，列表缩短时钳制索引；Majdata 传入实际初始难度，不将滚动索引回写初始目标。`TagEditor` 的 `historyTags` 可传入惰性读取函数，仅在预设弹层打开时计算，保存失败保留输入与弹层；输入框可收缩，窄屏保持预设与添加按钮在卡片内。

绑定弹层复用当前输入、按钮、扫码和 `useAccountBindingRequest`。公共错误文案隐藏无助于用户决策的底层异常；实际错误进入诊断记录。

## 成绩图与谱面功能

成绩图与谱面预览共用 `react-native-webview`。`scripts/patch-react-native-webview-xiaomi-bridge.cjs` 在 Android 公共 `destroy` 入口移出所属父视图并调用 `endViewTransition`，随后执行原生销毁；页面卸载和宿主销毁共用该入口。

`useBestImagePreferences` 按账号使用 `createPreferencesWriteCoordinator`，保留 `setPrefs` 更新方式，以实际变化字段合并读取中的选择与已存偏好。舞萌图标、姓名框、背景框和 Rating 样式独立合并，落盘仍使用原有选择结构。读取失败保留待保存选择，写入失败保留当前值，前台按协调器退避自动补读、补写；失败通过现有通知和诊断入口反馈。

成绩图公共入口位于 `features/best-image`：`useBestImageScreenController`、`useBestImagePreview`、`useBestImageExport` 与共享页面壳。`load-best-image-session.ts` 为舞萌、中二和 Phigros 提供账号独立的素材会话，`loadRemoteImageFile`、`loadImageFiles` 与 `copyBestImageAsset` 返回原字节文件 URL。远程素材先复用会话中的非空文件，缺失时经 `acquireRemoteImageOriginal` 取得所属游戏、同 URL 的公共原图缓存或共享下载结果，由 `copyBestImageAsset` 复制进会话目录，复制结束或失败均释放原图引用。压缩垫图及不同 URL 的曲绘版本不参与素材替换。游戏入口只提供素材地址、当前所需字体和布局；`prepareBestImageWebViewSources` 在同一会话目录异步写出 HTML，返回异步 `dispose`。改样式、分页与后台恢复沿用当前会话，已就绪素材与 HTML 保留身份，未完成工作恢复，WebView 只读取该目录。`requestBestImageExportPermission` 先读取相册权限，未授权时才申请，拒绝和读取失败沿用导出错误路径。真正进入后台取消当前导出，恢复后可重新导出。离开或换账号先失效会话，`cancelExportRequest` 等待未结束截图及临时截图清理，再回收会话文件；后台等待截图可取消。清缓存跳过活跃会话，启动维护回收上次会话目录。

`retryBestImagePreparation` 对素材准备与 HTML 写盘的实际失败依次等待 0.5、2、10、30 秒，之后保持 30 秒间隔。未结束的操作持续等待，空素材沿用各入口的可选回退；原图 HTTP 404 由下载入口映射为 `no_data`，成绩图返回空素材。取消信号、会话失效和资源代次变化结束旧尝试；后台停止未完成准备，恢复复用成功素材和 HTML。

相册权限和保存使用 `expo-media-library/legacy`。字体及舞萌 UI 素材通过 `File.moveSync` 完成文件发布，iOS 谱面包通过 `File.copySync` 完成复制后才结束保存；临时来源的清理沿用所属任务时序。

谱面公共入口位于 `features/chart-preview-shared`：

- `chart-preview-screen-shell.tsx` 管理宿主准备、WebView、取消、暂停和释放。
- `chart-preview-bridge.ts` 解析当前播放器事件、设置信封和宿主命令。
- `chart-preview-navigation.ts` 交接当前预览请求。
- `webview-player` 提供四套播放器共用的设置 UI 与手势。

播放器生成器输出 `player.bundle` 与 `index.html`，宿主准备入口将 bundle 写为会话内的 `player.js`，HTML 沿用该脚本引用。

预览准备结果的 `dispose` 返回 `Promise<void>`，宿主先失效会话和释放视图，再异步清理；迟到准备结果同样回收。`fs-storage.ts` 的目录统计、清理和版本裁剪使用异步文件入口，`runSharedCacheFileOperation` 串行提交共享素材文件发布与共享目录清理，排队后重新检查代次。启动维护保留当前会话文件及已使用的固定预览素材目录。图片索引、发布和清理在 `remote-image-cache.ts` 内串行提交；命中读取与正常释放复用已初始化目录，原图核验合并 LRU 更新，临时文件只在未命中时准备。最后释放更新使用时间，仅有超额待回收时继续裁剪，取消与代次检查仍控制结果发布。

`webview-player/controls.ts` 的 `installPreviewControls` 复用原按钮与监听，固定标题和画面，下方控制与参数独立滚动；`stageAspectRatio` 保留各游戏比例，画面高度不超过标题下方可用空间的 55%。舞萌实时信息固定两行，首行为 BPM、拍位置和 FPS，次行为 COMBO、BREAK；每行高度固定、数字等宽，超宽时横向滚动。所有谱面确认页隐藏 WebView 与页面内部滚动条，保留滑动。`setPreviewFullscreen` 保存、恢复普通模式滚动位置。

`heading.ts` 的 `renderPreviewHeading` 同行显示曲名和难度数值。曲名按内容宽度排列，标签紧随其后；曲名最大宽度为 12 个汉字，超长往返滚动；标签只渲染 `PreviewDifficulty.value`，沿用游戏侧配色。舞萌、Phigros、Rizline 使用真实定数，osu! 使用星数，Majdata、Phira 使用原生难度值；缺失显示“—”。

`playback-loop.ts` 的 `PlaybackLoop` 由四套会话分别持有，端点沿用各自时间单位、不持久化；`toggle` 记录、清除、交换端点，`target` 在两个不同端点就绪并到达 B 时返回 A。`bindPlaybackLoop` 同步普通与全屏按钮和 `HeatTimelineView.updateLoop`。各会话先检查循环再处理结束，回跳沿用原 seek/播放路径同步音频、打击音、背景与渲染。

`fullscreen-controls.ts` 的 `bindFullscreenControls` 共用整页非控件区域点击与 5 秒隐藏计时；拖动不切换显隐，操作期间暂停计时，结束后重新计时。游戏入口保留方向与锁定状态，方形锁定按钮与全屏控制器右侧对齐，位于控制器上方 16px，锁定时只唤出解锁入口。行为由 `chart-preview-loop-controls.test.ts`、各播放会话测试和浏览器交互验证，浏览器结果不替代真机验收。

设置采用当前信封格式。宿主读取设置失败时进入现有重新加载流程并保留原偏好；成功读到损坏内容时只重建对应设置键。暂停和 seek 使用当前命令；释放只清理所属会话的帧、音源、监听器和临时资源。共享播放器源变更后重建四套生成物并运行 `check:generated`。

Simai 统计和预览共用 `simai-chart-preview/engine`。Phigros/Phira 共用 PGR/RPE 配置与资源路径。osu! 四模式共用宿主与当前谱面、皮肤、回放入口。Rizline 使用实际音频和发布资源依赖。

Simai 解析支持 `BOUNCE` 的拍长比和 `NULL` 复位指令，以及分类 HS/SV 的数值和 `NULL` 参数，按原谱面时间消费，不改变判定物量；无效拍长、未知类别、非法数值及未知指令继续拒绝。

舞萌与 Majdata 共用 Simai 播放器，保护套不额外高亮，绝赞滑轨使用绝赞配色。PGR 的 `pgr-preview-config.ts` 提供 `showBlockArea`（默认开）和 `showBlockAreaBounds`（默认关），通过现有设置桥接保存。`pgr-blocks.ts` 共用区域变换，判定范围仅按 enable/disable 取样；`pgr-block-renderer.ts` 用未扭曲区域合成后的边界绘制青色框，两个显示开关独立。RPE 不显示这两个选项。

`loadMajdataParsedChart(song, level, signal)` 只返回物量、地雷数与 `difficultyScores`，派生缓存格式为 2。`parseSimaiChartAsync(text, difficulty, signal)` 与播放器同步入口共用解析核心；`simaiDifficultyScores(text, slot, signal)` 在解析及分析内部循环按 4 ms 预算让出并检查取消，保持计算顺序，不构造不参与结果的诊断明细。难点值按键盘、星星、技巧、体力、爆发排列，范围 0–10，保留一位小数，七个槽位均可分析；分析失败或滑轨不完整返回 `null`。结果按歌曲修订与难度隔离，不支持的派生缓存只重建对应条目，I/O 失败不清缓存。详情仅为当前可见难度启用查询；预览调用 `loadMajdataChart` 取得缓存原文，通过已有 `simaiText` 入口交给播放器解析。

`components/game-content/SimaiDifficultyRadar` 为舞萌详情、舞萌实力分析、Majdata 详情和示例实力分析共用雷达，使用相同轴序、刻度与一位小数展示，颜色由调用方传入；可选 `axisNames` 指定五维名称，默认使用舞萌轴名。

Phigros/Rizline 预览和下载共用 `phigrosResources`、`rizlineResources`、`VerifiedReleaseSession` 与 `verifyResourceBytes`；调用方提供实际进度或落盘回调。`utils/resource-integrity.ts` 的 `sha256FileAsync(uri): Promise<string>` 经 `modules/resource-integrity` 在原生后台分块读取已落盘文件；字节形式的响应继续使用 `sha256`。字体、素材包和谱面资源共用该文件校验入口，取消与代次检查仍在结果发布前执行。`resourceObjectPathSchema` 限定资源组、分类与哈希文件名。Phigros 在验证发布清单时建立 `assetsByPath`，曲绘、头像、成绩图和预览共用该索引，索引随发布对象释放；实际 URL 来自 `objectKey`。默认谱、里谱和共用音乐选择仍由 `phigros-chart-preview.ts` 处理。哈希 URL 不附加全局发布版本，未变化资源可以继续命中缓存。

`domain/phigros.ts` 的 `loadNoteCountsTable` 解析每难度四项或五项非负整数数组，第五项为谱面 `blockAreaList` 数量，正值写入 `PhigrosChartNotes.block`，零值省略。`PhigrosCatalogProvider` 按难度装配物量；详情复用 `GameNoteTable`，有正 BLOCK 时放在 FLICK 与总计之间，缺失或零值不显示整列。`total` 只包含 Tap、Hold、Drag、Flick。解析、已验证资源刷新及详情交互由现有 Phigros 测试覆盖。

`PhigrosKyouProvider` 在一次调用中固定已验证的清单，再按表名读取并校验字节；别名、标签、引用关系和完整性检查共用现有 Provider 入口。Rizline 曲库缓存使用格式 2，并沿用 `SqliteSnapshotRepository` 对结构失效与 I/O 失败的区分。

Phigros 存档展示缓存和账号头像缓存使用格式 2。账号缩略图读取时校验 Phigros 头像属于当前哈希地址结构，失效缓存通过所属仓库入口重建；头像同步会重新解析结构失效的地址，其他游戏头像缓存格式保持各自合同。

`features/chart-download-shared` 提供原生下载、进度和取消；各游戏负责组装谱面包。下载进度通过 `ActionNotificationInput.blocking: false` 显示，多个任务各自保留取消操作；其他操作通知默认阻挡，选择通知优先显示。`AppNotification` 的根返回监听与 `useNotificationModalRequestClose` 仅处理阻挡通知，普通提示仍按队列依次显示。`saveChartPackage(fileName, output, signal?)` 串行保存，轮到任务时等待前台并检查取消；`isChartPackageDirectoryPickerActive()` 标记原生目录选择至前台恢复的窗口，下载 hook 在该窗口保留并行任务。选择器实际结束前不放行下一项，即使当前任务已取消；恢复后再次检查取消再写盘。Android 文件输出通过 `utils/resource-integrity.ts` 的 `copyFileToContentUriAsync(fromUri, toUri)` 调用原生 64 KiB 后台复制，避免整份读入 JS；复制结束前源目录保持有效，返回后检查取消。失败或取消只删除本次新建目标，清理错误记录后保留原异常；iOS 普通文件复制不删除已存在目标。取消目录选择返回 `false`，请求取消保持 `ChartPackageDownloadCancelledError`，失败不阻塞后续保存。普通后台与页面卸载继续取消下载。Android 在目录选择器内再按 Home 时任务保留至选择器返回及应用恢复。舞萌、Majdata、Phigros、Phira、osu! 将下载任务的信号传到保存入口。

`cleanupChartDownloadSessionDirectory(directory): Promise<void>` 异步删除所属下载目录，Simai、Phigros、Phira 与 osu! 下载在保存结束后等待回收；取消及原生迟到文件使用异步删除，失败记录诊断但不覆盖原请求结果。Phigros 的 `resolvePhigrosChartPreviewAssetBundle` 直接消费发布对象的 `assetsByPath` 定位精确资源，默认目标缺失时保留目录归属和变体歧义判定；变体枚举消费该索引的路径，不重复构造清单数组。

## 工具与诊断

`components/ArcadeMap` 是音游地图的公共 UI 入口，接收 WGS84 相机目标、恢复中心、机厅与选中 ID；平台视图通过 `NativeArcadeMap` 装配 MapKit 或高德。`ArcadeMapCamera.radiusKm` 仅用于设置视野，省略时保留当前缩放并移动中心；首次定位和搜索选址使用 2 公里，再次定位和点击附近列表机厅省略视野。公共层提供放大、缩小和定位图标控件，通过 `zoomRequest` 将逐级缩放交给原生相机；Android 通过 `ArcadeMapSupport` 原生视图的 `zoomBy` 和 `setCamera` 操作轻量 SDK，省略缩放时仅移动中心；iOS 分别更新相机高度、中心。公共层管理高德首次说明、加载失败重试和手势来源，程序移动与缩放不发出用户选址事件。`services/arcade-map-platform.ts` 共用 Android 地图与地点搜索的原生模块、Key 配置和同意状态，四种 ABI 使用同一轻量实现；读取失败转为地图重试状态。`ArcadeFilterBar`、`ArcadeBusinessStatusLabel`、`arcadeFinderPreferencesStore` 与外部导航入口继续共用。筛选器只提供距离与机型，距离复用 `RangeSelector`，范围 0–30 公里、步长 1 公里；`minDistanceKm`、`radiusKm` 与机型按游戏保存，默认 0–10 公里、任意机型并收起筛选。重置保留地图中心；存储只接受当前范围结构，结构失效重建所属游戏键，I/O 失败不重建。

`fetchNearcadeDiscover` 接受 WGS84 中心、`minDistanceKm` 下限、`radiusKm` 上限、机型与取消信号，通过 `/shops` 的 `f.geo` 和距离排序分页读取，每页最多 100 条，按实际距离筛选后默认收集最多 150 条；跨页共用取消信号。零上限按上游要求查询正半径，再在端内保留零距离结果。`domain/arcade-coordinates.ts` 提供坐标边界转换与球面距离；MapKit 和高德的初始相机、移动中心与机厅图钉共用 `toGcj02`，拖图回传及原生地点搜索结果共用 `fromGcj02`，页面和距离计算只消费 WGS84。`arcade-shops.ts` 共用筛选、展示和营业时间判断；缺失距离为 `null`。拖图停下 500 毫秒后，页面用 `arcadeDistanceKm` 比较当前查询中心；累计移动达到查询半径的 10%（最少 300 米）才更换查询中心，没有中心时直接查询。轻微移动不取消已有请求，刷新及失败时保留新范围内的旧结果并更新距离。跨夜营业以次日小时表达，周表从周一开始，凌晨同时检查前一日。页面按焦点和前台生命周期取消取数，GPS 意图与地图中心分别防止旧定位、旧查询覆盖；图钉和列表共用选中 ID，并对旧结果及选中机厅应用完整距离区间。行为测试覆盖双端滑条、任意机型、筛选重置保留中心、分页筛选与取消，以及坐标转换、地图选址、刷新失败、定位和跨夜营业。

`searchNearcadeShops` 接受关键词、页码、机型和取消信号，返回 20 条分页机厅及总数、当前页和下一页状态，不接收距离。`searchArcadePlaces` 返回至多 10 条 WGS84 地点候选；`resolveArcadePlace` 为无坐标候选调用原生地理编码。两者通过 `ArcadeMapSupport` 调用原生模块，Android 使用轻量合包的输入提示与地理编码，iOS 使用 MapKit；复用地图服务同意状态并处理取消、超时，SDK 异常使用通用错误文案；服务不可用不阻断机厅查询。`useArcadeSearch` 管理 350 毫秒防抖、独立请求及分页，`ArcadeSearchResults` 展示两类候选与各自重试。页面选择候选后恢复附近列表，选中机厅在附近响应中缺席时仍按当前距离与机型保留。交互测试验证跨城选择、筛选分页、部分失败、迟到地理编码和定位授权期间的短暂失活。

实力分析共用 `app/tools/strength-analysis.tsx` 路由，分别装配 `MaimaiStrengthAnalysisScreen`、`PhigrosStrengthAnalysisScreen` 与 `ExampleStrengthAnalysisScreen`。舞萌的 DXTag 维度、类型、文件 ID 与难度匹配函数由 `domain/maimai-dxtag.ts` 提供，详情与分析复用 `useMaimaiDxTag`，查询键为 `['maimai-dxtag', 'all', catalog.source.updatedAt]`；曲库快照更新后重新核对覆盖，多个谱面共用整库请求。持久化数据与账号无关，由舞萌资源缓存统一计量和清理；缺少歌曲或难度时不追加单曲请求，也不填零。`SimaiDifficultyRadar` 接受空维度并支持维度点击；空维度显示暂无数据，不绘制完整多边形。

`buildMaimaiStrengthPool` 使用 `buildBestRecordMap`、`chartVersionKey` 去重，排除宴谱与不完整成绩；达标成绩中定数最高 10 张的均值确定推荐范围 −0.5 至 +0.3。`analyzeMaimaiStrength` 接收曲库、成绩、按谱面身份索引的 DXTag 五维，统一按 100.5% 筛选达标成绩，输出逐维 Top 10 正值均值、支撑成绩、强弱结论及最多三张推荐。每维至少三张才判断强弱，极差不超过 0.3 视为均衡；推荐模拟达到目标后的维度均值增益，最低两维的边界并列项全部纳入，均衡时考虑全部维度。缺失特征不当作零值，分析结果不持久化。分析文案采用简短的能力倾向标签。推荐与支撑成绩统一使用 `ScoreRecordCard`，无成绩时仅传入谱面信息，达成率和 Rating 显示 `-`，曲绘沿用公共成绩卡设置。弹层复用当前公共组件，谱面跳转使用 `encodeDetailTarget` 和 `detailTargetHref`。

KALEIDXSCOPE 的课题、国服日程和进度通过 `domain/kaleidx-scope.ts`、`state/kaleidx-scope-progress.ts` 与当前工具页面读取。`resolveKaleidxSchedulePhase` 按各日程的北京时间边界返回当前难度、LIFE 与可用的 DX LIFE；希望之门从 10 月 2 日起计时，最终挑战从 10 月 16 日起进入 EXPERT。进度按账号保存，支持记录课题、钥匙与关卡完成状态；曲目通过 `SongCover` 展示，详情跳转校验当前曲库与谱面类型。

`runtime-diagnostics-recorder.ts` 是运行日志入口；日志数据库独立于业务事务。页面通过 `runtime-diagnostics.ts` 和日志服务读取、清理、分享，不直接拼接数据库操作。普通诊断保留已提交的内存状态，按文件队列异步执行 pending/previous 替换；写入失败丢弃内存副本并重新读取磁盘。快照等待先前记录完成，返回独立数据；致命日志仍即时落盘，临时分享副本可清理。

## 修改与验证

先读实际导出和调用方，再修改当前入口；不维护额外模块登记、结构基线或检查器。真实行为测试覆盖输入输出、交互、取消、缓存清理后的迟到写入、账号轮换、当前备份往返和 I/O 失败。

`.github/actions/mobile-quality` 为 push 和同仓库 PR 共用依赖安装、lint、类型检查、单元/UI、生成物与 CI 脚本测试。调用方先检出目标提交；PR 入口位于 `.github/workflows/pull-request.yml`，外部 fork PR 复用 `.github/workflows/quality.yml` 的完整验证路径。

在 `apps/mobile` 运行 `npm run lint`、`npm run typecheck`、`npm test` 和 `npm run check:generated`。CI 脚本测试位于 `.github/scripts`。原生 APK、iOS、真实账号和云端 CI 的结果分别验证和报告。
