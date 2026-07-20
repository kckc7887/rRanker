# 加固 SYNC 入库规范化并记录上游 Sync Play 丢失

## 改动原因

上一轮已实现 SYNC 标签与筛选，但实机仍看不到 SYNC，严格筛选也为空。排查后确认：应用在 `fs=sync` 时逻辑正确；好友码所用 score-hub 将机台 `syncStatus=5`（Sync Play）映射为 `null`，合并/导出也不保留 `sync`，导致本地与上传到水鱼/落雪的数据里根本没有 SYNC。

## 具体实现

1. **入库规范化**（`schemas.ts` / `score-hub-sync-map.ts`）
   - 水鱼、落雪、score-hub 映射统一走 `normalizeMaimaiFs/Fc`。
   - 空串与空白视为 `null`；`fdx`/`fdxp` 转为 `fsd`/`fsdp`；`SYNC` 大小写规范为 `sync`。
   - 未知枚举仍保留在 `rawFs`/`rawFc`，但正式 `fs`/`fc` 不再留下无法展示的脏值。

2. **展示**（`ScoreVisuals` / 成绩图 HTML）
   - 状态徽章先规范化再渲染；成绩图 fs 标签只输出已知枚举（含 FDX 别名）。

## 期望输出

- 数据源若带有 `fs=sync`（例如水鱼微信同步保留 Sync Play），最佳页/成绩页显示 SYNC 标签，成绩图严格 SYNC 筛出仅 Sync Play 的谱面。
- 经当前 score-hub 好友码链路写入、且从未带有 sync 的数据，仍无法显示 SYNC（需上游修复或换数据源后重新拉成绩）。

## 实际输出

相关 vitest（schemas、score-hub-upload-map、maimai-filters、best-image-custom、best-image-html）已通过。
