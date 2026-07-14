# Android 封装为 APK

## 改动原因
用户不要模拟器运行，要封装成可安装的 APK（Windows 无 Mac）。

## 具体实现
- 新增 `eas.json`：`development` / `preview` 输出 APK；`production` 用 AAB
- `package.json` 增加：
  - `npm run apk:debug`：本机 prebuild + `assembleDebug`
  - `npm run apk:release`：本机 prebuild + `assembleRelease`
  - `npm run eas:apk`：云构建 preview APK

## 期望输出
Windows 上能打出 APK；不依赖开模拟器。

## 实际输出
构建脚本与 EAS 配置已落地；需本机 Android SDK 或 EAS 账号实际出包。
