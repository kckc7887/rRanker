# 2026-07-11 M0 数据底座与双端功能线框

## 改动原因

开始 rRanker 第一阶段开发，在不实现爬虫、上传、落雪、自建后端或最终视觉的前提下，建立可验证的舞萌 DX 数据底座与 Expo 双端功能线框。

## 具体实现

- 在 `apps/mobile/` 创建 Expo SDK 54、Expo Router、TypeScript strict 与 npm lockfile 工程。
- 实现 Player、Song、Chart、ScoreRecord、Best50Snapshot、DataSource、Rating、B35/B15、封面 ID 映射和 Zod 输入校验。
- 建立不含昵称、用户名、好友码、Token/Cookie 的脱敏 fixture，覆盖 54 条边界成绩、未知枚举、缺字段、空成绩与 700 条性能输入。
- 实现 Fixture/DivingFish provider、统一错误、账密登录与 Import-Token 回退；密码不持久化，JWT/Token 只进入 SecureStore。
- 实现带 schema version 的 SQLite 最近有效快照、上游失败回退与凭据/缓存联合清理。
- 新增总览、B50、成绩和设置功能线框，并将 fixture 快照写入 SQLite。
- 复验水鱼公开/匿名端点，确认 `/player/records` 是对象包装，成绩版本必须与 `music_data.basic_info.from` 合并。
- 配置 `ANDROID_HOME` 与 Android SDK PATH；后续模拟器运行验证改由用户在 Android Studio 手动执行。
- 在 `docs/mobile-testing.md` 增加 Android Studio 手动启动、四页签、SQLite 清理和水鱼认证验收步骤。

## 期望输出

- Windows 上测试、类型检查、lint 和 Android bundle 全部通过。
- 同一 fixture 得到稳定 Rating/B50；未知或缺失输入不导致静默丢记录。
- Android Emulator 与 iPhone Expo Go 可打开同一功能线框并验证 SQLite、SecureStore 和水鱼认证。

## 实际输出

- `npm test`：3 个测试文件、10 项测试全部通过，包含空成绩、未知枚举、缺字段、B35/B15 边界与 700 条输入。
- `npm run typecheck` 与 `npm run lint` 最终验证通过。
- Expo Android 静态 bundle 成功，输出 4.55 MB Hermes bundle。
- 水鱼 `/music_data`、`/chart_stats`、`/player/test_data` 返回 200；匿名 `/player/records` 返回 403；虚假凭据登录返回 401。
- 自动模拟器验证期间主机发生非正常重启，因此不把 Android 运行时标记为通过；后续由用户从 Android Studio 手动验证。iPhone Expo Go 与真实水鱼成功登录同样待用户验证。
