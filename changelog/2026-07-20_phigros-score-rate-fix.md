# 修复 Phigros 评价按 score 计算

## 改动原因

评价等级应按游戏 score 划分，而非准确率；此前误用 `rawAcc` 阈值导致标签与游戏内不一致。

## 具体实现

- 将 `phigrosAccToRate` 替换为 `phigrosScoreToRate(score, fc)`，对齐 phi-plugin `fCompute.rate`：
  - 1,000,000 → φ
  - FC（未满分）→ V（UI 蓝底）
  - ≥960,000 → V（白底）
  - ≥920,000 → S；≥880,000 → A；≥820,000 → B；≥700,000 → C；>0 → F
- `phigrosEntryToScoreRecord` 与 `PhigrosScoreCard` 均改用 score 计算
- 移除不存在的 D 档

## 期望输出

成绩卡评价与游戏内 score 评级一致；FC 未满分显示蓝色 V。

## 实际输出

- 单元测试覆盖 score/FC 各档位；269 项测试通过
