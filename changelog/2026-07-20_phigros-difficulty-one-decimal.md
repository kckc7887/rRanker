# Phigros 难度标签定数固定一位小数

## 改动原因

难度徽章上的定数应始终显示一位小数（如 `15.0`），与游戏内展示习惯一致。

## 具体实现

- `PhigrosDifficultyBadge` 统一使用 `constant.toFixed(1)`

## 期望输出

成绩卡、曲库列表等处定数均为 `X.X` 格式。

## 实际输出

- 已更新 `PhigrosDifficultyBadge.tsx`
