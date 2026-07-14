# 2026-07-15 歌曲详情 Chrome 改用 RN Pressable

## 改动原因

返回/收藏叠层使用了 `react-native-gesture-handler` 的 `Pressable`，但其不在 `GestureHandlerRootView` 子树内，真机报错：`GestureDetector must be used as a descendant of GestureHandlerRootView`。

## 具体实现

`SongDetailChrome` 改回 RN 原生 `Pressable`。叠层本身已在曲绘/ScrollView 之上，不需要 gesture-handler 来规避滚动抢手势。

## 期望输出

- 进入歌曲详情不再抛 GestureHandlerRootView 错误。
- 返回与收藏仍可点击。

## 实际输出

- 代码已改；Jest UI 相关断言仍覆盖返回与收藏。
