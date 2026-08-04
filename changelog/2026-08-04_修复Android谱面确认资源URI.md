# 修复 Android 谱面确认资源 URI

## 改动原因

Android release 包会把舞萌谱面确认使用的 `sensor.webp` 暴露为不带 URI scheme 的 drawable 资源标识符。`expo-asset` 将该标识符视为已下载资源后，原实现直接交给 `expo-file-system` 的 `File.copy`；Android 原生层要求传入绝对 URI，因此进入谱面确认页时抛出 `URI is not absolute`，播放器无法加载。

## 具体实现

- 新增谱面预览资源 URI 解析逻辑：保留已有 `file://`、`content://` 等绝对 URI，并兼容不带 scheme 的绝对文件路径。
- Android 遇到 drawable 资源标识符时，将其转换为 `file:///android_res/drawable/...`，再通过 `expo-asset` 下载到真实的本地缓存文件后交给 `expo-file-system` 复制。
- HTML 与二进制资源统一复用同一套本地 URI 加载流程。
- 新增 5 个单元测试，覆盖 Android drawable 标识符、绝对 URI、无 scheme 绝对文件路径以及非 Android 相对 URI 拒绝场景。

## 期望输出

Android 设备进入舞萌“谱面确认”页时，可以正常准备并加载播放器所需资源，不再显示 `FileSystemFile.copy` 的 `URI is not absolute` 错误；iOS 和已有绝对 URI 行为保持不变。

## 实际输出

- URI 回归测试 5/5 通过。
- `npm run lint` 通过，0 个错误；保留仓库现有 26 条警告。
- `npm run typecheck` 通过。
- 全部 Vitest 通过：105 个测试文件、669 个测试。
- 全部 Jest 通过：36 个测试套件、192 个测试。
- 本次未修改页面结构或样式，无 React Native Host Tree/Style 与截图差异。
