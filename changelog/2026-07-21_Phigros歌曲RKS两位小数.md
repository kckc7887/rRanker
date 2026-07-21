# Phigros 歌曲 RKS 始终两位小数

## 改动原因

歌曲成绩 RKS 原先整数时显示一位小数（如 `15.0`），与常见两位小数习惯不一致；需统一为两位，且不影响谱面定数与玩家总 RKS。

## 具体实现

1. 新增 `formatPhigrosSongRks`，固定 `toFixed(2)`
2. `PhigrosScoreCard`（成绩页 / Best 列表）与 `PhigrosSongDetail` 统一改用该函数
3. 谱面定数仍 `toFixed(1)`；玩家总 RKS 仍四位小数，未改

## 期望输出

- 单曲 RKS 始终如 `15.00`、`14.37`
- 定数标签与总览玩家 RKS 显示不变

## 实际输出

- 成绩卡与歌曲详情的歌曲 RKS 均固定两位小数
