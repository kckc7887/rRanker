# Phigros UI 标签与成绩卡片调整

## 改动原因

云存档同步已正常，需统一数据状态文案、总览玩家信息展示，并优化成绩页歌曲卡片布局与评价标签样式。

## 具体实现

1. **数据状态文案**
   - 成绩来源 `Phigros 云存档` → `TapTap云存档`（`use-game-data`、`phigros-score-provider`、成绩页回退文案）
   - 曲库来源 `Phigros OSS` → `Phigros{版本号}`（`phigros-catalog-provider`，总览与成绩页通过 `catalogSource` 展示）

2. **总览玩家信息**
   - `formatBestSectionMeta`：`phi3` 显示为 `Phi3`（不再 `PHI3`），`b27` 显示为 `B27`
   - 去掉 `均定`、`均` 字样，改为 `Phi3 15.67 · B27 16.07` 格式

3. **成绩卡片 `PhigrosScoreCard`**
   - 布局：曲名 → 大号 Score → 左侧第三行标签（难度 + 评价）
   - 评价等级 F/D/C/B/A/S/V/φ，新增 `phigrosAccToRate` 统一映射
   - S 紫粉色、V 白底（FC 时蓝）、φ 金色；Score 字号 16→24

4. **成绩页** 增加曲库数据状态展示

## 期望输出

- 总览/成绩/曲库页数据状态显示 `TapTap云存档` 与 `Phigros3.x.x`
- 玩家卡片 meta 为 `Phi3 x.xx · B27 x.xx`
- 成绩卡片第三行左侧显示完整评价标签，Score 更醒目

## 实际输出

- 代码已按上述实现；单元测试覆盖 `phigrosAccToRate` 阈值
