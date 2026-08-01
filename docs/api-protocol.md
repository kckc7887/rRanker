# API 协议

> 状态说明：本文件由 2026-07-10 的本地 PoC 持续更新。每个实际使用端点仍须记录验证日期、认证方式、请求 schema、成功响应、4xx/5xx、限流与超时行为；不得把未验证端点当作生产契约。当前已实现水鱼与落雪成绩读写，华立抓取仍不在 App 内实现。
> 水鱼只读端点 last_verified: 2026-07-12（/music_data、/chart_stats、/player/records、/login、/player/profile 均已复验）。/query/player 不复验，B50 用本地 buildBest50 + /player/records 合并计算。

## 水鱼 (DivingFish)

基础: `https://www.diving-fish.com/api/maimaidxprober/`

| 端点 | 方法 | Auth | 说明 |
|------|------|------|------|
| `/music_data` | GET | 无 | 曲库 |
| `/login` | POST | 无 | 登录, 返回 cookie jwt_token |
| `/player/records` | GET | `Import-Token` header 或 cookie `jwt_token` | 查分 |
| `/player/update_records` | POST | `import-token` header | 上传成绩 |
| `/query/player` | POST | 无 | B50 (body: `{username, qqid, b50:true}`) |
| `/player/profile` | GET/POST | cookie 或 Bearer | 获取/设置资料 |
| `/player/import_token` | PUT | cookie 或 Bearer | 刷新导入 token |
| `/chart_stats` | GET | 无 | 谱面统计 |

> last_verified: 2026-07-12 — /music_data、/chart_stats、/player/records（含 403 匿名 / 401 伪凭据）、/login、/player/profile 均已在 M0 阶段复验。/query/player 不复验，B50 用本地 buildBest50 + /player/records 合并计算。

### 开发前验证门禁

- 不在客户端收集或保存水鱼账号密码；优先使用公开查询参数或用户主动提供的 provider token。
- `/music_data`、`/chart_stats`、`/query/player`、`/player/records` 分别验证，不能假定它们使用相同权限或错误格式。
- 为每个启用端点保存脱敏成功样例和至少一个失败样例，并用 Zod schema 固化。
- 上游失败、字段缺失或结构变化时，不覆盖本地最近有效快照。
- 封面、曲库、别名和统计数据的来源、许可、缓存周期与署名要求在发布前单独确认。

## LXNS 公共曲库

基础：`https://maimai.lxns.net/api/v0/`

| 端点 | 方法 | Auth | 说明 |
|------|------|------|------|
| `/maimai/song/list` | GET | 无 | 曲目、谱面、版本与定数元数据 |
| `/maimai/song/list?notes=true` | GET | 无 | 详细曲库、谱师、U·TA·GE 元数据与 TAP/HOLD/SLIDE/TOUCH/BREAK 物量；`協`谱面物量位于 `notes.left/right` |
| `/maimai/alias/list` | GET | 无 | 歌曲别名 |
| `/maimai/plate/list?required=true` | GET | 无 | 带歌曲、难度、rate、FC、FS 条件的姓名框要求 |
| `/maimai/{trophy\|icon\|plate\|frame}/list?required=true` | GET | 无 | 收藏品列表；响应键分别为 `trophies` / `icons` / `plates` / `frames`，项内可选 `required[].songs` |

> last_verified: 2026-07-13 — 本次 M2 验证时详细曲库返回 1305 首歌曲、别名库 1014 项、带要求姓名框 397 项；最大有效版本为 `25500 / 舞萌DX 2026`。以 `Fraq` 交叉验证：水鱼 `11806 / DX / PRiSM PLUS` 对应 LXNS `1806 / dx / version 25500`。M4 再次按官方文档及公共响应确认 `Song.map` 为可空的开放字符串，用于曲目所属区域；歌曲 `#363 / Oshama Scramble!` 的细分版本号为 `15007`，应按 LXNS 官方前端规则向下匹配主版本 `15000 / ORANGE PLUS`。
> collections last_verified: 2026-07-19 — 四类 `required=true` 原始响应已保存并全量解析：`trophy` 2990（1557 项带 `required`）/ `icon` 1041（18）/ `plate` 397（105）/ `frame` 343（50）。共 4771 项、1730 项带结构化条件。每个条件对象都有非空 `songs` 与 `difficulties` 数组，并至多附带 `rate` / `fc` / `fs` 中一种门槛；但 83 条同步条件把同步枚举放在 `fc` 字段，消费端需归一化。曲目专属判定：`required` 所涉曲目 ID 并集恰好等于当前曲；资源图为 `https://assets2.lxns.net/maimai/{icon\|plate\|frame}/{id}.png`（称号无图）。完整统计见 `docs/lxns-collection-condition-analysis.md`。

当前职责边界：

- 玩家资料和成绩可来自水鱼、LXNS OAuth 或本地 SQLite；LXNS 公共 API继续提供共享曲库元数据。
- 当前版本取 `versions[].version` 中最大有效值，并要求至少存在一张同版本、未禁用谱面；否则拒绝生成 B50，不猜版本。
- `Song.version` 与谱面 `version` 可能是 `15007` 这类细分版本号；显示、筛选和版本统计均按 `versions[]` 降序取“不大于原值的最大主版本”，不能用精确 Map 查找或简单千位取整。
- B35/B15 按 LXNS 的谱面级 `version` 分类，不再使用水鱼歌曲级 `basic_info.from` 字符串分类。
- `difficulties.utage` 映射为独立 `UTAGE` 类型和 `utage` 难度；固定 `level_index=0` 只作为接口索引，领域键为 `UTAGE:0`，不得映射为 BASIC 或 DX。
- U·TA·GE 保留 `kanji`、`description`、`is_buddy`；`is_buddy=true` 时分别解析 `notes.left/right`，单侧缺失或结构不合法时不猜测物量。
- U·TA·GE 曲目标题移除开头的方括号属性，封面使用 `song_id - 100000` 对应的原曲资源；曲师、BPM、分类、地区、版权、版本与别名沿用原曲，收藏和个人曲库仍使用 U·TA·GE 自身歌曲 ID。
- U·TA·GE 成绩可进入全成绩展示，但不使用 `level_value` 定数、不计算或显示 Rating，并排除 B35/B15、总 Rating、未匹配数量、最佳图片和随机谱面。
- 普通水鱼 DX 曲目 ID 大于 10000 时对 10000 取模后与 LXNS ID 对齐；宴会场 ID 大于 100000 时保留。
- 匹配键为规范化歌曲 ID、谱面类型与难度序号；无法匹配的成绩不进入 B35/B15，并在界面显示数量。
- LXNS 请求失败时使用最近有效曲库缓存；无曲库缓存时只允许回退到最近完整成绩快照。
- 详细曲库、别名和姓名框使用不同资源键缓存；单项损坏只淘汰对应资源，不清除成绩快照或 SecureStore 凭据。
- 姓名框实测字段为 `plates[].required[]`，歌曲为 `{ id, title, type }`；本地进度必须同时匹配歌曲 ID、SD/DX、难度以及 rate/FC/FS，不能按旧的 `requirements + number[]` 猜测。
- 国服/日服名称对照由 LXNS `versions` 与水鱼 `basic_info.from` 的发布曲目交叉核验；当前 `25500 / 舞萌DX 2026` 对应 `maimai でらっくす PRiSM PLUS`。
- 歌曲区域读取 LXNS `Song.map`；该字段可能完全缺失，且官方未定义枚举。本地按可选开放字符串接收，缺失、`null` 或空白时不显示，不硬编码区域列表。
- 曲绘地址为 `https://assets2.lxns.net/maimai/jacket/{song_id}.png`，只对可见列表项加载并使用磁盘缓存；不批量预取，正式发布前需完成素材许可审查。
- 姓名框预览地址为 `https://assets2.lxns.net/maimai/plate/{plate_id}.png`（公共资源，与查分器账号无关；`plate_id` 来自 LXNS `/plate/list`）。水鱼无对应图床。
- 舞萌玩家成绩也可经由下方「LXNS OAuth 个人 API」绑定；公共曲库职责不变。好友码成绩可经 `write_player` 上传到已授权的落雪账号。

## DXRating 谱面标签

基础：`https://miruku.dxrating.net/api/v1/`

| 端点 | 方法 | Auth | 说明 |
|------|------|------|------|
| `/tags` | GET | 无 | 标签、标签分组及谱面关联关系 |

> last_verified: 2026-08-01 — 实时响应包含 `tags`、`tagGroups`、`tagSongs`；当前有“配置 / Patterns”“难度 / Difficulty”“评价 / Evaluation”三个分组，共 21 个标签和 6756 条谱面关系，单谱面最多关联 21 个标签。谱面关系使用曲名、`std/dx/utage/utage2p` 类型、难度字符串和标签 ID，不提供 LXNS 数字歌曲 ID。旧资料中的 `https://dxrating.net/api/songs` 当前只接受 HTML 请求，不作为生产契约。

当前职责边界：

- 读取端点返回的全部有效标签分组；每个标签使用所属分组的颜色，当前分别为配置蓝色、难度紫色和评价粉色。
- SD/DX 使用曲名、谱面类型和难度精确匹配；不使用别名或模糊搜索，避免同名曲串标签。
- U·TA·GE 优先使用属性前缀及 `utage/utage2p` 匹配；仅当去前缀后的同类型候选唯一时回退，歧义候选不展示。
- DXRating 使用独立 Provider DTO、Zod Schema、资源键 `dxrating-chart-tags` 和 SQLite 快照，不修改 LXNS 曲库、成绩、个人曲库或备份 Schema。
- 查询结果一小时内复用；在线请求失败时读取最近有效快照，无缓存时不阻塞歌曲详情。
- 难度卡片不显示额外区域标题，直接内联展示前 4 个彩色标签；更多标签通过“+N”页式弹层完整展示名称与说明。

## LXNS 中二节奏公共曲库

基础：`https://maimai.lxns.net/api/v0/chunithm`

| 端点 | 方法 | Auth | 说明 |
|------|------|------|------|
| `/song/list` | GET | 无 | 曲目、分类、版本与平铺谱面难度 |
| `/song/list?notes=true` | GET | 无 | 额外包含 TAP/HOLD/SLIDE/AIR/FLICK 物量；首版暂不请求 |
| `/alias/list` | GET | 无 | 歌曲别名；首版暂不请求 |

> last_verified: 2026-07-28 — 官方文档和实时公共响应已复核。默认曲库返回 1464 首歌曲、7 个分类、19 个版本，最大主版本为 `23000 / CHUNITHM VERSE`。`Song.difficulties` 是数组，而非舞萌的 `standard/dx` 分组；上游难度序号 `0-5` 分别为 BASIC、ADVANCED、EXPERT、MASTER、ULTIMA、WORLD'S END，应用完整映射 `0-5`。

当前职责边界：

- 中二曲库使用独立 schema、provider 和缓存键 `chunithm-catalog`，不把谱面伪装成舞萌 SD/DX。
- `Song.version` 与谱面 `version` 按 `versions[].version` 向下匹配最近主版本；没有可匹配项时保留原始数字。
- 搜索使用歌曲 ID、曲名、艺术家和谱师，不拉取别名；曲库和成绩按谱面难度、谱面版本、定数本地筛选，成绩另支持评价标签上下限。
- 曲绘地址为 `https://assets2.lxns.net/chunithm/jacket/{song_id}.png`。列表只加载可见项并使用磁盘缓存，避免触发素材访问频率限制。
- WORLD'S END 保留 `origin_id / kanji / star` 专属字段；曲绘优先使用 `origin_id`，难度以 `{kanji}☆{star}` 展示，`level_value` 仅为协议保真字段，不作为普通定数展示或推算 Rating。
- 中二已复用 LXNS PKCE + OOB OAuth，个人玩家和成绩使用独立模型；旧临时账号只作历史兼容，正式绑定后自动移除。

## LXNS OAuth / 个人 API（读写绑定）

基础：`https://maimai.lxns.net`

公开配置（可进仓库）：`client_id`、`redirect_uri=urn:ietf:wg:oauth:2.0:oob`、scope=`read_user_profile read_player write_player`。
**禁止**把 `client_secret` 写入 App 或仓库；移动端使用 PKCE。

| 端点 | 方法 | Auth | 说明 |
|------|------|------|------|
| `/oauth/authorize` | GET | 无 | 用户授权；附 `code_challenge` / `S256`；OOB 展示授权码 |
| `/api/v0/oauth/token` | POST | 无 | `authorization_code`（需 `code_verifier`）或 `refresh_token`；顶层返回 token |
| `/api/v0/user/maimai/player` | GET | `Authorization: Bearer` | 当前用户玩家信息 |
| `/api/v0/user/maimai/player/scores` | GET | `Authorization: Bearer` | 当前用户全部成绩 `Score[]` |
| `/api/v0/user/maimai/player/scores` | POST | `Authorization: Bearer` | 上传 `{ scores: Score[] }`（scope `write_player`） |
| `/api/v0/user/chunithm/player` | GET | `Authorization: Bearer` | 当前用户中二玩家信息；未同步时允许为空 |
| `/api/v0/user/chunithm/player/scores` | GET | `Authorization: Bearer` | 当前用户中二全部最佳成绩 |
| `/api/v0/user/chunithm/player/bests` | GET | `Authorization: Bearer` | 当前用户中二 Rating 构成：`bests / selections / new_bests` |
| `/api/v0/chunithm/wechat/auth` | GET | 微信内打开 | 中二离线同步授权入口；应用仅复制链接，不在应用内直接打开 |

> player last_verified: 2026-07-15 — 官方 `Player` 契约包含 `name`、`rating`、`friend_code`，以及可空的 `icon.id`、`name_plate.id`、`trophy.{id,name,color}`；头像与姓名框分别使用公共资源 `/icon/{id}.png`、`/plate/{id}.png`。水鱼玩家契约没有头像/姓名框资源 ID，预览不得伪造。

OAuth 约束（官方文档）：

- Access Token 有效期 15 分钟；Refresh Token 30 天；刷新会轮换新 refresh，旧 refresh 失效。
- Token 成功响应字段在**顶层**；旧 `data.*` 包装已废弃，解析时顶层优先。
- Token 错误响应为 `{ error, error_description }`，无 `success/code/data`。
- 用户 API 成功信封：`{ success, code, message, data }`。
- `read_player` 同时覆盖舞萌和中二个人读取；同一 OAuth 凭据可建立两个独立游戏账号，无需重复授权。
- SecureStore v3 将游戏账号元数据与远程凭据分离；账号通过 `credentialId` 引用唯一 token。刷新时按凭据原子轮换，解绑单个游戏不会使另一个游戏掉线。

成绩映射：

- `type`：`standard`→`SD`，`dx`→`DX`，`utage`→`UTAGE`。
- 普通谱面将 `dx_rating` 向下取整为单曲 Rating，定数由 LXNS 公共曲库 enrich；U·TA·GE 的 Rating 不参与计算且界面不显示 Rating 区域。
- `fc` / `fs` / `rate` / `level_index` 与文档枚举一致。
- 上传前用详细曲库确认曲目和谱面；普通 SD/DX 曲目 ID 去除 `+10000` 偏移，U·TA·GE 大于 `100000` 的 ID 保留且 `level_index` 固定为 `0`。
- score-hub 的 `fdx` / `fdxp` 分别映射为 LXNS `fsd` / `fsdp`；`fc` 只接受 `fc/fcp/ap/app`；无法确认的曲目、谱面、达成率或枚举计数后跳过。
- 上传体只包含官方 `Score` 写入字段，按 `{ scores: [...] }` 发送；当前实现保留参考实现兼容字段 `dx_star: 0`，DXScore 缺失时为 `null`。
- Access Token 到期前自动刷新；刷新返回的新 access/refresh token 必须一起更新内存会话与 SecureStore。401/403 不重试，429/5xx/网络超时沿用可重试错误语义，取消信号立即中止当前或后续目标。
- 中二 Player/Score 不映射成舞萌 `Player/ScoreRecord`；个人成绩校验与领域映射均保留 `level_index=0-5`，WORLD'S END 正常进入全成绩与 B50。
- 中二个人快照 v2 使用分账号资源键 `chunithm-score:{accountId}`，并保存玩家、全部成绩和 B50 三部分；网络失败优先回退 v2，只有旧缓存时兼容读取 v1 并将 B50 置空，鉴权失败不得使用缓存掩盖。
- 中二 B50 页面只消费 `bests`（Best 30）与 `new_bests`（New 20），不展示娱乐/候补性质的 `selections`。两个分区独立按单曲 Rating、score 降序。
- 中二成绩评价由整数 score 在本地按 SSS+ 至 D 的边界计算，不依赖上游 `rank`；S 至 SSS 使用静态蓝白粉金渐变，只有 SSS+ 使用流动版本。
- 中二成绩页以曲目 ID 和 `level_index` 关联公共曲库，补齐曲名、艺术家、谱师和定数；普通谱面显示完整难度名与定数，WORLD'S END 使用属性汉字与星级，关联失败时回退 Score 的 `level`，不得回退到 `level_value`。
- 落雪离线同步统一使用 HTTP 代理 `proxy.maimai.lxns.net:8080`；舞萌与中二固定微信链接分别为 `/api/v0/maimai/wechat/auth`、`/api/v0/chunithm/wechat/auth`。离线同步不能首次绑定查分器账号，也不能查询处理状态；同步按钮仅在对应落雪账号中复用个人数据刷新流程，缓存回退不视为完成。

> last_verified: 2026-07-17 — 按官方舞萌 API 文档复核个人上传端点为 `POST /api/v0/user/maimai/player/scores`，Bearer OAuth，请求体 `{ scores: Score[] }`；官方枚举确认 FDX=`fsd`、FDX+=`fsdp`。自动测试覆盖请求体、ID/谱面/宴会场/FDX 映射、token 轮换、权限错误、重试、取消与多目标部分成功。真实外部账号写入仅人工验证。
>
> offline sync last_verified: 2026-07-28 — 按落雪官方《同步游戏数据》文档复核代理地址、舞萌/中二固定微信 OAuth 链接、长期有效、不可查询离线同步结果及不能首次绑定账号等边界。

## 华立公众号爬虫

| 步骤 | 端点 | 说明 |
|------|------|------|
| OAuth 授权 | `GET tgk-wcaime.wahlap.com/wc_auth/oauth/authorize/maimai-dx` | 微信 UA |
| OAuth 回调 | `GET tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx?r=&t=&code=&state=` | 提取四参数 |
| 成绩爬取 | `GET maimai.wahlap.com/maimai-mobile/record/musicGenre/search/?genre=99&diff={0-4}` | 5 难度并行 |
| 玩家信息 | `GET maimai.wahlap.com/maimai-mobile/friend/userFriendCode/` | cookies |

## 数据格式差异

| 字段 | 水鱼 | NET原始 |
|------|------|---------|
| 歌曲 ID | 直接用 NET musicId (DX>10000) | musicId |
| achievement | 浮点百分比 | 整数×10000 |
| fc | fc/fcp/ap/app | comboStatus (0-4) |
| fs | sync/fs/fsp/fsd/fsdp | syncStatus (0-5) |
| type | `type: "dx"/"sd"` (上传格式) | 内嵌在 musicId (>10000=DX) |
