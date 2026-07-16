# 修复 APK 成绩图字体与 Rating 框缺失

## 改动原因

Android 开发环境中的舞萌成绩图片预览正常，但 release APK 会把 Metro 静态素材编译为 Android `raw/drawable` 资源。`expo-asset` 在该环境可能把 Rating 框的资源标识符误判为已下载文件，字体也可能先按不可读取的打包路径加载；原实现直接用文件 API 读取这些 URI，导致预览提示“字体或 Rating 框加载失败”。

## 具体实现

- 保留开发环境和 iOS 已有的 `Asset.loadAsync` 常规加载链路。
- 常规资源无法读取时，使用 React Native `Image.resolveAssetSource` 获取 APK 内的真实 Android 资源标识符。
- 将 `raw/drawable` 资源通过 `expo-asset` 复制到可读取的缓存文件，再转为 WebView 使用的 Base64 Data URI。
- 增加 Android release 回归测试，同时覆盖字体首次加载报错和 Rating 框返回不可读资源标识符两种情况。

## 期望输出

安装 release APK 后进入“舞萌 - 导出成绩图片”，预览窗能正常加载内嵌字体和对应 Rating 框；开发环境、iOS 和已有导出流程不受影响。

## 实际输出

- 新增资源回退测试通过；完整 Vitest 40 个测试文件、173 项全部通过。
- Jest 7 个 UI 测试套件、31 项全部通过；仅保留项目既有的 `act(...)` 测试提示。
- TypeScript 类型检查、相关 ESLint 检查与 `git diff --check` 均通过。
- 使用 JDK 17 完成 Android release 构建，生成 96.7 MB APK；构建清单确认包含 `raw/assets_rating_ariblk` 和 `drawable/assets_rating_rating_base_01` 至 `drawable/assets_rating_rating_base_11`。
