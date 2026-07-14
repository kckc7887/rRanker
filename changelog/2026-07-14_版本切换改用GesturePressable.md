# 版本切换改用 GesturePressable

## 改动原因

歌曲详情页国服/日服版本切换在 iOS 端仍表现为：有按压透明度反馈，但名称不切换。此前为外层 `ScrollView` 设置 `canCancelContentTouches={false}` 仍不足以保证 RN 原生 `Pressable` 收到完整 `onPress`；同页已正常工作的 SD/DX 切换使用的是 gesture-handler `Pressable`。

## 具体实现

1. `VersionMetadataCell` 改为局部 `GestureHandlerRootView` + `GesturePressable`，与 `ChartTypeSwitch` 同一手势体系，绕过外层纵向 `ScrollView` 对手势的取消。
2. 用 `versionCellRoot` 承接原先 `versionCell` 的 `flex: 1.8` 布局，避免 `GestureHandlerRootView` 挤掉行内弹性宽度。
3. 保留 `AutoScrollText` 的 `scrollEnabled={false}` 与子元素 `pointerEvents="none"`，避免内部文本抢占点击。

## 期望输出

- iOS 端点击版本区域可在国服/日服名称间实际切换
- SD/DX 切换、难度横向滑动、页面纵向滚动等现有交互不受影响
- 不在应用根布局全局包裹 `GestureHandlerRootView`（此前全局方案会破坏其他点击）

## 实际输出

- `npm run typecheck` 通过
- `npm run lint` 通过，0 错误、0 警告
- Jest `tests/m2-query.test.tsx` 3 项全部通过（含版本名称切换断言）
- 当前环境为 Windows，无法在此机做 iOS 真机触摸验收；建议在 iPhone 上确认点击版本区后文案会在国服/日服间切换
