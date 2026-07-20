# 修复 φ 评价标签垂直居中

## 改动原因

希腊字母 φ 在字体中视觉偏下，导致评价胶囊内看起来未垂直居中。

## 具体实现

- `rateBadge` 增加 `alignItems` / `justifyContent` / `minHeight`
- φ 文字单独 `translateY: -1.5` 光学上移，并统一 `lineHeight`

## 期望输出

φ 标签与 S、V 等评价标签视觉居中对齐。

## 实际输出

- 已更新 `PhigrosScoreCard` 的 `RateBadge`
