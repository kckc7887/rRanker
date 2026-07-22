# Phigros XING 标题改为顶层标签

## 改动原因

XING 是与 BestN 同级的顶层分区标签，标题应为 `XING-GOODN` / `XING-MISSN`，不应写成 `XING Best N`。

## 具体实现

1. `phigrosXingLabel` 文案改为 `XING-GOOD` / `XING-MISS`。
2. `buildCustomPhigrosSectionTitle`：开启 XING 且无难度/评价时直接 `${xing}${count}`；有难度/评价时仍附在其后，不再插入 `Best`。

## 期望输出

- 仅 XING：分隔线为 `XING-GOOD3` / `XING-MISS3`。
- 不再出现 `XING-Good Best3` 一类标题。

## 实际输出

- Vitest：`phigros-best-image` XING 标题断言已更新并通过。
