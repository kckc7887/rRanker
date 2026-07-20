# Phigros 总 RKS 与云存档对齐

## 改动原因

用户 RKS 约 16.16，程序算出约 15.6。对照 phiTool `parse_b27` 与云存档 `summary.rankingScore` 发现：
1. 总览 RKS 用了本地 `computeB30().rks`，未用云存档 summary 权威值
2. Phi3 误用 `acc≥100` 选曲，漏掉 `score=1000000` 但 acc<100 的 AP 谱面
3. Phi3 贡献误用 RKS 求和；phiTool/游戏口径为 **定数之和**（AP 时 RKS<定数，少算约 0.5+）

## 具体实现

1. **`computeB30`** — Phi3：`score=1000000` 按定数降序取 3；总 RKS = `(Σ Best27 RKS + Σ Phi3 定数) / 30`
2. **`useGameData`** — 总览 RKS 改读 `player.rating`（来自 `summary.rankingScore`），4 位小数
3. **测试** — 覆盖 AP 谱面 Phi3 定数贡献、与 acc≥100 选曲差异

## 期望输出

- 总览 RKS 与游戏/云存档 summary 一致（如 16.1266）
- 本地 B30 公式与 phiTool 一致

## 实际输出

- `npx vitest run`：260/260 通过
- `tsc` / `eslint`：通过
