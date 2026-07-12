# M1 双端查分 MVP Checklist

## 页面结构
- [ ] app/(tabs)/_layout.tsx 包含 5 个 tab：总览 / B50 / 成绩 / 查歌 / 设置
- [ ] app/(tabs)/search.tsx 存在并可正常导航
- [ ] 启动后默认进入总览页

## 状态管理
- [ ] package.json 含 @tanstack/react-query 和 zustand
- [ ] app/_layout.tsx 注入 QueryClientProvider
- [ ] src/state/session-store.ts 存在并导出 session + provider + setSession/clearSession
- [ ] 未登录时 provider 为 FixtureProvider
- [ ] 登录成功后 provider 切换为 DivingFishProvider
- [ ] App 启动从 SecureStore 恢复 session（在设置页或根 layout 触发）

## fixture
- [ ] src/fixtures/sanitized.ts 含 fixtureSongs
- [ ] FixtureProvider.getSongs() 返回非空数组
- [ ] fixture 覆盖曲名重复、日文长标题、缺 artist、未知 version

## hooks
- [ ] src/hooks/use-score-snapshot.ts 存在并暴露 data/isLoading/isError/isStale/refetch
- [ ] src/hooks/use-songs.ts 存在
- [ ] session 切换时 query 自动重新拉取（queryKey 含 session 标识）

## 共用组件
- [ ] src/components/QueryStateView.tsx 支持 loading/error/empty/stale/data 五态
- [ ] 总览/B50/成绩/查歌页使用 QueryStateView

## 页面接入
- [ ] 总览页使用 useScoreSnapshot，有刷新按钮
- [ ] B50 页使用 useScoreSnapshot
- [ ] 成绩页使用 useScoreSnapshot，有筛选栏（难度/版本/类型/排序）
- [ ] 成绩页筛选状态保存在 Zustand（src/state/records-filter.ts），切 tab 后保留
- [ ] 查歌页有搜索框（曲名/songId）+ 文字列表
- [ ] 查歌页空关键词时显示全部歌曲
- [ ] 设置页显示当前会话状态
- [ ] 设置页有 Import-Token 获取路径文案
- [ ] 设置页登录成功触发 queryClient.invalidateQueries
- [ ] src/features/wireframe-data.ts 已删除
- [ ] 无页面再引用 wireframeSnapshotPromise

## 水鱼端点文档
- [ ] docs/api-protocol.md 各端点标注 last_verified: 2026-07-12
- [ ] /query/player 标注为"不复验，用本地 buildBest50"
- [ ] docs/development-readiness.md 第 2.C 节标注 UI 设计输入延后

## 测试
- [ ] tests/ 含查歌筛选测试（曲名/songId 模糊匹配、空关键词）
- [ ] tests/ 含 provider 切换测试（未登录/登录/会话恢复）
- [ ] tests/ 含 QueryStateView 五态测试（若可行）
- [ ] npm test 全过
- [ ] npm run typecheck 全过
- [ ] npm run lint 全过

## git
- [ ] Task 0 有基线 commit
- [ ] 每个任务完成有对应 commit
- [ ] commit message 含 Agent 标识

## 文档与收尾
- [ ] changelog/2026-07-12_m1-score-mvp.md 已写
- [ ] TODO.md M1 事前准备清单标记"已交付，待双端验收"
- [ ] 提示用户跑 docs/mobile-testing.md 第 4 节 M1 验收清单
