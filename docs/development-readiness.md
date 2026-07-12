# 开发前准备与开工门禁

> 检查日期：2026-07-11。范围仅包含 rRanker 主应用 M0–M4；爬虫、代理及向水鱼/落雪上传属于 M5，不是当前开工条件。

## 1. 当前结论

| 范围 | 状态 | 结论 |
| --- | --- | --- |
| 产品边界 | 就绪 | 查询/展示与未来抓取/上传已解耦 |
| 阶段优先级 | 就绪 | M0–M4 非上传功能优先，M5 最后实施 |
| 双端架构 | 就绪 | UI 与进程内 TypeScript service/repository 共用，不运行 localhost server |
| 日常测试路径 | 就绪 | Windows 自动测试 + Android Emulator + iPhone Expo Go |
| Expo 工程 | 未创建 | 需要按本清单完成门禁后 scaffold |
| 正式脱敏 fixture | 未就绪 | 本地 Demo 有样例，但尚未提取为受跟踪的最小测试数据 |
| 水鱼读取契约 | 待复验 | `docs/api-protocol.md` 是历史清单，不是当前生产契约 |
| 最终 UI 输入 | 待用户提供 | 用户自行负责视觉方向；没有设计稿前不做最终视觉实现 |
| iOS 分发 | 暂缓 | 当前不付 Apple Developer 年费，只做 Expo Go 验证 |
| Android 真机验收 | 暂缓 | 当前无 Android 真机，不影响 M0–M3 开发 |

结论：**可以开始 M0 数据底座准备，但不应直接开始真实 provider 或最终 UI 实现。** 完成第 2 节三个阻塞门禁后，M1 才进入“可实现”状态。

## 2. 三个阻塞门禁

### A. 脱敏 fixture

- 从本地 Demo 中只抽取能覆盖 schema 的最小记录，不复制整份真实账号输出。
- 替换昵称、好友码、token、cookie、账号标识和其他可识别信息。
- 至少建立：正常玩家、空成绩、未知枚举、缺字段、损坏响应、B35/B15 边界样例。
- fixture 放入正式 `fixtures/` 并受 Git 跟踪；原始 Demo 继续留在被忽略的 `demo/`。
- 人工复算至少一组 Rating/B50，作为算法基准。

### B. 水鱼只读 API 契约

- 只验证当前产品会调用的读取端点，不提前验证上传。
- 每个端点记录 base URL、method、headers/body、认证来源、成功 schema、失败 schema、限流和超时。
- 禁止在仓库、日志、截图或 fixture 中保存真实 token。
- 验证结果写回 `docs/api-protocol.md`，标注 `last_verified` 日期。
- 在真实契约完成前，UI 只连接 fixture provider。

### C. UI 设计输入

用户至少需要提供以下任一种：

- 可实现的 Figma/设计稿；或
- 页面线框 + 颜色/字体/间距/组件规范；或
- 明确允许先做无视觉承诺的功能线框。

最低页面清单：总览、B50、成绩列表、歌曲搜索、歌曲详情、工具箱、收藏/练习清单、设置与数据源状态。

没有设计输入时，可以开发 domain、provider、repository、缓存和测试，但不自行生成最终 UI 风格。

## 3. Scaffold 时锁定的工程决策

以下项目在执行 `create-expo-app` 的同一次变更中确定并记录，不提前猜版本：

- Node.js 与 Expo SDK 的实际兼容版本。
- 包管理器与唯一 lockfile；默认优先 npm，用户另有偏好时再调整。
- TypeScript strict、路径别名、lint/format、测试脚本和 CI 命令。
- Expo Router 目录结构。
- 应用 slug；iOS bundle identifier / Android applicationId 可在正式构建前最终确认。
- 支持的最低 OS 版本以所选 Expo SDK 的构建配置为准。

建议目录：

```text
src/
  app/                 # 路由与页面装配
  components/          # 共用 UI 组件
  domain/              # 领域模型与纯计算
  providers/           # 外部数据源 adapter
  repositories/        # provider/cache 协调
  services/            # 进程内 application service
  storage/             # SQLite/SecureStore 封装与迁移
  features/            # B50、查歌、工具箱、收藏、推荐
fixtures/              # 脱敏契约与算法样例
tests/
```

## 4. Expo Go 能力边界

- Expo Go 只用于当前开发验证，不视为生产分发验收。
- 只引入 Expo Go 已包含的 Expo SDK 或官方支持第三方库；每次新增依赖先核对当前 SDK 文档。
- `expo-sqlite` 可用于普通缓存，但 Expo Go 不支持 SQLCipher；敏感凭据不能放 SQLite。
- `expo-secure-store` 用于小型 token/key；当前不启用 `requireAuthentication`/Face ID，因为 Expo Go 下该能力有限制。
- 不加入 config plugin 专属配置、自定义原生代码、Network Extension 或 `VpnService`。
- 某个非上传功能若必须依赖 development build，先记录决策，不偷偷突破当前成本边界。

## 5. 安全与数据规则

- 不收集或持久化 provider 账号密码；优先 provider-issued token。
- token 只进 SecureStore；日志只记录 provider、操作、状态码、耗时和脱敏错误码。
- SQLite 查询使用参数化语句；缓存表必须有 schema version 和迁移测试。
- 上游失败不删除最后有效快照；用户可以查看来源与最后更新时间。
- fixture、截图、崩溃报告、导出图片不得包含 token、cookie、好友码或隐藏字段。
- 删除账号/清除数据必须同时清理 SecureStore、SQLite 缓存和派生文件。

## 6. M0 完成标准

- [x] `fixtures/` 中有最小脱敏样例和人工复算基准。
- [x] 领域模型与 Zod schema 已定义。
- [x] Rating/B50、排序、ID 映射测试通过。
- [x] 水鱼实际使用端点完成只读契约复验（`/music_data`、`/chart_stats`、`/player/records` 200；匿名 403；伪凭据 401；`/login`、`/player/profile` 已接入 provider）。
- [x] Expo 工程可在 Windows 启动；Android 静态 bundle 通过（4.55 MB Hermes）。iPhone Expo Go 与 Android Emulator 运行时由用户在 Android Studio / Expo Go 手动验收，2026-07-12 用户确认验证通过允许交付。
- [x] 缓存与安全存储做最小读写 spike，并记录 Expo Go 限制。
- [x] 用户提供 UI 设计输入，或明确批准功能线框阶段（M0 采用功能线框，最终视觉延后）。
- [x] `npm test`、类型检查和 lint 命令写入工程脚本（`apps/mobile/package.json`）。

M0 已于 2026-07-12 交付。M1 双端查分 MVP 正式开工。

## 7. 非阻塞但发布前必须完成

- Apple Developer 账号、iOS development/preview build 与 TestFlight。
- Android 真机与 Google Play 内部测试。
- 封面、别名、曲库、字体和其他素材的许可/署名审查。
- 隐私政策、数据删除说明、第三方服务声明和错误反馈渠道。
- 性能基线：600+ 成绩列表、冷启动、数据库迁移和离线打开。

