# Phigros RKS 算法对齐官方 wiki

## 改动原因

总 RKS 与游戏内不一致（如约 15.x vs 16.16）。对照官方说明，此前实现存在：

1. **Phi3 选取错误**：按 `score=1000000`（AP）选谱，应为 **acc=100%** 按 **谱面定数** 取前三；AP 但 acc<100% 不应进入 Phi3
2. **成绩定数阈值错误**：低于 **70%** 准确率应为 0，误用 55%
3. **总览副文案误导**：将 Phi3/B27 的 **RKS 求和** 展示在卡片下方，易被误当作「总和÷30」

## 具体实现

1. **`src/domain/phigros.ts`**
   - `calculateRks`：acc<70% 返回 0；公式 `((acc-55)/45)² × 谱面定数`（acc 为存档百分数）
   - `selectPhi3`：`acc>=100%`，按谱面定数降序前三；贡献仍为 **谱面定数之和**
   - `computeB30`：总 RKS = `(Σ Best27 成绩定数 + Σ Phi3 谱面定数) / 30`；推分二分法同步

2. **`src/hooks/use-game-data.ts`**
   - 总览 RKS 改为 `computeB30().rks`（4 位小数）

3. **`app/(tabs)/(overview)/index.tsx`**
   - Phigros 卡片副文案改为组内均值：`B27 均 xx · PHI3 均定 xx`

## 期望输出

- 参考存档 `full_save.json` 计算 RKS ≈ **16.1266**，与 `summary.rankingScore` 一致
- 用户同步后总览 RKS 与游戏内一致（4 位小数）

## 实际输出

- 单元测试 8 项通过
- Python 对照：`wiki formula 16.1266 summary 16.1266`
