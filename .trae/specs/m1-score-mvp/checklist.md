# M1 双端查分 MVP Checklist

## 页面结构
- [x] app/(tabs)/_layout.tsx 包含 5 个 tab：总览 / B50 / 成绩 / 查歌 / 设置
- [x] app/(tabs)/search.tsx 存在并可正常导航
- [x] 启动后默认进入总览页

## 状态管理
- [x] package.json 含 @tanstack/react-query 和 zustand
- [x] app/_layout.tsx 注入 QueryClientProvider
- [x] src/state/session-store.ts 存在并导出 session + provider + setSession/clearSession
- [x] 未登录时 provider 为 FixtureProvider
- [x] 登录成功后 provider 切换为 DivingFishProvider
- [x] App 启动从 SecureStore 恢复 session（在设置页或根 layout 触发）

## fixture
- [x] src/fixtures/sanitized.ts 含 fixtureSongs
- [x] FixtureProvider.getSongs() 返回非空数组
- [x] fixture 覆盖曲名重复、日文长标题、缺 artist、未知 version

## hooks
- [x] src/hooks/use-score-snapshot.ts 存在并暴露 data/isLoading/isError/isStale/refetch
- [x] src/hooks/use-songs.ts 存在
- [x] session 切换时 query 自动重新拉取（queryKey 含 session 标识）

## 共用组件
- [x] src/components/QueryStateView.tsx 支持 loading/error/empty/stale/data 五态
- [x] 总览/B50/成绩/查歌页使用 QueryStateView

## 页面接入
- [x] 总览页使用 useScoreSnapshot，有刷新按钮
- [x] B50 页使用 useScoreSnapshot
- [x] 成绩页使用 useScoreSnapshot，有筛选栏（难度/版本/类型/排序）
- [x] 成绩页筛选状态保存在 Zustand（src/state/records-filter.ts），切 tab 后保留
- [x] 查歌页有搜索框（曲名/songId）+ 文字列表
- [x] 查歌页空关键词时显示全部歌曲
- [x] 设置页显示当前会话状态
- [x] 设置页有 Import-Token 获取路径文案
- [x] 设置页登录成功触发 queryClient.invalidateQueries
- [x] src/features/wireframe-data.ts 已删除
- [x] 无页面再引用 wireframeSnapshotPromise

## 水鱼端点文档
- [x] docs/api-protocol.md 各端点标注 last_verified: 2026-07-12
- [x] /query/player 标注为"不复验，用本地 buildBest50"
- [x] docs/development-readiness.md 第 2.C 节标注 UI 设计输入延后

## 测试
- [x] tests/ 含查歌筛选测试（曲名/songId 模糊匹配、空关键词）
- [x] tests/ 含 provider 切换测试（未登录/登录/会话恢复）
- [x] tests/ 含 QueryStateView 五态测试（若可行）
- [x] npm test 全过
- [x] npm run typecheck 全过
- [x] npm run lint 全过

## git
- [x] Task 0 有基线 commit
- [x] 每个任务完成有对应 commit
- [x] commit message 含 Agent 标识

## 文档与收尾
- [x] changelog/2026-07-12_m1-score-mvp.md 已写
- [x] TODO.md M1 事前准备清单标记"已交付，待双端验收"
- [x] 提示用户跑 docs/mobile-testing.md 第 4 节 M1 验收清单

## 验证结果

- **通过项数 / 总项数**：43 / 43
- **失败项列表**：无
- **npm test 最终结果**：6 文件 25 项全过（exit code 0；耗时 463ms）
  - tests/rating.test.ts（5 项）
  - tests/score-service.test.ts（2 项）
  - tests/search-filter.test.ts（5 项）
  - tests/schemas.test.ts（3 项）
  - tests/records-filter.test.ts（6 项）
  - tests/session-store.test.ts（4 项）
  - 注：tests/query-state-view.test.tsx 存在但 `describe.skip`，因 vitest 当前为 node 环境无法直接渲染 React Native 组件；测试文件已含 5 态断言，待后续引入 RN 测试 preset 后启用，符合 checklist "若可行" 的限定。
- **npm run typecheck 最终结果**：通过（exit code 0，无错误输出）
- **npm run lint 最终结果**：通过（exit code 0，无错误输出）
- **git 基线与 commit 链**：基线 `e6e6597`，11 个 commit 链（e6e6597 → 688cf9a → 7c32a17 → 8395b43 → 89013b6 → e358202 → 04d75e3 → 0b99ab7 → 0142048 → b38aec4 → 70cdbff），每条 commit message 末尾均含 `Agent: Trae GLM-5.2` 标识。
