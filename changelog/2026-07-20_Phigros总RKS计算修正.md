# Phigros 总 RKS 计算修正

## 改动原因

总 RKS 计算与 astrbot 插件不一致：
1. Phi3 误按「满分且 acc=100、定数排序」选取，实际应为 **acc≥100 按 RKS 取前三**（与 PHI 评级无关）
2. Phi3 贡献误用定数之和，应为 **RKS 之和**
3. 总 RKS 公式应为 `(Σ Phi3 RKS + Σ Best27 RKS) / 30`，同一谱面可重复计入
4. 展示需精确到小数点后 4 位；Phi3/B27 贡献展示用组内平均 RKS

## 具体实现

1. **`src/domain/phigros.ts`**
   - 新增 `selectPhi3()`、`roundRks()`、`sumPhi3Rks()`
   - `computeB30()`：Phi3/B27 均累加 RKS；返回 `best27RksSum`、`phi3RksSum`、`best27AvgRks`、`phi3AvgRks`
   - 推分二分法同步改用 Phi3 RKS 求和
   - 单谱 RKS 计算保留全精度，不再提前 round 到 2 位

2. **`src/domain/game-profile.ts`** — Phigros `ratingDigits: 4`

3. **`src/hooks/use-game-data.ts`** — 总览 RKS 显示 `toFixed(4)`；query version 6

4. **`tests/phigros-save.test.ts`** — 覆盖 Phi3 选取、重复计分、/30 公式

## 期望输出

- 总 RKS 与游戏/astrbot 一致（4 位小数）
- Phi3 为 acc≥100 的 RKS 前三，非定数前三

## 实际输出

- `npx vitest run tests/phigros-save.test.ts`：7/7 通过
- `npx vitest run`：全部通过
- `npx tsc --noEmit` / `eslint`：通过
