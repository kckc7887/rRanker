# rRanker TODO

## 当前优先级：先实现舞萌 DX 查分器基础功能

### 目标
先把可稳定交付给玩家的查分器基础能力做完整，作为后续推荐、分析和娱乐功能的数据底座。

### 基础功能清单
- B50：展示 B35 + B15；B35 为过往版本 Rating 最高的 35 首谱面，B15 为当前版本 Rating 最高的 15 首谱面。
- DXRating：汇总 B50 的全部单曲 Rating，展示为五位整数。
- 查歌：支持按曲名检索；后续接入可用别名库后支持别名检索。

### 依赖/风险
- 稳定成绩来源与曲库来源。
- 单曲 Rating 计算逻辑需要和主流查分器结果对齐。
- 别名库仍在寻找，查歌功能先按官方曲名可用。

## 差异化方向：按玩家群体类型推荐谱面

### 目标
不要只做同质化查分器。后续希望根据玩家的使用动机和偏好推荐谱面，让应用既能服务“喜欢听歌的人”，也能服务“想提升成绩的人”。

### 用户价值
- 喜欢听歌的玩家：拿到更符合音乐口味、热度或作者偏好的谱面推荐。
- 想提升的玩家：拿到更贴近当前短板、适合练习的谱面推荐。
- 混合型玩家：在“好听/热门/风格合适”和“练习价值”之间取得平衡。

### 实现思路
- 听歌偏好推荐：
  - 根据歌名在曲目平台、视频平台或社区中的热度做参考。
  - 分析歌曲风格、作者、系列、BPM、曲风标签等信息，推断玩家可能喜欢的曲目。
  - 后续可结合收藏、游玩频率、主动搜索记录做个性化排序。
- 提升导向推荐：
  - 解析每张谱面的配置和难点，例如键型、交互、纵连、扫键、Slide、Touch、耐力、局部爆发、节奏复杂度等。
  - 结合玩家成绩数据，比较同等难度/拟合定数下不同难点类型的表现差异，识别弱势项。
  - 推荐“当前有练习价值但不过度越级”的谱面，并解释推荐原因。
- 混合推荐：
  - 将音乐偏好分、练习价值分、拟合定数适配度、玩家历史表现合并排序。
  - 允许用户选择推荐模式，例如“听歌优先”“上分优先”“补短板优先”“随机探索”。

### 依赖/风险
- 听歌偏好需要外部热度数据、曲风/作者元数据或可维护的标签体系。
- 提升导向需要谱面结构解析程序，工作量大，且需要验证分析结果是否符合玩家体感。
- 弱势分析依赖足够完整、可信的玩家成绩历史。
- 拟合定数属于社区计算结果，需要明确来源、更新频率和许可边界。
- 推荐解释必须透明，否则玩家很难信任推荐结果。

### 当前优先级
P2。先完成查分器基础功能，再实现本节推荐能力；仍排在爬虫与上传之前。

### 暂缓原因
该功能仍依赖音乐/热度/标签、谱面结构和可信成绩历史，因此等查分器底座稳定后实施；但按最新路线，它不再因为爬虫未完成而继续延期。

## 可补充的娱乐/实用功能池

- 随机 N 首谱面。
- 根据拟合定数推荐练习谱面。
- 谱面预览。
- 牌子进度与容错计算。
- 收藏夹与练习清单。

## M1 双端查分 MVP 事前准备（2026-07-12）

### 用户原始意图

M0 数据底座已交付，开始为 M1 双端查分 MVP 做开工前准备：核对页面清单、fixture 缺口、provider 切换架构、状态管理引入时机、水鱼端点补验范围、UI 视觉输入和测试覆盖，把所有需要在开工前确认的决策点固定下来，避免 M1 实现过程中反复返工。

### 目标

在不写 M1 业务代码的前提下，产出一份可执行的 M1 开工清单，使后续实现能按部就班完成 M1 的全部验收项：iPhone Expo Go 与 Android Emulator 使用同一 fixture 时，数值、排序、筛选和页面状态一致。

### M1 验收项

- 创建 Expo/React Native 工程（M0 已完成）。
- 同步实现首页、玩家概览、B50、成绩列表、查歌和设置页。
- iPhone 17 使用 Expo Go；Android 使用 Windows Android Emulator。
- 先用 fixture 打通完整 UI，再接经过验证的水鱼只读接口。
- 本地业务层写成普通 TypeScript 模块，不启动 localhost server。
- 验收：iOS 与 Android 使用同一 fixture 时，数值、排序、筛选和页面状态一致。

### 现状差距盘点

| 范围 | M0 现状 | M1 要求 | 差距 |
| --- | --- | --- | --- |
| 页面清单 | 总览 / B50 / 成绩 / 设置（4 个 tab） | 5 tab：总览 / B50 / 成绩 / 查歌 / 设置（2026-07-12 已确认） | 缺查歌 tab；总览同时承担"首页+玩家概览"，不拆分 |
| fixture 数据 | 54 条 ScoreRecord + 1 条未知枚举样例 | 需支撑查歌、筛选、排序展示 | 缺 Song 列表 fixture（`FixtureProvider.getSongs()` 返回 `[]`）；缺封面 ID 样例 |
| provider 注入 | `wireframe-data.ts` 单例注入 FixtureProvider | 登录后切换到 DivingFishProvider，未登录回退 fixture | 缺会话驱动 provider 选择层；设置页已能登录但未把会话注入其他页面 |
| 状态管理 | `useEffect` + `useState` 本地状态 | TanStack Query + Zustand（2026-07-12 已确认 M1 立即引入） | 未引入；开工时一次性接入 |
| 水鱼端点 | `/music_data`、`/chart_stats`、`/player/records`、`/login`、`/player/profile` 已接入或复验 | M1 验收要求"接经过验证的水鱼只读接口" | `/query/player` 不复验，B50 用本地 `buildBest50` + `/player/records`（2026-07-12 已确认）；`docs/api-protocol.md` 仍需回填 `last_verified` |
| 状态展示 | 各页只处理 loading 与完成 | 验收要求"页面状态一致" | 缺统一的 error / empty / stale / offline 状态展示 |
| 测试覆盖 | 3 文件 10 项（domain / schema / service） | M1 验收要求"数值、排序、筛选和页面状态一致" | 缺查歌筛选测试、provider 切换测试、会话恢复测试；组件测试未启动 |
| 双端运行时 | Android 静态 bundle 通过；iPhone Expo Go 与 Android Emulator 待用户手动验收 | M1 验收要求双端打开同一页面 | 用户需在 M1 实现完成后跑 `docs/mobile-testing.md` 第 4 节 M1 验收清单 |
| UI 设计输入 | M0 功能线框，无设计规范 | development-readiness.md 第 2.C 节要求开工前确认 | 2026-07-12 用户要求先产出"M1 设计需求清单"再开工；清单见 `docs/m1-design-brief.md` |

### 实现思路（开工时按此顺序）

1. **页面结构定型**：5 tab = 总览 / B50 / 成绩 / 查歌 / 设置（2026-07-12 已确认）；总览同时承担"首页+玩家概览"，不拆分；查歌为独立 tab。
2. **UI 设计输入落地**：用户先审阅 `docs/m1-design-brief.md`，逐项确认或修改；确认后才进入步骤 3。
3. **fixture 补全**：在 `apps/mobile/src/fixtures/sanitized.ts` 补一份与现有 ScoreRecord 对齐的最小 Song 列表（含 title、artist、version、cover id 样例），覆盖曲名重复、日文长标题、缺 artist、未知 version 等边界。
4. **会话与 provider 选择层**：用 Zustand 建立 session store，保存当前 `ProviderSession` 与对应的 `ScoreProvider` 实例；未登录时回落到 FixtureProvider；登录成功后切换到 DivingFishProvider 并触发刷新。
5. **请求状态层**：引入 TanStack Query 封装 `ScoreService.load`，统一暴露 `data / isLoading / isError / isStale / refetch`，供所有页面消费。
6. **页面接入**：把总览、B50、成绩、查歌、设置页从 `wireframeSnapshotPromise` 切换到 TanStack Query 的 hook；查歌页基于 `getSongs()` + Zustand 筛选状态。
7. **状态展示统一**：抽一个最小的 `QueryStateView`（loading / error / empty / stale / data），所有页面共用。
8. **水鱼端点文档回填**：`/query/player` 不复验，B50 用本地 `buildBest50`；把 `/login`、`/player/profile`、`/player/records`、`/music_data`、`/chart_stats` 的 `last_verified` 回填到 `docs/api-protocol.md`。
9. **测试补全**：补查歌筛选、provider 切换、会话恢复的单元/契约测试；若引入组件测试，用 React Native Testing Library 覆盖 loading/error/empty/stale 四态。
10. **双端验收**：实现完成后由用户在 iPhone Expo Go 与 Android Emulator 跑 `docs/mobile-testing.md` 第 4 节 M1 验收清单，确认数值、排序、筛选、页面状态一致。

### 依赖/风险

- TanStack Query + Zustand 在 M1 一次性引入（2026-07-12 已确认），代码量与学习成本上升；好处是 M2 不必重构状态层。
- 水鱼 `/query/player` 不复验（2026-07-12 已确认），B50 完全依赖本地 `buildBest50` + `/player/records`；需在双端验收时确认与水鱼网页结果一致，若不一致再回头复验。
- Import-Token 来源：App 不生成 Import-Token，用户需自行从水鱼网页获取；M1 文案需明确说明获取路径。
- 会话过期降级：JWT 失效后是否自动回落到 fixture 或缓存，还是要求重新登录；影响 UX 与状态机复杂度。
- 筛选状态跨页面保持：用户在成绩页筛选后切到 B50 再回来，筛选是否保留；影响 Zustand store 边界。
- UI 设计输入：用户要求先产出 `docs/m1-design-brief.md` 设计需求清单，逐项确认后才开工；清单是 M1 开工的硬门禁。
- Expo Go 限制：TanStack Query、Zustand 是纯 JS，Expo Go 支持；引入时核对 SDK 54 文档。

### 当前优先级

P0。M0 已交付，M1 已于 2026-07-12 开工，事前准备完成并进入实现阶段。

### 暂缓原因

无。M1 是当前阶段，不暂缓。仅"最终视觉"、"TestFlight/正式签名"、"Android 真机验收"、"落雪接入"延后。
