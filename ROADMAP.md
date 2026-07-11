# rRanker 产品路线图

> 规划基线：2026-07-11。现实开发环境为一台 Windows 11 PC 和一台 iPhone 17，没有 Mac、没有 Android 真机。规划以这些设备能实际验证的结果为准。

## 1. 核心决策

rRanker 继续使用 React Native/Expo，但不再把“Android 与 iOS 同时拥有本地代理、服务和爬虫”作为首版前提。

- **产品本体跨平台**：查分、B50、查歌、缓存、计算和收藏使用共用 TypeScript 领域层。
- **首发验证 iOS 优先**：现有 iPhone 是唯一真机，先完成 iOS 可用产品，再扩大 Android 验证。
- **数据接入优先 provider**：优先使用许可明确的 API、用户提供的 token 或文件导入。
- **本地抓取分平台研究**：iOS Network Extension 与 Android `VpnService` 是两项独立原生工程，不进入首版关键路径。
- **电脑端 Demo 不产品化**：只用于理解数据格式、生成本地样例和保留踩坑记录。

这不是放弃 Android，而是把“共用产品能力”和“平台专属抓取能力”拆开，避免后者阻塞前者。

## 2. 实现优先级

| 优先级 | 能力 | 完成定义 |
| --- | --- | --- |
| P0 | 领域模型与算法 | 固化 Player/Song/Chart/Score/B50；Rating、B35/B15、ID 映射有 fixture 对照测试 |
| P0 | iOS 只读查分 MVP | iPhone 17 可查看玩家概览、B50、成绩、数据来源与更新时间 |
| P0 | Provider 数据接入 | 至少一个无需本地代理的真实数据入口可用；token/cookie 使用安全存储 |
| P0 | 文件导入与离线快照 | provider 不可用时可导入标准 JSON；最近快照可离线打开 |
| P1 | 查歌与基础工具 | 官方曲名搜索、筛选、Rating 计算和容错计算可用 |
| P1 | iOS Beta | TestFlight 内部版本完成真实安装、升级和崩溃恢复测试 |
| P1 | Android 兼容层 | Windows 模拟器构建和核心流程通过；不承诺本地抓取 |
| P2 | Android 真机 Beta | 有真实 Android 设备或测试者后，完成设备矩阵和 Play 内部测试 |
| P3 | Android 本地抓取研究 | Kotlin `VpnService` spike；独立验收微信流量、证书、后台服务与商店政策 |
| P3 | iOS 本地抓取研究 | 获得 Mac/Xcode 后做 Swift Network Extension spike；独立验收 entitlement、签名和真机流量 |
| P3 | 推荐与谱面分析 | 数据质量和基础使用稳定后再开始 |

## 3. 分阶段 ROADMAP

### M0：平台无关底座（约 1 周）

- 从本地 Demo 输出提取最小脱敏 fixture。
- 定义统一 schema、provider adapter、错误模型和数据来源信息。
- 固化 Rating/B50 规则；未知枚举保留原文并降级。
- 建立 TypeScript 类型检查、算法测试和契约测试。

验收：Windows 上所有 fixture 通过；同一输入只产生一个确定结果。

### M1：iOS 只读 MVP（约 2–3 周）

- 建立 Expo/React Native 应用与 development build。
- 首页、玩家信息、B35/B15、成绩列表、查歌和数据来源说明。
- 先用 fixture 打通界面，再接第一个 provider。
- 支持标准 JSON 导入、本地缓存和错误恢复。
- 不加入代理、CA 证书、VPN 或微信抓取原生代码。

验收：iPhone 17 上完成首次打开、导入/拉取、离线重开、token 失效和升级安装。

### M2：iOS 可用版本（约 2–4 周）

- 接入至少一个许可与认证方式明确的成绩 provider。
- 完成查歌、Rating 计算、筛选、牌子进度或容错计算中的首批工具。
- 加入安全存储、数据库迁移、隐私说明和脱敏诊断。
- 通过 TestFlight 内部测试验证分发包，而不是只测 development build。

验收：核心功能不依赖 Windows 电脑或本地爬虫；TestFlight 安装、更新和回滚路径有记录。

### M3：Android 兼容版本（约 2 周，M2 后）

- 在 Windows 使用 Android Studio Emulator 验证布局、导航、存储和 provider。
- 通过云设备测试扩大系统版本与机型覆盖。
- 寻找至少 1–3 名 Android 真机测试者，验证键盘、返回键、后台恢复、网络和安装升级。
- 只复用共用产品能力；不在此阶段实现 `VpnService` 抓取。

验收：模拟器、云设备和至少一台真实 Android 通过核心清单后，才进入 Google Play 内部测试。

### M4：平台抓取可行性实验（无固定工期，独立立项）

Android 实验：

- 原生 Kotlin `VpnService`，不是 React Native JS 本地服务。
- 验证用户授权、前台服务、唯一 VPN 占用、进程回收、证书信任和目标 App HTTPS 行为。
- 必须有 Android 真机；模拟器或云设备不能替代微信完整交互验证。

iOS 实验：

- 原生 Swift Network Extension / Packet Tunnel app extension。
- 需要 Apple Developer 账号、Network Extension capability、签名配置和 Xcode 调试。
- 没有 Mac 时不开始实现；EAS 云构建不能替代所有 entitlement、extension 和 Xcode 调试工作。
- 即使拿到数据包，也不能假定可以解密第三方 App HTTPS 或通过 App Review。

停止条件：任何平台若需要高风险中间人证书、违反平台政策、无法稳定恢复网络，或维护成本高于产品价值，则终止该平台抓取，回退到 provider/token/文件导入。

### M5：推荐与扩展（基础产品稳定后）

- 收藏与练习清单。
- 可解释的练习推荐。
- 谱面结构与音乐偏好分析。
- 第二个音游 provider，用来验证领域抽象，而不是提前泛化。

## 4. 数据接入策略

按以下顺序决策，不并行开工：

1. **Provider API**：首选。验证认证、许可、限流、字段和失败降级。
2. **用户主动导入**：token、标准 JSON、系统文件选择器或分享入口。
3. **已有电脑 Demo**：仅供开发者生成 fixture，不作为普通用户使用前提。
4. **平台本地抓取**：P3 独立实验；Android/iOS 分别实现和评审。
5. **云端代抓**：默认不做。涉及用户凭据、Cookie、合规、成本和数据泄露面，除非以后单独立项。

## 5. 技术栈

| 层 | 建议 | 边界 |
| --- | --- | --- |
| 客户端 | React Native + Expo + TypeScript | 正式 scaffold 时锁版本；不假定当前已安装 |
| 路由 | Expo Router | 页面导航，不承载领域计算 |
| 请求缓存 | TanStack Query | provider 请求、刷新和错误状态 |
| 本地数据 | Expo SQLite | 快照、收藏、迁移；凭据不存普通表 |
| 安全存储 | Expo SecureStore 或等价系统钥匙串封装 | token/cookie；日志中禁止出现明文 |
| 校验 | Zod | 所有外部数据先校验再映射 |
| 测试 | Vitest + React Native Testing Library | Windows 执行共用逻辑与组件测试 |
| iOS 构建 | EAS Build + iPhone development build/TestFlight | 无 Mac 主路径；原生 extension 研究除外 |
| Android 构建 | Windows + Android Studio Emulator，后续 EAS/Play | 真机到位前不宣称生产可用 |

## 6. 当前设备下的测试原则

- Windows 负责：类型、算法、schema、组件、Android 模拟器和构建。
- iPhone 17 负责：iOS development build、真实网络、存储、生命周期、权限和 TestFlight。
- 云设备负责：Android 机型/版本的自动化覆盖，不替代微信、证书、VPN 等交互式真机实验。
- Mac 负责：仅在未来 iOS 原生 extension、Xcode 崩溃定位或签名问题出现时临时获取，不作为 M0–M3 的日常前提。

详细执行方案见 `docs/mobile-testing.md`。

## 7. 关键决策门槛

### Apple Developer 账号

- 若愿意开通：可使用 EAS iPhone development build 和 TestFlight，执行本路线。
- 若暂不开通：只能用 Expo Go 验证其支持范围内的 JS/UI，原生模块、正式签名和 TestFlight 延后。

### Android 发布

- 没有真实 Android 前，只做兼容开发，不承诺发布日期。
- 获得真实设备或可信测试者后，再决定是否进入 Play 内测。

### 本地抓取

- 不因为电脑 Demo 成功就推断移动端可行。
- Android 与 iOS 各自需要单独 spike、隐私评审、平台政策检查和停止条件。

## 8. 下一步执行顺序

1. 确认是否开通 Apple Developer 账号；这决定 iPhone development build 与 TestFlight 是否可用。
2. 提取脱敏 fixture，建立领域模型、B50 和 provider 契约测试。
3. 创建最小 Expo 工程，以 iPhone 17 完成 fixture 驱动的只读 MVP。
4. 验证一个无需本地代理的 provider，再加入 JSON 导入兜底。
5. 完成 iOS TestFlight 内测后再做 Android Emulator 适配。
6. 有 Android 真机或 Mac/Xcode 后，分别评估两个抓取 spike；在此之前不写抓取生产代码。
