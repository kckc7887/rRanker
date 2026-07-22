# Phigros 成绩图自定义 XING 标签

## 改动原因

在 Phigros 成绩图「自定义」模式增加 XING 筛选：按谱面物量反推「仅 1 个 Good」或「仅 1 个 Miss」的理论 Acc，与舞萌「寸」不同，Good/Miss 由用户单选。

## 具体实现

1. 新增 `phigros-xing.ts`：`PhigrosXingKind`、`calculatePhigrosXingAcc`、`isPhigrosXingAcc`、`phigrosXingLabel`、`phigrosChartNoteKey`（独立模块，避免成绩图路径加载存档解密依赖）。
2. `phigros-best-image-custom.ts`：筛选字段 `xing`；`buildPhigrosNoteTotalByKey`；构建分区时按物量匹配；标题插入 `XING-Good` / `XING-Miss`。
3. `PhigrosBestImageScreen`：自定义面板增加 XING「关闭 / Good / Miss」单选芯片，并从曲库传入物量表。
4. 单测覆盖理论 Acc 与筛选命中/无物量跳过。

## 期望输出

- 自定义模式可选 XING-Good 或 XING-Miss。
- 命中成绩 Acc 与公式两位小数结果精确相等；无物量谱面不入选。
- 分隔线标题含 `XING-Good` / `XING-Miss` 前缀。

## 实际输出

- Vitest：`phigros-best-image` 12 项通过（含 XING Acc/筛选）。
- Jest：`phigros-best-image-preview` 通过；自定义面板含 XING 关闭/Good/Miss；并 mock `phigrosReadableRootDirectory` 规避 Jest 下 `Paths.document` 不可用。
