# 澎湃 OS 成绩图片 WebView 白屏修复

## 改动原因

澎湃 OS 2.0.208.0 设备上，舞萌成绩图片预览持续白屏，导出最终提示图片渲染超时。上一轮 HTML 语法兼容、素材等待兜底与列表裁剪修复上线后问题仍可复现。用户提供的同类案例显示，部分澎湃 OS 版本会让特定 `applicationId` 与 `versionCode=1` 的应用无法启动 WebView，表现为静态页面、网页链接和 WebView 回调全部失效；本项目当前 Android `versionCode` 恰好为 1。

## 具体实现

- 保持 `applicationId` 为 `com.rranker.app`，避免改变应用身份和升级关系。
- 在 Expo 应用配置中将 Android `versionCode` 从 1 提升到 2。
- 重新执行 Expo Android prebuild，使生成的原生工程同步新版本码。
- 重新生成包含 `armeabi-v7a`、`arm64-v8a`、`x86`、`x86_64` 的通用 release APK。

## 期望输出

澎湃 OS 不再因 `versionCode=1` 的系统异常阻断 WebView 初始化；成绩图片预览能够显示，导出渲染能够正常向原生层发送完成消息。同时新 APK 保持原包名，可覆盖安装已有版本。

## 实际输出

- Expo SDK 54 配置解析成功，确认 `android.package=com.rranker.app`、`android.versionCode=2`。
- Android prebuild 与 release 构建成功，生成 92.19 MB 通用 APK。
- APK 清单确认包名为 `com.rranker.app`、`versionCode=2`、`versionName=1.0.0`。
- APK 内容确认同时包含 `armeabi-v7a`、`arm64-v8a`、`x86`、`x86_64`。
- APK Signature Scheme v2 验证通过，签名者数量为 1。
