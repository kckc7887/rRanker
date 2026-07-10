# API 协议

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

## 落雪 (LXNS)

基础: `https://maimai.lxns.net/api/v0/`

| 端点 | 方法 | Auth | 说明 |
|------|------|------|------|
| `/maimai/song/list?notes=true` | GET | 无 | 曲库 |
| `/user/maimai/player/scores` | GET/POST | `Authorization: Bearer {token}` | 查分/上传 |
| `/user/maimai/player/bests` | GET | Bearer | B50 |
| `/user/maimai/player` | GET | Bearer | 玩家信息 |
| `/user/maimai/player/score/history` | GET | Bearer | 单曲历史成绩 |
| `/oauth/authorize` → `/api/v0/oauth/token` | OAuth2 | client_secret | 获取 access token |
| `/maimai/trophy/list` 等 | GET | 无 | 收藏品 |

## 华立公众号爬虫

| 步骤 | 端点 | 说明 |
|------|------|------|
| OAuth 授权 | `GET tgk-wcaime.wahlap.com/wc_auth/oauth/authorize/maimai-dx` | 微信 UA |
| OAuth 回调 | `GET tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx?r=&t=&code=&state=` | 提取四参数 |
| 成绩爬取 | `GET maimai.wahlap.com/maimai-mobile/record/musicGenre/search/?genre=99&diff={0-4}` | 5 难度并行 |
| 玩家信息 | `GET maimai.wahlap.com/maimai-mobile/friend/userFriendCode/` | cookies |

## 数据格式差异

| 字段 | 水鱼 | 落雪 | NET原始 |
|------|------|------|---------|
| 歌曲 ID | 直接用 NET musicId (DX>10000) | NET musicId % 10000 | musicId |
| achievement | 浮点百分比 | 浮点百分比 | 整数×10000 |
| fc | fc/fcp/ap/app | fc/fcp/ap/ap+ | comboStatus (0-4) |
| fs | sync/fs/fsp/fsd/fsdp | sync/fs/fsp/fsd/fsdp | syncStatus (0-5) |
| type | `type: "dx"/"sd"` (上传格式) | `type: "dx"/"standard"` (上传格式) | 内嵌在 musicId (>10000=DX) |
