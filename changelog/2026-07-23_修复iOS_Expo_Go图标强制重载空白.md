# 修复 iOS Expo Go 图标因强制重载字体而空白

## 改动原因

安卓 Expo Go 正常、仅 iOS Expo Go 全站 Ionicons 空白。启动路径里的「删除 ExponentAsset 字体 + unload + 再 loadAsync」在 iOS 上常因无法写回缓存目录而失败，等于每次启动都拆掉可用字体；安卓能成功重下，故表现不一致。

## 具体实现

- `ensureUiIconFontsLoaded` / `reloadUiIconFonts` 改为：已加载则跳过，否则仅 `Font.loadAsync`，不再 purge/unload。
- 共享缓存仍只清应用自有临时文件（此前已改），避免再误删系统字体缓存。

## 期望输出

iOS Expo Go 扫码进入后，垃圾桶、复选框、通知等图标与安卓一致可显示。若本机缓存已损坏，需强退/重装 Expo Go 一次以恢复写缓存能力。

## 实际输出

代码已改为安全预加载。请重新 `npm start` 后在 iOS Expo Go 重载验证；若仍空白，按说明清理 Expo Go 缓存或重装。
