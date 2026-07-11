# rRanker 产品路线图

> 规划基线：2026-07-11。开发环境为 Windows 11 PC + iPhone 17，无 Mac、无 Android 真机，暂不开通 Apple Developer 账号。

## 1. 当前产品边界

rRanker 先完成所有不涉及“上传成绩到查分器”的功能，爬虫与上传整体后置。

- **双端共用产品代码**：React Native/Expo UI、领域逻辑、provider、缓存、计算、收藏和推荐使用同一套 TypeScript 代码。
- **不运行 localhost 服务**：这里的“本地服务”指 App 进程内的 `services/repositories` 业务层，不是后台 HTTP 服务，因此可以双端复用。
- **查询与上传分离**：主 App 从水鱼等 provider 读取数据；未来爬虫只负责采集成绩并上传到水鱼/落雪，不作为主 App 的内部数据源。
- **爬虫完全后置**：当前不实现代理、CA、VPN、抓取、本地上传队列或平台原生模块。
- **水鱼先行、落雪后接**：先完成水鱼读取能力；项目推进后由用户申请落雪 API，再加入落雪读取和上传 adapter。
- **当前不付 Apple 年费**：iPhone 使用 Expo Go 做开发验证；TestFlight、正式签名和原生抓取延后。

## 2. 实现优先级

| 优先级 | 能力 | 完成定义 |
| --- | --- | --- |
| P0 | 领域模型与算法 | Player/Song/Chart/Score/B50 统一；Rating、B35/B15、ID 映射有固定样例测试 |
| P0 | 水鱼只读 provider | 曲库、玩家成绩、B50 等实际需要的接口逐项验证；错误与限流有明确降级 |
| P0 | 双端 UI 骨架 | 同一套页面在 iPhone Expo Go 与 Android Emulator 可运行 |
| P0 | 查分基础 | 玩家概览、DX Rating、B35/B15、成绩列表、数据来源和更新时间可用 |
| P1 | 查歌与筛选 | 支持曲名、ID、曲师、谱师、难度、定数、版本等可获得字段的组合查询 |
| P1 | 本地缓存与离线 | 最近有效快照可离线查看；缓存损坏和 schema 升级可恢复 |
| P1 | 基础工具箱 | Rating、达成率、容错、牌子进度、版本对照等功能完成 |
| P2 | 收藏与分享 | 收藏夹、练习清单、结果图片导出等不依赖上传的功能完成 |
| P2 | 推荐与分析 | 拟合定数、目标 Rating、弱项或标签推荐有透明规则和可验证输入 |
| P2 | Android 兼容 | Windows 模拟器和云设备通过；有真机后补发布验收 |
| P3 | 落雪读取 provider | 用户取得 API 后接入，与水鱼统一到 provider 接口 |
| P4 | 爬虫与上传 | 所有非上传功能稳定后，才分别研究抓取并上传到水鱼/落雪 |

“全部非上传功能”以本表和 M1–M4 当前列出的范围为准。后续新想法进入 `TODO.md` 单独排期，不自动阻塞 M5，避免范围无限增长。

## 3. 分阶段 ROADMAP

### M0：领域与数据底座

- 从本地 Demo 输出提取最小脱敏 fixture，不把真实账号数据放入正式测试集。
- 定义 `Player`、`Song`、`Chart`、`ScoreRecord`、`Best50Snapshot` 和 `DataSource`。
- 固化 Rating、B35/B15、难度、FC/FS/rate、SD/DX 和 ID 映射规则。
- 建立 Zod schema、provider adapter、错误模型、单元测试和契约测试。

验收：Windows 上同一输入始终得到同一结果；未知字段不崩溃、不静默丢记录。

### M1：双端查分 MVP

- 创建 Expo/React Native 工程，只采用 Expo Go 可用能力。
- 同步实现首页、玩家概览、B50、成绩列表、查歌和设置页。
- iPhone 17 使用 Expo Go；Android 使用 Windows Android Emulator。
- 先用 fixture 打通完整 UI，再接经过验证的水鱼只读接口。
- 本地业务层写成普通 TypeScript 模块，不启动 localhost server。

验收：iOS 与 Android 使用同一 fixture 时，数值、排序、筛选和页面状态一致。

### M2：查询与工具箱完整版

- 完成水鱼只读 provider、离线快照、刷新、错误恢复和数据来源展示。
- 完成歌曲详情、复合搜索、成绩筛选、Rating、达成率、容错、牌子和版本工具。
- 对封面失败、日文长标题、600+ 成绩、断网、token 失效和空账号做完整处理。
- 不包含“更新成绩”“上传成绩”“抓取微信”等入口。

验收：不使用爬虫也能完成查分器和工具箱的全部基础使用流程。

### M3：收藏、分享、推荐与分析

- 收藏夹、练习清单、本地标签和备份恢复。
- B50/牌子/成绩结果的图片或文件导出。
- 随机谱面、拟合定数推荐、目标 Rating 推荐和透明的推荐理由。
- 谱面标签/弱项分析只有在数据来源、许可和准确度可验证时启用。

验收：所有不涉及向外部查分器上传数据的规划功能均已完成或明确取消。

### M4：双端稳定与发布准备

- iPhone Expo Go 完成长期使用、缓存迁移、网络切换和系统生命周期验证。
- Android Emulator 覆盖最低支持版本与主流版本；云设备扩大机型覆盖。
- 获得 Android 真机/测试者后补真机验收。
- 需要 TestFlight 或正式 iOS 包时，再决定是否开通 Apple Developer 账号。

验收：共用产品层稳定；所有已知平台差异有明确处理或发布限制。

### M5：爬虫与查分器上传（最后实施）

爬虫只承担以下职责：

```text
平台抓取器 -> 标准成绩快照 -> 上传适配器 -> 水鱼 / 落雪
```

- 抓取器不得成为主 App 查询、缓存、B50 或推荐的必需依赖。
- Android 与 iOS 的代理/抓取分别实现，不强求代码互通。
- 标准成绩快照和上传任务状态可以共用 TypeScript schema。
- 水鱼上传 adapter 先实现；落雪 adapter 等用户申请并取得 API 后实现。
- 上传必须具备快照固定、幂等、重试、部分失败、脱敏日志和结果追踪。
- 若移动端抓取不可行，可取消该平台抓取，不影响主 App 继续发布。

验收：抓取失败不会损坏网络或主 App 数据；上传结果可追溯；同一快照不会重复污染查分器。

## 4. 架构边界

```text
UI / Screens
    ↓
Application Services（TypeScript，双端共用）
    ↓
Domain + Repositories（TypeScript，双端共用）
    ↓
Provider Adapters / SQLite / SecureStore（接口共用，平台实现由 Expo 负责）
```

当前工程不需要本地 HTTP server。只有未来爬虫阶段才可能新增：

- Android 原生 `VpnService` / 抓取模块。
- iOS 原生 Network Extension / 抓取模块。
- 共用的标准快照与水鱼/落雪上传 adapter。

## 5. 技术栈

| 层 | 选择 | 当前边界 |
| --- | --- | --- |
| 客户端 | React Native + Expo + TypeScript | UI 与业务逻辑双端共用 |
| 路由 | Expo Router | 页面导航，不放领域计算 |
| 请求缓存 | TanStack Query | 水鱼/落雪读取请求、刷新和错误状态 |
| 本地状态 | Zustand 或等价轻量方案 | 仅保存筛选和 UI 偏好 |
| 本地数据 | Expo SQLite | 快照、收藏、练习清单和迁移 |
| 安全存储 | Expo SecureStore | token/cookie；不写普通日志或 SQLite 明文列 |
| 数据校验 | Zod | 所有 provider 输入先校验再映射 |
| 测试 | Vitest + React Native Testing Library | Windows 执行共用逻辑和组件测试 |
| iOS 当前验证 | Expo Go + iPhone 17 | 不覆盖 TestFlight、正式签名和自定义原生模块 |
| Android 当前验证 | Android Studio Emulator + 云设备 | 无真机前不宣称发布就绪 |

## 6. 数据源顺序

1. 水鱼只读查询与曲库。
2. 本地离线快照。
3. 落雪 API 申请成功后加入落雪只读 provider。
4. 全部非上传功能稳定后，开始水鱼上传。
5. 落雪 API 权限和协议确认后，加入落雪上传。

不能根据历史 Demo 或参考项目猜测当前 API；每个端点都要用真实请求、响应 schema 和错误样例验证。

## 7. 下一步执行顺序

1. 按 `docs/development-readiness.md` 完成开工门禁。
2. 完成领域模型、脱敏 fixture 和 B50/Rating 测试。
3. 创建 Expo 工程，建立 iPhone Expo Go + Android Emulator 双端 UI 骨架。
4. 接入并验证水鱼只读 provider。
5. 依次完成 M2 工具箱与 M3 收藏/推荐/分享。
6. 完成 M4 双端稳定性验证。
7. 最后再为 M5 单独设计爬虫和水鱼/落雪上传，不提前写代理代码。
