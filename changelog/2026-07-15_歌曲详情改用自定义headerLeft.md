# 2026-07-15 歌曲详情改用自定义 headerLeft

## 改动原因

用户希望保留原生标题栏返回外观，而不是关掉系统返回键后改用页面叠层按钮。

## 具体实现

1. 移除 `SongDetailChrome` 内容叠层。
2. 用 `@react-navigation/elements` 的 `HeaderBackButton`（`displayMode="minimal"`、白色 tint）作为自定义 `headerLeft`，`onPress` 调用 `router.back()`。
3. 收藏按钮恢复到 `headerRight`。

## 期望输出

- 左上角仍是系统风格最小返回箭头。
- 点击调用 `router.back()`；收藏行为不变。

## 实际输出

- 代码与 Jest（headerLeft/headerRight mock）已更新。
- 若透明标题栏下仍偶发点不中，再评估叠层方案。
