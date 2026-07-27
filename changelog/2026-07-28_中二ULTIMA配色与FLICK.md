# 中二 ULTIMA 配色与物量 FLICK 调整

## 改动原因

ULTIMA 难度卡误用红底主题；非 MASTER/ULTIMA 谱面不应展示 FLICK；等级与定数相对难度标签偏上，需下移贴近舞萌。

## 具体实现

- ULTIMA 卡片视觉改为灰黑主体 `#17171A` + 浅红底 `#ECECED`，描边红点缀 `#E83A58`；浅色按钮用灰黑，深色按钮用红色以保证可读。
- 物量表仅在 MASTER（3）与 ULTIMA（4）显示 FLICK 列。
- 难度卡表头改为 `alignItems: 'flex-start'`，等级块 `paddingTop: 10` 下移。

## 期望输出

ULTIMA 卡呈黑灰底红边点缀；BASIC 等无 FLICK；等级/定数略低于难度标签顶部对齐线。

## 实际输出

已按上项调整，并补充 BASIC 不显示 FLICK 的单测。
