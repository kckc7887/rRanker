# rRanker 技术架构

## 工程与入口

移动应用位于 `apps/mobile`，使用 Expo 57、React Native 0.86、React 19.2、Expo Router 57、TypeScript 6。入口是 `expo-router/entry`，启用 New Architecture。Node 最低版本为 22.13。

`app.config.js` 从 Expo 传入的静态配置装配原生插件和构建参数。Android 最低版本为 7，compile/target SDK 为 36；iOS 最低版本为 16.4，构建要求 Xcode 26.4 或更新版本。

Android 原生库与 Hermes 字节码压缩打包，原生库在安装时解压，四 ABI 分包由 `plugins/with-android-abi-splits.js` 装配。iOS 通过 `expo.autolinking.ios.buildFromSource` 从已安装依赖源码构建 Expo 模块，React Native 与 Hermes 使用预编译产物。

| 目录 | 内容 |
|---|---|
| `apps/mobile/app` | 文件路由、根布局与标签页 |
| `apps/mobile/src/domain` | 游戏模型、计算、筛选与持久化格式 |
| `apps/mobile/src/providers` | 上游请求、认证和响应转换 |
| `apps/mobile/src/storage` | SQLite、KV 与 SecureStore 读写 |
| `apps/mobile/src/services` | 取数、资源下载、会话提交与上传 |
| `apps/mobile/src/state` | Zustand 状态、QueryClient 与生命周期 |
| `apps/mobile/src/hooks` | 查询及页面动作 |
| `apps/mobile/src/components`、`screens` | 共享组件和游戏页面 |
| `apps/mobile/src/features` | 成绩图、谱面预览、下载及工具功能 |
| `apps/mobile/scripts` | 播放器生成、素材生成与依赖功能补丁 |
| `apps/mobile/modules` | 应用专用 Expo 原生模块 |
| `.github` | CI、原生构建和手动设备诊断 |

## 启动与导航

`app/_layout.tsx` 装配生命周期、启动恢复、QueryClient、主题、通知和导航。`useAppStartup` 恢复主题、图标字体与账号；主题读取最多等待 1.5 秒，未完成的操作继续执行。可选账号来源读取失败只影响对应来源，可由现有恢复入口重试。调试偏好默认关闭，恢复完成后才允许添加示例账号。

`useAppRuntime` 处理路由记录、展示数据恢复、存储维护和前后台动作。后台取消前台工作、暂停上传等待和查询；回到前台后恢复仍活动的未完成查询、待保存偏好和凭据。短暂 `inactive` 不释放页面；内存警告才清理非活动查询与图片内存。

主标签为总览、最佳、成绩、曲库、设置。`CachedTabScreen` 保留已挂载页面及其局部状态，失焦、短暂失活和后台期间保留原生显示内容，通过活动上下文停止查询通知、图片处理和页面任务；内存警告允许卸载隐藏页。标签重获焦点时立即沿用已有画面，活动任务与启动维护使用可取消的空闲调度。账号元数据由根部 `AccountMetadataObserver` 同步。

详情路由统一为 `/songs/[songId]`。`domain/detail-target.ts` 的 `decodeDetailTarget(params)` 要求显式 `gameId`；舞萌使用 `chartType`、`levelIndex`，osu! 使用模式和 `beatmapId`，其他游戏使用自己的当前目标字段。跨游戏跳转先选择账号，再显示目标；无效参数显示空态。链接通过 `detailTargetHref` 生成。

详情的 `StackScreenActivityScope` 根据原生栈转场完成、焦点和前后台状态控制活动，首次重内容等待实际入场完成，后台恢复保留已完成的转场状态。有效详情目标在查询等待启用或首次结果期间显示加载状态，已有内容在刷新时保留。`ChartCarousel` 默认只挂载当前难度及相邻两张卡，按谱面身份保存标签输入；下载、标签弹层及保存中的卡额外保留，只有当前卡开展活动查询。普通滑动由原生吸附，显式目标变化才重置定位，宽度变化保留当前难度。历史标签在打开预设弹层时计算。

个人曲库栈页也使用 `StackScreenActivityScope`，批量明细与图片等待入场完成后工作，打开详情后暂停后续批量领取，返回时保留筛选与已加载内容。osu! 收藏明细通过四路有界查询补齐，与歌曲详情共用查询键及 60 秒新鲜缓存。

## 游戏取数

`hooks/use-game-data.ts` 通过 `services/game-data-query.ts` 与 `services/game-data-loaders.ts` 取得各游戏的实际载荷。QueryClient 保存在 `state/query-client.ts`，展示转换位于 `features/game-content/adapters`。

| 游戏 | 主要来源与数据 |
|---|---|
| 舞萌 | 水鱼或 LXNS 账号成绩、LXNS 曲库、DXRating 标签；歌曲详情的五维难点先读舞萌资源缓存，与 LXNS 普通谱面及难度逐项核对，缺失时读取发布桶 `DXTag/all.json` |
| CHUNITHM | LXNS 成绩、曲库、个人资料与合集 |
| Phigros | Kyou 认证与云存档、发布资源中的曲库和定数 |
| ADOFAI | TUF 玩家、最佳成绩和关卡 |
| Muse Dash | 玩家、相册、最佳与歌曲明细 |
| Phira | 玩家、谱面、成绩与排行榜 |
| osu! 四模式 | OAuth 玩家成绩、谱面集及回放；示例账号读取公开谱面目录 |
| Majdata Net | Cookie 账号、成绩、歌曲摘要与 Simai 文本 |
| Rizline | 设备登录、存档与发布资源曲库 |

所有游戏的示例账号沿用可开关的添加入口，与真实账号共用展示组件。示例身份和名称通过可选账号目录保存，无需玩家登录，关闭添加开关保留已添加账号；osu! 通过模式选择分别保存四个示例账号。

中二示例账号并行读取 LXNS 曲库和水鱼公开的 `/chunithmprober/latest_version` 新曲版本集合，按版本名称匹配曲库版本 ID。集合内的普通谱面参与 N20，其余普通谱面参与 B30 与备选；WORLD'S END 和禁用歌曲不参与 Rating 分组。版本集合读取使用当前加载信号，失败沿用页面加载失败入口；生成成绩不写玩家快照。

Rizline 示例按当前发布曲库生成全部谱面的 AP、120% 与最高分，SP 缺少最高分时示例取 1000000 且不计算 RKS；普通谱面沿现有规则计算 RKS，曲库更新重新生成成绩及总值。Phira 示例的 RKS、平均准确率、游玩次数分别为 19、100%、114514；冰与火之舞的 Ranked Score 为 114514、世界排名为 1；osu! 四模式 PP 均为 40000；Majdata 的 DX · Classic 为 114514.0000%。这些固定总览值不随分页成绩数量变化。

Phira、冰与火之舞、osu!、Majdata 的示例最佳与成绩页共用各自的内存分页查询，随滚动追加，详情通过相同生成函数取得满成绩，不请求示例玩家的上游成绩，也不保存生成成绩快照。Phira 沿上架曲库顺序；冰与火之舞仅取普通 PGU 难度并降序排列；osu! 仅取 Ranked、Approved，每集选择当前模式最高星数的一张并保留获取顺序，详情各难度均无模组满成绩。osu! 示例曲库保留关键词搜索。Majdata 每页读取 30 首，最多四首并行，一首共用一次谱面文本，按现有难度顺序解析物量并计算 DX、Classic 与 DX Score 满分，不为列表计算五维难点。Majdata 跳过文本中缺失、不支持语法及无可计分物量的难度，其它有效谱面继续生成，详情的空谱保留未游玩状态；网络、读取和修订失败保留已加载页并整页重试，账号切换和页面失活沿用取消入口。

Rizline 最佳页首次等待成绩与曲库共同就绪，实际有成绩时才显示 AH5、Best35 分组；已有完整数据在刷新期间保留，成绩或曲库初次失败沿用重试入口。

Majdata 详情在当前可见难度的物量计算中，复用已下载的 Simai 文本，通过 `features/simai-difficulty` 在端内计算 DXTag 五维难点，支持七个谱面槽位。解析和分析在内部循环按 4 ms 预算让出执行权并检查取消，保持遍历与浮点累计顺序。派生缓存格式 2 只保存物量、地雷数与 `difficultyScores`，按歌曲 ID、谱面 hash 和难度隔离；无法分析时难点值为 `null`。不支持的派生条目单独重建，原始文本继续复用，I/O 失败继续报错。预览通过 `simaiText` 将缓存原文交给播放器解析，详情不保留播放模型。请求共享、取消及清缓存后的写入保护沿用 Majdata 资源入口。

HTTP 请求使用 `totalAttempts` 表示总尝试次数。认证、轮询、取消和有副作用的 POST 按各自实际请求规则执行。QueryClient 默认最多重试一次，`ProviderError.retryable` 为假时直接结束。落雪 OAuth 按响应错误码区分登录失效、授权配置错误与服务故障，诊断请求场景分别记录换码和令牌刷新。上游现行 API、谱面和回放格式由对应 Provider 或引擎解析。

中二曲库、别名、收藏品及歌曲详情从 Query、loader 到 Provider 共用当前请求的取消信号。Phira 示例成绩同步筛选，真实成绩使用分片搜索。Phira、冰与火之舞示例账号的随机工具显示不支持状态，未绑定真实玩家时显示绑定提示；真实玩家仍使用原随机池。

查询通常先显示当前本地缓存，再后台刷新。失败回退保留原提供方和抓取时间，不能标成刷新成功。`cache-first.ts` 提供这条公共路径；共享请求独立取消消费者，最后一个消费者离开才取消底层工作。需要批量明细的页面使用现有有界查询，Majdata 实际歌曲请求共用四路队列。Majdata 搜索、歌曲、派生结果及排行榜查询在没有使用者后 5 分钟回收，重进已回收的搜索或排行榜重新联网。舞萌五维难点整库写入 `maimai:dxtag:all` 资源缓存，与当前 LXNS 曲库逐项核对歌曲、SD/DX 类型及难度，排除宴谱；Query 结果携带覆盖状态，同一曲库修订且覆盖完整时持续复用已验证结果。覆盖不足时读取 `DXTag/all.json`，更新失败保留缓存及原抓取时间并标记暂存结果，后续进入仍可重试。

本地曲库与成绩搜索通过 `useLocalSearch` 在空闲时分片准备和匹配，每片预算 4 ms。搜索文档按原始歌曲及别名快照弱引用复用，匹配字段保持各游戏语义；新快照自然重新准备。输入、快照或页面活动变化取消未完成工作，命中别名与筛选结果一起发布；页面恢复复用相同条件的完整结果，防抖输入与有效筛选条件决定重新匹配。成绩映射直接消费 Provider 已校验的类型，上游响应与磁盘读取仍保留边界校验。

清理缓存或解绑先使对应写入代次失效，随后取消查询并删除缓存。SQL 提交和会话提交前检查请求是否仍有效，迟到结果不能重新填回已清理的数据。

ADOFAI 个人曲库按收藏关卡 ID 加载详情，复用单关卡查询缓存与三路有界加载，单项失败保留收藏及标签。ADOFAI 随机池补页随前后台和页面焦点取消，迟到结果不提交；恢复后仅补未完成页。

舞萌、中二、Phigros、Muse Dash 随机页分别展示曲库和成绩失败并提供重试，有缓存时继续使用。无成绩缓存时仍可普通抽取，成绩显示缺失；启用成绩筛选则暂停抽取。Muse Dash 的专辑和定数缺失时等待或重试，角色与精灵资料失败不阻断随机池。

## 状态与持久化

`session-store.ts` 保存当前游戏、账号、会话映射和派生的活动视图。`session-provider-resolver.ts` 缓存实际 Provider，`session-providers.ts` 构造游戏所需依赖。绑定和轮换由 `session-credential-service.ts` 提交；共享凭据变化同步到关联账号。异步取消、重新绑定和凭据轮换均在最终提交处检查当前身份。

Phigros 账号摘要优先消费当前游戏查询和已保存存档，磁盘读取后复核查询；无完整载荷时复用账号实际 Provider 的摘要及云存档时间。头像和摘要补全从任务开始保存账号、游戏写入代次及凭据归属，状态和存储提交均检查资格；正常令牌轮换及活动账号切换不使任务失效。

| 数据 | 当前存储 |
|---|---|
| 会话 | SecureStore 凭据、KV v4 账号索引；恢复失败不冒充空账号 |
| ScoreHub | v3 账号索引、分片安全令牌 |
| 可选账号档案 | 所属账号 Store 的当前目录格式 |
| 偏好 | `createPreferencesStore` 或所属 Store，按键串行读写与失效重建 |
| 成绩、资源 | `SqliteSnapshotRepository`；成绩 schema 5，资源使用所属模块版本 |
| 个人曲库 | `SqliteUserLibraryRepository`，schema 4，条目、标签与预设 |
| 运行日志 | 独立日志数据库及当前诊断文件 |
| 图片和游戏资源 | 对应文件缓存与发布修订目录 |

所有应用数据只支持当前版本和结构。成功读取后发现不支持的内容，重建对应键或表；存储 I/O 失败继续报错，不触发清空。会话索引失效重建为空账号，单个失效凭据只移除关联账号。个人曲库只重建所属表；快照和资源缓存只删除失效条目，条件删除避免误删等待期间的新缓存。

`key-value-storage.ts` 提供按存储实例和键串行的完整操作队列，账号目录、示例账号、临时账号和偏好共用。ScoreHub 成功读取到失效令牌后仅移除对应账号索引；所有读取与索引提交完成后才清理无用引用，I/O 失败保留目录。正常安全写入采用 SDK 返回结果，提交异常保留回滚保护。

个人曲库备份格式为 `rranker-user-data`、版本 3，条目必须包含 `gameId`。导出通过仓库的 `readBackup` 在同一次队列任务读取条目和预设。导入先解析当前格式，旧备份直接拒绝；合并或替换在同一 SQLite 事务内提交条目和预设，失败回滚。备份不包含登录凭据和成绩缓存。

业务数据库的 schema 初始化、事务、写入和个人曲库外部读取共用 `runDatabaseWrite`。单项收藏、练习与标签修改在原事务中只读回所属游戏，完整备份仍读取同一快照中的全部条目和预设。日志使用独立连接与队列，业务回滚不影响日志。队列任务不能再次进入同一队列。

主题与展示偏好使用 `preferences-write-coordinator.ts` 合并当前选择和串行落盘，失败保留待写内容。上传好友码的选择通过 `UploadPrefsStore` 按好友码保存；UI 的 `selectedAccountIds` 是派生视图。

随机选曲偏好通过 `createPersistedRandomChartsFilterStore` 按字段合并恢复期间的编辑与磁盘偏好，串行写入使用合并后的当前值。读取失败保留编辑，重新恢复后继续保存。

诊断记录由 `runtime-diagnostics.ts`、`runtime-diagnostics-recorder.ts` 与日志仓库管理。记录默认关闭，开启后按容量保留。普通诊断在进程内保留一份已提交状态，文件队列以异步 pending/previous 替换写出，失败后从磁盘恢复；导出按队列顺序取得独立快照。致命日志保留独立的即时落盘路径。分享副本写入临时缓存，正文保存在文档目录。生产诊断页面使用现有的记录、读取、清理和分享入口。

## 音游地图

音游地图沿用 `/tools/arcade-finder` 路由，上方地图、下方统一搜索、默认折叠筛选与独立列表。iOS 使用 `react-native-maps@1.27.2` 的 MapKit；Android 四种 ABI 使用高德轻量地图 1.3.2、搜索 9.7.4 和定位 6.4.9 官方合包，固定 JAR 位于 `modules/arcade-map-support/android/libs`。`ArcadeMapSupport` 的原生视图通过系统 WebView、`IAMapWebView` 和 `AMapWrapper` 装配地图，转发 SDK 资源加载和 JS 桥接，按宿主生命周期暂停、恢复；卸载时先将 WebView 移出父视图并结束该视图的转场保留，再停止和销毁。地图和图钉复用 SDK 内置资源及原生绘制的蓝色、橙色图钉。模块同时提供地点搜索、Key 状态和服务同意状态，R8 保留地图、搜索及 WebView JS 桥。Android 自动链接排除 React Native Maps；Web、原生模块缺失或未配置 Key 时使用列表。

正式 Android 构建将仓库 Secret `AMAP_ANDROID_KEY` 传给 `plugins/with-arcade-map.js`，写入 Manifest 的高德元数据，并配置网络权限和 Jetifier。Key 不通过插件参数、日志或客户端 `extra` 传递。高德服务说明经用户同意后才装配地图，同意状态由原生模块持久化；确认后才初始化轻量地图与搜索服务，拒绝仍可使用列表。定位沿用系统定位入口，地图操作不依赖定位授权。拖图停止 500 毫秒后，与当前查询中心的累计距离达到查询半径的 10%（最少 300 米）才查询；没有查询中心时直接查询。轻微移动保留当前请求和选中机厅，刷新及失败期间保留新范围内已有结果，并按新中心更新距离。卡片移动地图不重新查询；页面离开与后台状态取消请求，迟到结果不提交。

筛选器提供距离与机型。距离为 0–30 公里的双头滑条，步长 1 公里，默认 0–10 公里；机型默认任意。距离上下限与机型按游戏保存，不支持的偏好结构只重建对应游戏的存储键，I/O 失败保留数据。中心通过地图、定位按钮和统一搜索确定；重置筛选保留中心。附近取数通过 Nearcade `/shops` 的地理筛选按距离分页，每页最多 100 条，端内按距离上下限筛选，默认取得最多 150 条符合条件的机厅；各页共用取消信号。列表、图钉和保留的选中机厅均受距离范围约束。

地图缩放与查询半径独立。首次定位和搜索选址使用约 2 公里的视野，再次定位和点击附近列表机厅只移动中心，保留当前缩放。公共地图提供放大、缩小与定位图标按钮，定位期间显示进度。放大和缩小按当前原生相机逐级调整，不改变中心或触发附近查询；Android 使用高德的缩放级别，iOS MapKit 使用相机高度。

Nearcade 机厅由 `services/nearcade-client.ts` 读取；GPS、内部地点、机厅和查询中心统一使用 WGS84。国内 MapKit、高德及 Nearcade 的 GCJ-02 坐标边界共用 `domain/arcade-coordinates.ts` 和 `gcoord@1.0.7`：相机与图钉传入原生地图前转换，拖图中心和原生地点搜索结果转回 WGS84。Nearcade 上游地区标识用于保留海外 WGS84 坐标。距离按查询中心计算，缺失距离显示“—”；营业时间按周一开始、关门小时可达 47 的格式解释，并包含前一日延续的营业时段。Android 生产路由设备检查在配置 Key 时验证服务同意及地图就绪，未配置时验证列表降级；ARM 真机与 iOS 原生手势、定位仍须设备验证。

输入停止 350 毫秒后，`useArcadeSearch` 独立加载 Nearcade `/shops` 的跨城机厅和原生地点候选。机厅每页 20 条，地点最多 10 条；机型过滤传入附近与跨城查询，距离仅限制附近查询。iOS 地点搜索通过 `MKLocalSearch`，Android 通过高德输入提示，缺少坐标的地点选中后调用原生地理编码。两类结果分别显示失败和重试，选择后清空输入、收起键盘并查询新中心附近机厅；选中机厅保留为图钉和卡片。取消会中止 MapKit 搜索，高德回调释放后忽略迟到结果；原生查询超时为 12 秒。系统定位授权产生的短暂失活保留 GPS 意图，退到后台或离开页面则使其失效。

## 资源、图片与成绩图

Phigros、Rizline 和 Kyou 分别读取所属资源组的 `latest.json`，校验 schemaVersion 2 指针、清单 SHA-256 和对象摘要。清单位于 `manifests/<sha256>.json`，媒体按固定分类目录和内容哈希存放。Phigros 在验证清单时建立一次逻辑 `path` 索引，由发布对象持有，曲绘、头像和资源读取共用索引，通过 `objectKey` 定位实际资源；Rizline 曲库直接保存对象路径；Kyou 清单将表名映射到对象路径、大小和摘要。发布流程由 [rRankerResourcePublisher](https://github.com/kckc7887/rRankerResourcePublisher) 管理。

Phigros 物量读取发布资源 `metadata/note_counts.tsv`，按歌曲与 EZ、HD、IN、AT 难度装配 `chart.notes`。每格为 `[Tap,Hold,Drag,Flick]`，谱面根节点 `blockAreaList` 非空时追加数组长度作为 BLOCK。详情只在 BLOCK 大于零时显示该列，总计只累加四种音符。

下载取消后不提交临时文件，缓存命中复用当前资源。预览与谱面下载调用同一资源读取入口。已落盘文件通过 `sha256FileAsync(uri)` 校验，`modules/resource-integrity` 在 Android I/O 协程与 iOS utility 队列中按 64 KiB 分块计算 SHA-256；文件内容仅在实际解码或打包时传入 JS。取消和资源代次控制校验后的结果发布。Rizline 曲库缓存格式为 2；读取到其他格式时仅重建该曲库缓存，I/O 失败保留现有数据。

`RemoteImage` 使用显式 `cacheProfile`：thumbnail、artwork、native 或 none。原生压缩图片路径中的展示与压缩共用原图文件，身份包含游戏、URL、请求头和缓存键，消费者独立取消。原图与压缩图共用格式 4 的索引、50 MiB 总容量、游戏配额和 LRU；压缩图单项上限为 10 KiB。原图按原字节落盘，正常重进复用稳定路径，最后一个使用者释放后解除占用并裁剪超额缓存；使用中的原图允许暂时超额。清理先失效代次，移除所属索引，仍在使用的文件待释放后回收。原图请求不等待页面可见，压缩仍等待原图显示成功及页面活动。压缩缓存命中时先显示缩略图，取得共享原图文件后替换；等待原图或下载失败时保留有效缩略图，解码失败只使对应文件失效。Web 使用平台支持的图片路径。

启动维护、图片索引整理与页面资源释放使用异步文件操作，目录逐项处理。图片文件发布、清理和索引持久化共用文件操作队列，下载与压缩不占用该队列。图片命中与正常释放复用已初始化的目录；原图核验与 LRU 更新在同一次操作完成，仅未命中时准备临时文件，最后释放更新使用时间，有超额待回收时才继续裁剪。预览先使会话失效并释放视图，再异步回收所属目录；启动维护保留当前进程正在使用的资源。

谱面下载在所属任务失效后异步回收临时文件与会话目录；原生下载的迟到文件同样回收，清理失败保留原请求结果。保存等待原生复制完成后才释放源目录。Phigros 预览和下载从发布对象的路径索引取得精确谱面、音乐与曲绘；默认目录中的任意资源仍决定目录归属，默认目标缺失时才枚举索引判定目录及变体歧义。

舞萌、中二和 Phigros 成绩图由 `useBestImageScreenController` 持有账号独立的文件会话。曲绘、头像、角色和模板图片保留原始字节，先复用会话内已有文件；远程图片缺失时取得所属游戏、同 URL 的公共原图缓存，未命中再下载，并在持有原图引用期间复制进会话目录，复制结束或失败均释放引用。已准备的会话副本可在原图缓存清理后继续读取。所需字体与 UI 素材按原相对路径复制一次，HTML 异步写入同一会话目录，WebView 读取范围限定该目录。改样式、分页复用已准备文件；前后台恢复保留同一素材身份的文件与 HTML，未完成准备继续恢复，真正进入后台时取消当前导出。相册导出先读取写入权限，未授权时才申请。离开或换账号先使会话失效并释放视图，等待已发出的原生截图结束，再异步清理 HTML、截图和素材；清缓存跳过仍在使用的会话目录。捕获、保存或分享失败通过公共错误文案反馈。内存警告可卸载预览，再由用户降低分辨率后重新加载。

成绩图偏好按账号复用写入协调器，慢读取期间只覆盖用户实际修改的字段；读取与写入失败保留当前选择并在前台自动恢复。素材准备与 HTML 写盘仅在实际失败后按 0.5、2、10、30 秒退避，随后每 30 秒重试，不对仍在执行的操作设置总时限；可选图片的 HTTP 404 沿用空素材回退。后台、账号切换与任务失效停止未完成尝试，已成功文件继续复用。

## 谱面与下载

四套生成播放器为 maimai、Phigros、osu!、Rizline。生成源位于各自 `webview-player`，各自维护 `player.bundle` 和 `index.html`；宿主会话将 bundle 以 `player.js` 暂存并沿用 HTML 引用。共享 UI 与手势位于 `chart-preview-shared/webview-player`。

`chart-preview-screen-shell.tsx` 管理资源准备、WebView、前后台暂停、取消、seek 和释放。`chart-preview-bridge.ts` 只解析当前事件和设置信封，宿主命令由公共 serializer 生成。控制设置、播放状态和时间回传通过同一桥接路径。

播放器设置的存储读取失败进入重新加载流程并保留原偏好，成功读到损坏内容才重建对应键。舞萌、Majdata、Phigros、Phira、osu! 谱面包通过 `saveChartPackage` 串行选择目录并保存，下载与打包仍可并行。目录选择窗口内保留各卡下载，原生选择器返回且应用恢复前台后才检查取消并写盘；排队取消不打开选择器，当前任务取消也等待原生选择结束后才放行下一项。Android 已生成文件经 `modules/resource-integrity` 的 `copyFileToContentUriAsync` 在 I/O 协程中按 64 KiB 复制至 SAF 目标，源文件保留到复制结束；取消或失败只回收本次新建目标。iOS 普通文件目标沿用文件复制。普通后台和页面卸载继续取消下载。Android 在目录选择器内再按 Home 不产生新的 MainActivity 状态变化，任务保留到选择器返回及应用恢复。

Simai 的解析、时间轴、几何与渲染位于 `simai-chart-preview/engine`，预览与统计共用。`BOUNCE` 和分类 HS/SV 控制指令不改变判定物量和时间，解析消费其拍长比、数值及复位值。Phigros/Phira 共用 PGR、RPE 配置与资源路径；osu! 使用当前谱面、皮肤和回放解析；Rizline 使用发布清单定位的谱面与音频。不可见或释放的播放器撤销帧、音源、监听器和所属临时资源。

舞萌与 Majdata 的 Simai 播放器保持保护套不额外高亮、绝赞滑轨使用绝赞配色。PGR 噪域显示默认开启，判定范围显示默认关闭，两项沿用公共桥接持久化并独立控制；青色框使用启用期间的区域变换与合成边界，不随视觉噪声或渐入渐出变化。RPE 不提供噪域选项。

普通谱面确认采用固定标题、固定播放画面和下方独立滚动区。曲名与难度数值同行显示，短曲名按内容宽度排列、标签紧随其后，长曲名在最多 12 个汉字宽度内往返滚动；难度使用游戏侧传入的 `PreviewDifficulty.value` 和配色，缺失数值显示“—”。舞萌路由传递定数，osu! 路由传递星数与难度名，其余复用准备阶段元数据。画面保留游戏比例并限制在标题下方可用高度的 55%，Buddy 保留双侧布局；舞萌实时详情固定两行，首行显示 BPM、拍位置和 FPS，次行显示 COMBO、BREAK，行内超宽横向滚动；所有谱面确认页隐藏原生及内部滚动条，保留滑动。

四套播放会话各自持有公共 `PlaybackLoop`，沿用原有时间单位和播放时钟，在自然结束前执行 AB 回跳。普通和全屏复用端点与热度区间，暂停、倍速和全屏切换保留标记，重载会话清除标记。全屏共用扁平控制卡片，方形锁定按钮与控制器右侧对齐，位于控制器上方 16px；整页非控件区域可唤出控制器，操作结束后重新计时 5 秒；锁定时只显示解锁入口。退出恢复普通模式滚动位置，Rizline 保持竖屏，其余沿用横屏。

原生下载和进度使用 `chart-download-shared`。`AppNotification` 并列显示各项下载进度和取消操作，页面仍可操作；选择通知优先阻挡页面，返回操作仅处理阻挡通知。谱面包准备由各游戏功能模块完成，公共下载层不生成游戏业务数据。

KALEIDXSCOPE 的国服日程、课题和手工进度位于 `domain/kaleidx-scope.ts`、`state/kaleidx-scope-progress.ts` 与工具页面。页面以两行阶段导航切换六色门与终章，直接展示当前难度、LIFE 和完成操作，钥匙曲、随机曲池及日程按需展开。进度按账号保存，课题跳转使用实际舞萌详情目标。

实力分析路由按当前游戏装配舞萌或 Phigros 页面，账号切换重新挂载。舞萌使用当前账号全部普通谱面成绩、当前曲库与 DXTag 特征，统一以 SSS+（100.5%）为达标条件；逐维取达标谱面最高 10 个正值求平均，并从适级曲库推荐能提升薄弱维度的谱面。计算位于 `domain/maimai-strength-analysis.ts`，分析结果不单独持久化。`useMaimaiStrength` 复用成绩和曲库查询，并通过 `useMaimaiDxTag` 与详情页共享整库查询。LXNS 曲库快照更新时重新核对缓存覆盖；五维按谱面文件 ID 和难度取值，缺失项排除计算。查询沿用前后台生命周期、取消及资源缓存写入保护。页面展示简短的能力倾向标签、可点击雷达与练习谱面；练习谱面统一使用现有成绩卡，无成绩字段显示 `-`，曲绘遵循成绩卡设置。页面仅在加载或失败时显示状态并提供重试。

## 验证与构建

以下命令在 `apps/mobile` 运行：

| 命令 | 验证内容 |
|---|---|
| `npm ci --no-audit --no-fund` | 安装锁定依赖并执行现有功能补丁 |
| `npm run lint` | 应用、测试与配置 lint |
| `npm run typecheck` | 应用及四套播放器类型检查 |
| `npm test` | 单元与 UI 行为测试 |
| `npm run check:generated` | 四套播放器生成物一致性 |
| `npm run build:chart-preview` | 生成 maimai 播放器 |
| `npm run build:phigros-chart-preview` | 生成 Phigros 播放器 |
| `npm run build:osu-chart-preview` | 生成 osu! 播放器 |
| `npm run build:rizline-chart-preview` | 生成 Rizline 播放器 |
| `npm run prebuild:android` | 重建 Android 工程配置 |

测试验证实际输入输出、交互、取消、存储往返和 I/O 失败。外部 HTTP、原生 SDK、文件系统和浏览器环境可模拟；生产代码不提供测试替换、统计或 reset 接口。

lint 保留 Hooks 的调用与依赖检查，组件编译器诊断的启用范围由 `eslint.config.js` 配置。Jest 转译 Router 所需的 `standard-navigation`，原生模块测试只替换所属业务入口，保留 Expo Core 的默认环境。

postinstall 按实际源码调用点应用 decode-uri-component 和 WebView 的运行补丁。WebView 补丁处理 Xiaomi 消息桥兼容，并在 Android 公共销毁入口先移出父视图、结束该视图的转场保留，再销毁。高德轻量地图依赖由 `arcade-map-support` 原生模块装配，地图、搜索和 JS 桥的混淆配置随模块提供。

### CI 与发布

`.github/workflows/pull-request.yml` 处理 PR 创建、更新、重开和编辑。同仓库 PR 只执行变更分类、质量检查与 `quality-gate`；外部 fork PR 通过 `fork-quality` 调用 `.github/workflows/quality.yml`。

`quality.yml` 接受所有分支 push、手动触发及 fork PR 的复用调用。两个入口共用 `.github/actions/changed-scope` 区分文档与功能变更，通过 `.github/actions/mobile-quality` 执行 lint、五组类型检查、单元/UI、生成物和 CI 脚本行为测试。`quality-gate` 汇总结果：必要作业失败、取消或意外跳过会失败，文档快速路径允许预期跳过。

正式仓库分支 push/手动触发走 Android/iOS 正式构建；向 master 提交的 fork PR 走双端测试构建。正式构建与 fork 测试构建按事件互斥，fork 作业不取得发布凭据。

Android 在同一作业内以 4 GiB Gradle 堆和两个工作线程构建四个 ABI，校验 Manifest、签名和产物，安装 x86_64 APK 走生产路由冒烟，再上传最终产物。手动原生诊断入口位于 `android-recovery.yml`。

对外 APK 名为 `rRanker-arm64.apk`、`rRanker-armeabi.apk`、`rRanker-x86.apk`、`rRanker-x86_64.apk`；构建归档名保留版本、提交与运行标识。`resource-release.yml` 仅处理正式 Release 的 published 事件，通过 `RESOURCE_PUBLISHER_TOKEN` 向发布仓库的 `apk.yml` 发送 Release ID，并查询该次运行结果。令牌仅需发布仓库 Actions 读写权限。发布仓库通过仅限运行实例读写的 `YUNXIAO_TOKEN` 启动云效 APK 流水线，传入 Release ID、发布代码提交和 GitHub 运行 ID，等待实际结果，并在取消或超时时请求停止云效运行。云效用流水线私密变量中的 S3 凭据，在全部附件完成大小、摘要、ABI、包名、版本和签名校验后，更新 rranker 桶的四个 `release/rRanker-<ABI>.apk` 固定地址。

iOS 正式构建在同一 TestFlight 队列串行分配编号、签名、校验 IPA 并上传 App Store Connect。平台最低版本、Android 优化模式和原生插件以 Expo 配置为准。

单元、UI 和浏览器证据不能替代新 APK、iOS 设备、真实账号或云端 CI 的实际验证。
