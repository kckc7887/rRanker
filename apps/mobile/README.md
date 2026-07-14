# rRanker Mobile M1

Expo SDK 54 + Expo Router + TypeScript strict 的双端查分 MVP。玩家、成绩与认证来自水鱼，曲库与谱面版本元数据来自 LXNS 公共 API；未登录时使用脱敏 fixture。

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
- JWT/Import-Token 只存 SecureStore。
- SQLite 只保存非敏感成绩快照，并带 schema version。
- 查询缓存键不包含 JWT 或 Import-Token 原文。
- 总览「上传数据」仅为待实现占位；M5 方向为 DXNet/rival 成绩同步后导出到查分器，不接微信截包。
- 不调用删除成绩或生成/刷新 Import-Token 的端点。
