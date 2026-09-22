# rRanker Mobile

Expo SDK 54 + Expo Router + TypeScript strict。舞萌玩家与成绩可来自水鱼、落雪或本地查分器；曲库与谱面版本元数据来自落雪公共 API。

## Commands

```powershell
npm test
npm run typecheck
npm run lint
npm start
npm run android
```

## Security

- 水鱼、落雪和 osu! 的令牌只存系统 SecureStore，不写入 SQLite 或日志。落雪绑定使用 PKCE。osu! 授权要求一次性 state。
- Rizline 账密登录会把密码保存在本机 SecureStore，只用于下次续期，登录页可以清除。
- SQLite 保存按账号隔离的成绩快照和个人曲库，并带 schema version。版本读不出来时保留原行，不删除。
- 查询缓存键不包含上传凭证原文。Phigros 推分缓存包含账号身份。
- 舞萌上传可以写入本地、水鱼和落雪。删除账号后，尚未完成的旧上传不能再写回。
- 开发与测试需要 Node.js 22.13 或更高版本。
