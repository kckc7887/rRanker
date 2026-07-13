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

**M1 决策（2026-07-12）**：UI 设计需求清单（`docs/m1-design-brief.md`）延后到 M2/M4，不在 M1 阻塞。M1 沿用 M0 功能线框风格，最终视觉延后。

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
- “删除全部本机数据”必须同时清理 SecureStore、SQLite 缓存、个人数据和派生文件；“仅清凭据与缓存”须明确提示个人数据仍保留。

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

## 7. M1 收口状态（2026-07-13）

- M1 双端 UI 已由用户完成 iPhone Expo Go 与 Android Emulator 验证。
- 收口复核发现真实水鱼路径曾错误复用 fixture 当前版本，现改为 LXNS 公共曲库的谱面级版本元数据。
- 冷启动会话恢复、离线旧数据标记、Import-Token 真实验证、重复请求和组件五态测试已一并修复。
- 用户已在后续 M2 双端验收中完成真实数据路径复验，M1 正式收口。

## 8. M2 收口与 M3 入口状态（2026-07-13）

- 用户确认 M2 双端验证交付 OK，查询、详情、工具箱和来源状态的手工验收完成。
- 全新执行 `npm ci` 成功；Vitest 19 个文件 64 项、Jest 3 个套件 11 项全部通过。
- TypeScript 类型检查、ESLint 与 Android Hermes 静态导出通过；导出包含 1559 个模块，主包 4.92 MB。
- M3 当前没有收藏、练习清单、备份、分享或推荐实现，也没有直接安装文件分享/视图截图依赖；进入对应批次前必须先核对 Expo SDK 54 文档和实际依赖能力。
- M3 按“本地收藏与备份 → 安全导出 → 可解释推荐”分批实施，详细门禁见 `docs/m3-readiness.md`。
- `npm audit` 报告 15 个中危、0 个高危、0 个严重问题，修复建议要求跨越到 Expo SDK 57；M3 不执行破坏性 `audit fix --force`，将 SDK 升级与工具链漏洞复核列为 M4 发布门禁。

结论：M2 正式完成，可以进入 M3；M3 各批次仍需分别完成数据模型、隐私白名单、依赖能力和算法口径验证。

## 9. M3A 本地曲库与备份状态（2026-07-13）

- 收藏、练习清单和标签使用独立 SQLite 表与 schema version，不依赖登录态，也不复用远端缓存表。
- 保持 5 个主 tab；总览进入“我的曲库”，查歌可收藏歌曲，歌曲详情可管理谱面练习项与歌曲/谱面标签。
- 版本化 JSON 备份只包含个人数据白名单；恢复支持默认合并和显式替换，所有多表写入使用 SQLite 独占事务。
- 设置页每次清除前询问是否包含个人数据；仅清凭据与缓存时保留收藏、练习清单和标签。
- Expo SDK 54 兼容的 `expo-document-picker`、`expo-file-system`、`expo-sharing` 已作为直接依赖安装。
- 自动化、类型、lint 和 Android Hermes 静态导出已通过；仍需用户在 iPhone Expo Go 与 Android Emulator 验证重启持久化、文件选择、系统分享和跨端恢复。
- 首轮双端环境已记录为 iPhone 17 / iOS 27 beta 3 与 Android 16.0 / API 36.1；针对 iOS 原生返回按钮重复布局和 Android Unicode 爱心轮廓差异已完成代码修正，等待同环境复验。

结论：M3A 代码交付完成，待双端手验后正式关闭；M3B/M3C 尚未开始。

## 10. 非阻塞但发布前必须完成

- Apple Developer 账号、iOS development/preview build 与 TestFlight。
- Android 真机与 Google Play 内部测试。
- 封面、别名、曲库、字体和其他素材的许可/署名审查。
- 隐私政策、数据删除说明、第三方服务声明和错误反馈渠道。
- 性能基线：600+ 成绩列表、冷启动、数据库迁移和离线打开。
