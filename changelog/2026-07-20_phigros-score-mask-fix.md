# 修复 Phigros Score 流动字不显示

## 改动原因

`MaskedView` 子视图缺少明确宽高，遮罩高度不足，导致 Phi/FC 的 Score 渐变字不可见。

## 具体实现

- 先用隐藏 `Text` 测量分数宽度，再渲染 `MaskedView`
- 渐变层显式设置 `width` / `height`（32px 行高）
- 分数文字补充 `lineHeight`、`includeFontPadding: false`

## 期望输出

Phi/FC 的 Score 正常显示流动渐变，普通分数仍为纯色文字。

## 实际输出

- 已按上述方式修复 `PhigrosScoreCard`
