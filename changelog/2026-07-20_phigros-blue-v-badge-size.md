# 修复 FC 蓝 V 标签偏大与描边空隙

## 改动原因

蓝 V 使用白底 + `borderWidth` 描边，比其它评价标签多出一圈边框，且在部分平台上描边与背景之间可见空隙。

## 具体实现

- 改为与 S 标签同结构：浅蓝底 `#E0F2FE` + 蓝字 `#0EA5E9`，去掉描边
- `rateText` 增加 `includeFontPadding: false` 统一 Android 行高

## 期望输出

蓝 V 与白 V、S 等标签尺寸一致，无描边缝隙。

## 实际输出

- 已更新 `PhigrosScoreCard` 的 `RateBadge`
