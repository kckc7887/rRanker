# rRanker Mobile M0

Expo SDK 54 + Expo Router + TypeScript strict 的双端功能线框。页面目前由脱敏 fixture 驱动；真实水鱼 provider 已实现，但必须通过设备契约验证后再作为默认数据源。

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
- 不调用上传、删除成绩或生成/刷新 Import-Token 的端点。
