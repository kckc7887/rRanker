# rRanker 技术架构

## 文档定位

本文描述当前仓库中实际运行的移动端工程。内容以 `apps/mobile` 的源码、`package.json`、Expo 配置、路由和测试为依据，不承担产品路线图或历史记录职责。

代码、配置、类型和测试是事实来源。修改工程结构、运行链路、数据流、持久化、生命周期、构建命令、CI 或平台限制时，必须同步更新本文。

## 技术栈与工程入口

| 项目 | 当前实现 |
|---|---|
| 应用目录 | `apps/mobile`，npm 工程，入口为 `expo-router/entry` |
| 运行框架 | Expo 54、React Native 0.81、React 19，启用 React Native New Architecture |
| 语言 | TypeScript 5.9，严格模式，`@/*` 映射到 `apps/mobile/src/*` |
| 导航 | Expo Router 6；根级 `Stack` + 五个 `NativeTabs` |
| 服务端状态 | TanStack React Query 5 |
| 本地状态 | Zustand 5 |
| 持久化 | Expo SQLite、`expo-sqlite/kv-store`、Expo SecureStore、受控文件目录 |
| 校验 | Zod 4、Vitest 单元测试、Jest Expo UI/合同测试、ESLint、TypeScript |

Node.js 最低版本由 `apps/mobile/package.json` 约束为 20.19；当前 iOS CI 使用 Node.js 22 和 `npm ci`。应用同时包含 iOS、Android 配置，Web 配置存在，但项目执行规范禁止启动 Expo Web。

## 路由与运行时装配

`apps/mobile/app/_layout.tsx` 是运行时装配中心：

1. 最外层安装 `AppLifecycleProvider`，将 `active`、短暂 `inactive`、后台和内存警告转成统一生命周期状态。
2. 启动阶段并行恢复主题、图标字体、SecureStore 会话和各类本地账号档案；准备完成前只渲染加载态。
3. 准备完成后安装 React Query、应用主题、全局通知和根导航栈。
4. 首帧交互结束后再补齐账号缩略信息、本地 Rating 与存储维护，避免阻塞启动。
5. 后台时暂停上传任务并取消查询；回到前台后产生新的可取消工作代次；内存警告时释放非活动 Query 和 Expo Image 内存缓存。

根栈承载主标签页、个人曲库、游戏管理、存储管理、个性化、歌曲详情、成绩图、谱面确认和 OAuth 回调等文件路由。主标签页位于 `app/(tabs)/_layout.tsx`，固定为总览、最佳、成绩、曲库、设置五项；各标签内部通过 `MainTabStack` 和 `CachedTabScreen` 保持导航及页面状态。

## 模块职责

| 目录 | 职责 |
|---|---|
| `app/` | 文件路由、页面级装配、导航参数边界 |
| `src/components/` | 通用组件及按游戏组织的容器/表现组件；跨游戏组件集中在 `game-content/` 等公共入口 |
| `src/domain/` | 游戏原始领域类型、统一稳定语义、纯函数、主题规则和注册表 |
| `src/features/` | 成绩图、谱面预览与下载、存储管理、工具箱等可组合功能族 |
| `src/hooks/` | React Query 查询、组合读取和页面数据适配 |
| `src/providers/` | 上游认证、请求、DTO 校验和 Provider 契约 |
| `src/repositories/` | 快照、曲库、资源和用户曲库的持久化接口 |
| `src/services/` | Provider 与仓库之间的业务编排、缓存加载、上传、账号切换和资源处理 |
| `src/state/` | Session、主题、筛选、生命周期、QueryClient 和界面状态 |
| `src/storage/` | SQLite/SecureStore/KV 具体实现及存储工厂 |
| `src/theme/` | 应用主题和主题色解析 |
| `tests/` | Vitest 纯逻辑测试、Jest UI 测试、结构哈希与字符串金样合同 |

## 游戏、Provider 与数据链路

`src/domain/game-bind-options.ts` 的 `GAME_OPTIONS` 是前台游戏与绑定方式注册表。当前可用板块包括舞萌 DX、中二节奏、Phigros、Phira、冰与火之舞、喵斯快跑，以及聚合展示的 osu!standard、osu!mania、osu!catch、osu!taiko。Provider 包括账号密码、OAuth、设备授权、公开玩家、本地账号和示例账号等形态；`test` 仍是类型层保留的空壳 GameId，不是当前选择器条目。

主数据读取链路为：

```text
文件路由 / 游戏容器
  -> 查询 Hook（useGameData 或游戏专属 Hook）
  -> Service 编排与缓存策略
  -> Provider / Repository
  -> 上游 HTTP、SQLite、SecureStore、KV 或受控文件目录
  -> 游戏原始模型
  -> GameContentAdapter 与展示适配器
  -> 共享页面和共享卡片
```

`useGameData` 是当前账号总览数据的中央编排点，会根据游戏、Provider、账号和会话模式分派到对应加载器。注册表和中央编排允许显式枚举游戏；可复用渲染核心不承担游戏查询，也不应通过 `gameId` 分支解释游戏语义。

每个游戏保留自己的上游 DTO、Zod Schema、缓存快照和计算规则。跨游戏稳定身份和展示语义通过 `domain/game-content.ts`、`features/game-content/presentation.ts` 及各游戏适配器输出；个人曲库继续使用既有 `ChartType`、`levelIndex` 和存储键，不由展示层改写。

## 状态、持久化与资源生命周期

- `state/session-store.ts` 保存当前游戏、账号、Provider、会话映射和运行时 Provider 实例；持久凭据由 `storage/secure-session-store.ts` 管理。
- `state/query-client.ts` 提供进程内唯一 QueryClient；账号最终数据使用 `services/game-data-query.ts` 的版本化键。
- SQLite 的进程内连接由 `storage/rranker-database.ts` 集中管理；快照、资源和用户曲库通过对应 Repository 访问。
- 缓存读取优先走本地首屏、后台刷新和 AbortSignal 取消链路。短暂 `inactive` 与普通后台不会被当作内存压力；只有内存警告触发非活动 Query 和图片内存释放。`CachedTabScreen` 在这些状态下保持已挂载画面，只通过 active context 暂停重工作。
- `RemoteImage` 统一远程图片加载。受控压缩缓存是 v3，总预算 10 MiB、单项上限 10 KiB；列表项达到 50% 可见并持续 250 ms 后才允许持久化。在线原图仍作为主加载源，缓存文件只作本地回退。失活只暂停落盘，不把已显示 source 置空。
- 存储管理通过 `GAME_STORAGE_ADAPTERS` 统一统计和清理各游戏资源。显示的可清理范围与实际删除范围必须使用同一适配器和缓存策略；不得直接清空整个 Expo `Paths.cache`。

## WebView 与文件型功能

- 谱面确认由 `features/chart-preview-shared/` 提供 React Native 壳、资源暂存、桥接、注入工厂和播放时钟；游戏目录只提供解析、资源计划和配置。每次预览仍使用独占 session 目录；远程 `url+bytes` 资产可先写入 `Paths.cache` 下 `rranker-` 前缀目录（大小匹配则跳过下载），再写入 session。舞萌皮肤在 session 内编码为 `skin-data.js` data URL，播放器不通过 `file://` 直接读 PNG；该文件随共享缓存一并统计和清理。
- 谱面下载由 `features/chart-download-shared/` 统一处理临时目录、取消、进度、文件名和保存位置，游戏功能负责组装具体资源。
- 成绩图由 `features/best-image/` 统一处理偏好、资源、WebView 状态、预览、导出和共享屏幕控制器；预览轮播同一时刻只挂载当前 WebView 页面。
- 上述功能涉及 WebView 内容进程、文件选择、相册权限、原生手势和大图内存，自动化测试不能替代真机验收。

## 开发、测试与构建

所有 npm 命令在 `apps/mobile` 执行：

```powershell
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run test:ui
npm test
```

`npm run test:unit` 使用 Vitest 运行 `tests/**/*.test.ts`；`npm run test:ui` 使用 Jest Expo 串行运行 `tests/**/*.test.tsx`。公共 UI 还由 Host Tree/Style 哈希、HTML/脚本字符串金样和虚构游戏合同保护，禁止仅更新基线来接受未解释差异。

本地原生命令包括 `npm run android`、`npm run ios`、Android prebuild 与 APK 脚本。Release、APK、EAS 或原生构建成本较高，只有用户明确要求时才执行；修改原生/Fabric/WebView 行为时，JS 测试通过也不能代替对应平台构建和真机验证。

`.github/workflows/build-ios.yml` 是手动触发的 iOS 流程：Ubuntu 质量任务运行 lint、typecheck 和全部测试；macOS 任务读取版本、向 App Store Connect 查询下一构建号、执行 Expo prebuild、安装 Pods 与签名材料、Archive、导出 IPA、上传构建产物并提交 TestFlight。Windows 本地无法证明 Xcode Archive、签名、上传或 TestFlight 处理成功。

