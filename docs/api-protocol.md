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

> last_verified: 2026-07-13 — 默认请求返回 1294 首歌曲、20 个版本；最大有效版本为 `25500 / 舞萌DX 2026`。以 `Fraq` 交叉验证：水鱼 `11806 / DX / PRiSM PLUS` 对应 LXNS `1806 / dx / version 25500`。

当前职责边界：

- 玩家资料、成绩和认证继续来自水鱼；LXNS 只提供无需凭据的公共曲库元数据。
- 当前版本取 `versions[].version` 中最大有效值，并要求至少存在一张同版本、未禁用谱面；否则拒绝生成 B50，不猜版本。
- B35/B15 按 LXNS 的谱面级 `version` 分类，不再使用水鱼歌曲级 `basic_info.from` 字符串分类。
- 普通水鱼 DX 曲目 ID 大于 10000 时对 10000 取模后与 LXNS ID 对齐；宴会场 ID 大于 100000 时保留。
- 匹配键为规范化歌曲 ID、谱面类型与难度序号；无法匹配的成绩不进入 B35/B15，并在界面显示数量。
- LXNS 请求失败时使用最近有效曲库缓存；无曲库缓存时只允许回退到最近完整成绩快照。
- LXNS 玩家 API、OAuth、成绩写入和上传仍未接入。

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
