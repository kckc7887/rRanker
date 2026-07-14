# API 协议

> 状态说明：本文件来自 2026-07-10 的本地 PoC 与历史实现记录，只能作为待验证清单，不能直接视为当前生产 API 契约。开始实现 provider 前，必须对每个实际使用的端点重新记录：验证日期、认证方式、请求 schema、成功响应、4xx/5xx、限流与超时行为。当前阶段只实现读取；上传与华立抓取属于 ROADMAP M5。
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
| `/maimai/song/list?notes=true` | GET | 无 | 详细曲库、谱师与 TAP/HOLD/SLIDE/TOUCH/BREAK 物量 |
| `/maimai/alias/list` | GET | 无 | 歌曲别名 |
| `/maimai/plate/list?required=true` | GET | 无 | 带歌曲、难度、rate、FC、FS 条件的姓名框要求 |

> last_verified: 2026-07-13 — 本次 M2 验证时详细曲库返回 1305 首歌曲、别名库 1014 项、带要求姓名框 397 项；最大有效版本为 `25500 / 舞萌DX 2026`。以 `Fraq` 交叉验证：水鱼 `11806 / DX / PRiSM PLUS` 对应 LXNS `1806 / dx / version 25500`。M4 再次按官方文档及公共响应确认 `Song.map` 为可空的开放字符串，用于曲目所属区域；歌曲 `#363 / Oshama Scramble!` 的细分版本号为 `15007`，应按 LXNS 官方前端规则向下匹配主版本 `15000 / ORANGE PLUS`。

当前职责边界：

- 玩家资料、成绩和认证继续来自水鱼；LXNS 只提供无需凭据的公共曲库元数据。
- 当前版本取 `versions[].version` 中最大有效值，并要求至少存在一张同版本、未禁用谱面；否则拒绝生成 B50，不猜版本。
- `Song.version` 与谱面 `version` 可能是 `15007` 这类细分版本号；显示、筛选和版本统计均按 `versions[]` 降序取“不大于原值的最大主版本”，不能用精确 Map 查找或简单千位取整。
- B35/B15 按 LXNS 的谱面级 `version` 分类，不再使用水鱼歌曲级 `basic_info.from` 字符串分类。
- 普通水鱼 DX 曲目 ID 大于 10000 时对 10000 取模后与 LXNS ID 对齐；宴会场 ID 大于 100000 时保留。
- 匹配键为规范化歌曲 ID、谱面类型与难度序号；无法匹配的成绩不进入 B35/B15，并在界面显示数量。
- LXNS 请求失败时使用最近有效曲库缓存；无曲库缓存时只允许回退到最近完整成绩快照。
- 详细曲库、别名和姓名框使用不同资源键缓存；单项损坏只淘汰对应资源，不清除成绩快照或 SecureStore 凭据。
- 姓名框实测字段为 `plates[].required[]`，歌曲为 `{ id, title, type }`；本地进度必须同时匹配歌曲 ID、SD/DX、难度以及 rate/FC/FS，不能按旧的 `requirements + number[]` 猜测。
- 国服/日服名称对照由 LXNS `versions` 与水鱼 `basic_info.from` 的发布曲目交叉核验；当前 `25500 / 舞萌DX 2026` 对应 `maimai でらっくす PRiSM PLUS`。
- 歌曲区域读取 LXNS `Song.map`；该字段可能完全缺失，且官方未定义枚举。本地按可选开放字符串接收，缺失、`null` 或空白时不显示，不硬编码区域列表。
- 曲绘地址为 `https://assets2.lxns.net/maimai/jacket/{song_id}.png`，只对可见列表项加载并使用磁盘缓存；不批量预取，正式发布前需完成素材许可审查。
- 姓名框预览地址为 `https://assets2.lxns.net/maimai/plate/{plate_id}.png`（公共资源，与查分器账号无关；`plate_id` 来自 LXNS `/plate/list`）。水鱼无对应图床。
- 舞萌玩家成绩也可经由下方「LXNS OAuth 个人 API」绑定；公共曲库职责不变。成绩上传（`write_player`）本轮未接入。

## LXNS OAuth / 个人 API（只读绑定）

基础：`https://maimai.lxns.net`

公开配置（可进仓库）：`client_id`、`redirect_uri=urn:ietf:wg:oauth:2.0:oob`、scope=`read_user_profile read_player write_player`。
**禁止**把 `client_secret` 写入 App 或仓库；移动端使用 PKCE。

| 端点 | 方法 | Auth | 说明 |
|------|------|------|------|
| `/oauth/authorize` | GET | 无 | 用户授权；附 `code_challenge` / `S256`；OOB 展示授权码 |
| `/api/v0/oauth/token` | POST | 无 | `authorization_code`（需 `code_verifier`）或 `refresh_token`；顶层返回 token |
| `/api/v0/user/maimai/player` | GET | `Authorization: Bearer` | 当前用户玩家信息 |
| `/api/v0/user/maimai/player/scores` | GET | `Authorization: Bearer` | 当前用户全部成绩 `Score[]` |
| `/api/v0/user/maimai/player/scores` | POST | Bearer | 上传成绩（scope `write_player`；App 暂未调用） |

OAuth 约束（官方文档）：

- Access Token 有效期 15 分钟；Refresh Token 30 天；刷新会轮换新 refresh，旧 refresh 失效。
- Token 成功响应字段在**顶层**；旧 `data.*` 包装已废弃，解析时顶层优先。
- Token 错误响应为 `{ error, error_description }`，无 `success/code/data`。
- 用户 API 成功信封：`{ success, code, message, data }`。

成绩映射：

- `type`：`standard`→`SD`，`dx`/`utage`→`DX`。
- `dx_rating` 向下取整为单曲 Rating；定数由 LXNS 公共曲库 enrich。
- `fc` / `fs` / `rate` / `level_index` 与文档枚举一致。

> last_verified: 2026-07-15 — 按官方 OAuth / 舞萌 API 文档落地 PKCE+OOB 与 Zod 契约；自动测试覆盖 PKCE URL、Score 映射、会话路由与按账号快照隔离。真机粘贴授权码端到端复验待用户在 Expo Go 完成。

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
