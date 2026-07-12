# M1 双端查分 MVP Spec

## Why
M0 数据底座已交付（领域模型、Zod schema、水鱼 provider、SQLite 缓存、SecureStore、脱敏 fixture、4 个功能线框 tab 均就绪，10 项测试全过）。当前 App 用 `src/features/wireframe-data.ts` 单例注入 FixtureProvider + 本地 `useEffect/useState`，无法支撑登录后切水鱼 provider、查歌筛选、跨页面状态保持与统一 loading/error/empty/stale 状态展示。M1 要把 M0 数据底座接入完整双端可用的查分 MVP，完成 ROADMAP M1 验收：iPhone Expo Go 与 Android Emulator 使用同一 fixture 时，数值、排序、筛选和页面状态一致。

## What Changes
- 新增"查歌"tab，5 tab 结构定为：总览 / B50 / 成绩 / 查歌 / 设置。
- 移除 `src/features/wireframe-data.ts` 单例，改为 Zustand session store + TanStack Query 驱动 provider 选择与请求状态。
- 在 `src/fixtures/sanitized.ts` 补全 Song 列表 fixture，覆盖曲名重复、日文长标题、缺 artist、未知 version 等边界；`FixtureProvider.getSongs()` 返回非空数据。
- 引入 `@tanstack/react-query` + `zustand`，封装 `ScoreService.load` 为 query hook，统一暴露 `data / isLoading / isError / isStale / refetch`。
- 新增 `QueryStateView` 共用组件，统一 loading / error / empty / stale / data 五态。
- 总览、B50、成绩、查歌、设置页全部切换到 TanStack Query hook。
- 成绩页新增筛选栏（难度 / 版本 / 类型 / 排序方式），筛选状态进 Zustand，切 tab 后保留。
- 查歌页新建：搜索框（曲名 / songId）+ 文字列表，M1 不显示封面。
- 设置页新增会话状态显示、Import-Token 获取路径文案；登录成功触发全局刷新。
- 水鱼 `/query/player` 不复验，B50 继续用本地 `buildBest50` + `/player/records`；`docs/api-protocol.md` 回填 `last_verified: 2026-07-12`。
- UI 设计需求清单（`docs/m1-design-brief.md`）改为延后到 M2/M4，不在 M1 阻塞；M1 沿用 M0 功能线框风格。
- 每个任务前后必须 git commit（开工前一次基线 commit，每个任务完成一次 commit），commit message 末附 Agent 标识。

## Impact
- Affected specs: 无（M0 无正式 spec 文档）。
- Affected code:
  - `apps/mobile/package.json`（新增 @tanstack/react-query、zustand）
  - `apps/mobile/app/_layout.tsx`（注入 QueryClientProvider）
  - `apps/mobile/app/(tabs)/_layout.tsx`（5 tab）
  - `apps/mobile/app/(tabs)/index.tsx`、`b50.tsx`、`records.tsx`、`settings.tsx`（切换到 TanStack Query）
  - `apps/mobile/app/(tabs)/search.tsx`（新增）
  - `apps/mobile/src/features/wireframe-data.ts`（删除）
  - `apps/mobile/src/fixtures/sanitized.ts`（补 Song fixture）
  - `apps/mobile/src/providers/fixture-provider.ts`（getSongs 返回 fixture songs）
  - `apps/mobile/src/state/session-store.ts`（新增 Zustand store）
  - `apps/mobile/src/state/query-client.ts`（新增 QueryClient 工厂）
  - `apps/mobile/src/hooks/use-score-snapshot.ts`（新增）
  - `apps/mobile/src/hooks/use-songs.ts`（新增）
  - `apps/mobile/src/components/QueryStateView.tsx`（新增）
  - `apps/mobile/src/components/`（按需抽取 Card / PrimaryButton 等最小共用组件）
  - `docs/api-protocol.md`（回填 last_verified）
  - `docs/development-readiness.md`（第 2.C 节 UI 设计输入标记延后）
  - `TODO.md`（M1 事前准备清单标记为已开工 / 已交付）
  - `changelog/2026-07-12_m1-score-mvp.md`（新增）
  - `apps/mobile/tests/`（新增筛选、provider 切换、会话恢复、QueryStateView 测试）

## ADDED Requirements

### Requirement: 5 Tab 结构
系统 SHALL 提供 5 个底部 tab：总览、B50、成绩、查歌、设置。总览同时承担"首页+玩家概览"，不拆分。查歌为独立 tab。

#### Scenario: 启动 App
- **WHEN** 用户启动 App
- **THEN** 底部显示 5 个 tab：总览 / B50 / 成绩 / 查歌 / 设置
- **AND** 默认进入总览页

### Requirement: 查歌页
系统 SHALL 提供按曲名或 songId 搜索的歌曲列表页。M1 范围仅曲名 + songId 模糊匹配；复合筛选延后到 M2。

#### Scenario: 搜索歌曲
- **WHEN** 用户在查歌页输入关键词
- **THEN** 列表按曲名或 songId 模糊匹配过滤
- **AND** 列表项显示标题、artist、版本、难度列表

#### Scenario: 空关键词
- **WHEN** 搜索框为空
- **THEN** 列表显示全部歌曲

### Requirement: 会话驱动 Provider 选择
系统 SHALL 用 Zustand store 保存当前 ProviderSession 与对应的 ScoreProvider 实例。未登录时回落到 FixtureProvider；登录成功后切换到 DivingFishProvider 并触发刷新。

#### Scenario: 未登录
- **WHEN** App 启动且无保存的 session
- **THEN** provider 为 FixtureProvider
- **AND** 数据来源标签为"脱敏测试数据"

#### Scenario: 登录成功
- **WHEN** 用户在设置页登录水鱼成功
- **THEN** session store 切换到 DivingFishProvider
- **AND** 触发 TanStack Query 重新拉取
- **AND** 数据来源标签为"水鱼查分器"

#### Scenario: 会话恢复
- **WHEN** App 启动且 SecureStore 有保存的 session
- **THEN** session store 自动恢复该 session
- **AND** provider 为 DivingFishProvider

### Requirement: 统一请求状态展示
系统 SHALL 用 `QueryStateView` 组件统一处理 loading / error / empty / stale / data 五态。所有列表/详情页共用此组件。

#### Scenario: loading
- **WHEN** 数据加载中
- **THEN** 显示居中 ActivityIndicator

#### Scenario: error
- **WHEN** 请求失败且无缓存
- **THEN** 显示居中错误文案 + 重试按钮

#### Scenario: empty
- **WHEN** 请求成功但数据为空
- **THEN** 显示居中"暂无数据"文案

#### Scenario: stale
- **WHEN** 请求失败但有缓存
- **THEN** 显示顶部黄色横幅"数据可能过期，下拉刷新" + 旧数据

### Requirement: 成绩页筛选栏
系统 SHALL 在成绩页顶部提供筛选栏（难度 / 版本 / 类型 / 排序方式）。筛选状态保存在 Zustand，切 tab 后返回保留。

#### Scenario: 应用筛选
- **WHEN** 用户选择难度=master
- **THEN** 列表只显示 master 难度成绩
- **AND** 切换到 B50 再回来，筛选保留

### Requirement: TanStack Query 封装
系统 SHALL 用 TanStack Query 封装 `ScoreService.load`，暴露 `data / isLoading / isError / isStale / refetch`。

#### Scenario: 首次加载
- **WHEN** 页面挂载
- **THEN** isLoading 为 true，data 为 undefined
- **AND** 加载完成后 data 为 ScoreSnapshot

#### Scenario: 手动刷新
- **WHEN** 用户点击刷新按钮
- **THEN** 触发 refetch
- **AND** 失败时 isStale 为 true 但 data 保留旧值

### Requirement: Git Commit 规约
每个任务前后必须 git commit。开工前一次基线 commit；每个任务完成一次 feat/refactor/test/docs/chore commit。commit message 末附 Agent 标识。

#### Scenario: 任务开始
- **WHEN** 开始 Task 0
- **THEN** 先 git commit 一次基线（chore: M1 baseline）

#### Scenario: 任务完成
- **WHEN** 任意 Task 完成
- **THEN** git commit 一次，message 含对应前缀与 Agent 标识

## MODIFIED Requirements

### Requirement: 设置页
M0 设置页已支持账密登录、Import-Token、清除数据。M1 新增：当前会话状态显示（已登录/未登录/会话过期）、Import-Token 获取路径文案、登录成功后触发全局刷新。

### Requirement: FixtureProvider
M0 的 `FixtureProvider.getSongs()` 返回 `[]`。M1 修改为返回脱敏 Song fixture 列表，覆盖曲名重复、日文长标题、缺 artist、未知 version 边界。

## REMOVED Requirements

### Requirement: wireframe-data 单例
**Reason**: `src/features/wireframe-data.ts` 用进程内单例注入 FixtureProvider，无法支撑登录后切换 provider。
**Migration**: 删除该文件，所有页面改用 TanStack Query hook 消费 `useScoreSnapshot()`。
