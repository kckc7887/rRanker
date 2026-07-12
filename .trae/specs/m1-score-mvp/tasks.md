# Tasks

每个任务前后必须 git commit：开工前一次基线 commit（Task 0），每个任务完成一次 commit（feat/refactor/test/docs/chore 前缀）。commit message 末附 Agent 标识。

- [ ] Task 0: M1 开工基线
  - [ ] SubTask 0.1: 检查工作区状态，把当前已修改的 docs/TODO/changelog/spec 文档一起 git commit（chore: M1 baseline）
  - [ ] SubTask 0.2: 在 TODO.md 把 M1 事前准备清单标记为"已开工"

- [ ] Task 1: 引入依赖与 QueryClient 基础设施
  - [ ] SubTask 1.1: 在 apps/mobile 安装 @tanstack/react-query 和 zustand，核对 Expo SDK 54 兼容版本
  - [ ] SubTask 1.2: 新建 src/state/query-client.ts，导出 QueryClient 实例与默认 staleTime/retry 配置
  - [ ] SubTask 1.3: 在 app/_layout.tsx 注入 QueryClientProvider
  - [ ] SubTask 1.4: 跑 npm run typecheck 与 lint 确认无破坏
  - [ ] SubTask 1.5: git commit（feat: add tanstack query and zustand）

- [ ] Task 2: Zustand session store 与 provider 选择层
  - [ ] SubTask 2.1: 新建 src/state/session-store.ts，保存 ProviderSession 与对应的 ScoreProvider 实例
  - [ ] SubTask 2.2: 未登录时 provider = FixtureProvider；登录/恢复 session 后切换到 DivingFishProvider
  - [ ] SubTask 2.3: 导出 useSession() hook 与 setSession/clearSession 动作
  - [ ] SubTask 2.4: git commit（feat: add session store with provider switching）

- [ ] Task 3: fixture 补全
  - [ ] SubTask 3.1: 在 src/fixtures/sanitized.ts 新增 fixtureSongs 列表，覆盖曲名重复、日文长标题、缺 artist、未知 version 边界
  - [ ] SubTask 3.2: 修改 FixtureProvider.getSongs() 返回 fixtureSongs
  - [ ] SubTask 3.3: 跑 npm test 确认现有测试不破
  - [ ] SubTask 3.4: git commit（feat: add song fixtures）

- [ ] Task 4: TanStack Query hooks
  - [ ] SubTask 4.1: 新建 src/hooks/use-score-snapshot.ts，封装 ScoreService.load，暴露 data/isLoading/isError/isStale/refetch
  - [ ] SubTask 4.2: 新建 src/hooks/use-songs.ts，封装 provider.getSongs()
  - [ ] SubTask 4.3: hook 从 session store 读取 provider，session 切换时通过 queryKey 自动重新拉取
  - [ ] SubTask 4.4: git commit（feat: add tanstack query hooks）

- [ ] Task 5: QueryStateView 共用组件
  - [ ] SubTask 5.1: 新建 src/components/QueryStateView.tsx，支持 loading/error/empty/stale/data 五态
  - [ ] SubTask 5.2: 新建 src/components/Card.tsx 等最小共用组件（按需）
  - [ ] SubTask 5.3: git commit（feat: add query state view）

- [ ] Task 6: 5 tab 结构与查歌页
  - [ ] SubTask 6.1: 在 app/(tabs)/_layout.tsx 新增查歌 tab，5 tab 顺序：总览/B50/成绩/查歌/设置
  - [ ] SubTask 6.2: 新建 app/(tabs)/search.tsx：搜索框（曲名/songId）+ FlatList 文字列表，使用 useSongs + QueryStateView
  - [ ] SubTask 6.3: 跑 typecheck 确认无破坏
  - [ ] SubTask 6.4: git commit（feat: add search tab）

- [ ] Task 7: 总览/B50/成绩/设置页接入 TanStack Query
  - [ ] SubTask 7.1: 总览页切换到 useScoreSnapshot + QueryStateView，新增刷新按钮
  - [ ] SubTask 7.2: B50 页切换到 useScoreSnapshot + QueryStateView
  - [ ] SubTask 7.3: 成绩页切换到 useScoreSnapshot + QueryStateView，新增筛选栏（难度/版本/类型/排序），筛选状态进 Zustand（src/state/records-filter.ts）
  - [ ] SubTask 7.4: 设置页接入 session store，登录成功后调用 queryClient.invalidateQueries；新增会话状态显示与 Import-Token 获取路径文案
  - [ ] SubTask 7.5: 删除 src/features/wireframe-data.ts，确认无页面再引用 wireframeSnapshotPromise
  - [ ] SubTask 7.6: 跑 typecheck / lint / test 全过
  - [ ] SubTask 7.7: git commit（refactor: migrate pages to tanstack query）

- [ ] Task 8: 水鱼端点文档回填
  - [ ] SubTask 8.1: 在 docs/api-protocol.md 为 /login、/player/profile、/player/records、/music_data、/chart_stats 标注 last_verified: 2026-07-12
  - [ ] SubTask 8.2: 标注 /query/player 为"不复验，B50 用本地 buildBest50"
  - [ ] SubTask 8.3: 在 docs/development-readiness.md 第 2.C 节标注 UI 设计输入延后到 M2/M4
  - [ ] SubTask 8.4: git commit（docs: backfill api last_verified and defer ui brief）

- [ ] Task 9: 测试补全
  - [ ] SubTask 9.1: 补查歌筛选测试（曲名/songId 模糊匹配、空关键词）
  - [ ] SubTask 9.2: 补 provider 切换测试（未登录/登录/会话恢复）
  - [ ] SubTask 9.3: 补 QueryStateView 五态组件测试（若 React Native Testing Library 可用）
  - [ ] SubTask 9.4: 跑 npm test / typecheck / lint 全过
  - [ ] SubTask 9.5: git commit（test: add m1 coverage）

- [ ] Task 10: M1 收尾
  - [ ] SubTask 10.1: 写 changelog/2026-07-12_m1-score-mvp.md
  - [ ] SubTask 10.2: 在 TODO.md M1 事前准备清单标记"已交付，待用户双端验收"
  - [ ] SubTask 10.3: git commit（chore: m1 score mvp delivered）
  - [ ] SubTask 10.4: 提示用户在 iPhone Expo Go + Android Emulator 跑 docs/mobile-testing.md 第 4 节 M1 验收清单

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 4] depends on [Task 2] [Task 3]
- [Task 6] depends on [Task 4] [Task 5]
- [Task 7] depends on [Task 4] [Task 5] [Task 6]
- [Task 9] depends on [Task 7]
- [Task 10] depends on [Task 8] [Task 9]
- [Task 3] [Task 5] [Task 8] 可与 [Task 1] [Task 2] 部分并行
