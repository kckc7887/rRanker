# rRanker Mobile M1

Expo SDK 54 + Expo Router + TypeScript strict 的双端查分 MVP。舞萌玩家与成绩可来自水鱼或落雪 OAuth；曲库与谱面版本元数据来自 LXNS 公共 API；未登录时使用脱敏 fixture。

## Commands

```powershell
npm test
npm run typecheck
npm run lint
npm start
npm run android
```

## Security

- 密码只存在于当次登录请求内存。
- 水鱼上传凭证与落雪 OAuth refresh 只存系统 SecureStore；不写入 SQLite 或日志。落雪绑定使用 PKCE，App 不保存 client_secret。
- SQLite 只保存非敏感成绩快照（按账号隔离），并带 schema version。
- 查询缓存键不包含上传凭证原文。
- 总览「上传数据」经好友码 → 公网 score-hub Friend VS → 本机凭证写入水鱼；曲库用于拼曲名。爬取结果不写入主查分缓存。落雪上传尚未实现。
- 不调用删除成绩端点；账密绑定可按需调用水鱼生成上传凭证。
