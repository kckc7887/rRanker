# Phigros 列表与详情加入 XING 标签

## 改动原因

XING（相对 100% 仅少 1 Good / 1 Miss 的 Acc）此前仅用于成绩图自定义筛选。需要在最佳页、成绩页（含筛选）和歌曲详情难度卡上展示橙色 XING-GOOD / XING-MISS 标签，并让成绩筛选可与评价叠加。

## 具体实现

1. `phigros-xing.ts`：新增 `resolvePhigrosXingKind`、`matchesPhigrosXingFilter`（XING-MISS 排除 FC）；成绩图自定义改用共享 matcher。
2. 新增 `PhigrosXingBadge`（橙底 `#FFF7ED` / 字 `#EA580C`），挂到 `PhigrosScoreCard` 与 `PhigrosSongDetail` 难度卡。
3. 最佳页 / 成绩页用曲库 `buildPhigrosNoteTotalByKey` 传入物量以判定标签。
4. 成绩筛选 Zustand + `PhigrosFilterBar` 增加独立 XING 行（关闭 / Good / Miss），可与评价叠加。

## 期望输出

- 命中 Acc 的成绩在最佳/成绩卡与详情难度卡显示对应橙色 XING 标签；FC 曲不显示 XING-MISS。
- 成绩页可单独筛 XING-GOOD/MISS，且可与 φ/FC/V 等评价叠加。
- 无物量谱面不显示标签、筛选不命中。

## 实际输出

- Vitest：`phigros-xing`、`phigros-best-image` 相关用例通过。
