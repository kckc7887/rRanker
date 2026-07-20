# Phigros 成绩卡 Score 流动渐变与白 V 样式

## 改动原因

白 V 标签需与其它档位统一为深灰底白字；Phi / FC 的 Score 需参照舞萌成绩卡增加流动渐变效果。

## 具体实现

- 白 V 标签：`#4B5563` 底 + 白字，去掉白底描边；FC 蓝 V 保持蓝色底
- 新增 `PhigrosScoreValue` / `FlowingGradientText`：
  - φ（满分）：金 + 彩点缀流动渐变，周期 1800ms
  - FC（未满分）：蓝绿流动渐变，周期 1400ms（对齐舞萌 FC+ 节奏）
  - 其余：普通文字色
- 动画使用 `MaskedView` + `useCachedTabActive`，与 `ScoreVisuals` 一致

## 期望输出

满分 Score 金彩流动，FC Score 蓝绿流动，白 V 为深灰胶囊标签。

## 实际输出

- `PhigrosScoreCard` 已按上述实现
