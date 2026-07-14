# 寸标签对比度与 BlurBadge 形状修正

## 改动原因

玻璃模糊风格重构后出现两个问题：
1. 寸标签（NearMissBadge）从实色绿底白字改为 `NEUTRAL_BLUR` 玻璃模糊后，文字色 `#d1d5db`（浅灰）配半透明灰底，对比度极低看不清。
2. `BlurBadge` 内层填充背景 `borderRadius: 9` 与外层带 `borderWidth: 1` 的边框不匹配（填充应等于外圆角减边框宽度），导致边框与填充形状错位。

## 具体实现

1. **`src/components/ScoreVisuals.tsx` - `NearMissBadge`**：改回实色 `<View>` + `<Text>`，灰底白字（`#6B7280` 底 + `#FFFFFF` 字），保留 `accessibilityLabel="寸"` 与 `testID="near-miss-badge"`，不再走 `BlurBadge`。
2. **`BlurBadge` 填充背景**：`borderRadius` 从 `9` 改为 `8`（= 外层 9 - 边框 1），让填充刚好落在边框内侧，形状对齐。
3. **移除未使用的 `NEUTRAL_BLUR`** 常量。

## 期望输出

寸标签为深灰底白字，高对比度看得清；其他玻璃模糊标签的边框与填充圆角对齐，无错位。

## 实际输出

`npm run typecheck` 通过。Jest 全部 6 套件 23 测试通过（含此前失败的 `getByLabelText('寸')` 断言）。
