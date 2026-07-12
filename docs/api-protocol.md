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
