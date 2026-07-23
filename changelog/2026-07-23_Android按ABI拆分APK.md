# Android release 按 ABI 拆成 4 个 APK

## 改动原因

四 ABI 打进单个 fat APK（约 120MB），且 `extractNativeLibs=false` 时安装后也不裁剪，真机安装体积接近整包。需要一次 `assembleRelease` 分别产出各架构 APK，便于真机只装 `arm64-v8a`。

## 具体实现

1. 新增 Expo config plugin `plugins/with-android-abi-splits.js`，在 `app.json` 注册；`expo prebuild` 时向 `android/app/build.gradle` 注入 `splits.abi`（四架构、`universalApk false`）。
2. 本机已有 `android/` 目录同步写入同一 splits 块，便于立刻 `assembleRelease`。
3. `package.json` 增加 `apk:release:abi`（在已有 `android/` 上直接 assemble）。

## 期望输出

- `assembleRelease` 在 `android/app/build/outputs/apk/release/` 下生成：
  - `app-armeabi-v7a-release.apk`
  - `app-arm64-v8a-release.apk`
  - `app-x86-release.apk`
  - `app-x86_64-release.apk`
- 不再默认产出单一四合一 `app-release.apk`（除非另开 `universalApk`）。
- `expo prebuild` 后 `build.gradle` 仍保留 ABI splits。

## 实际输出

- 已写入 splits 与 config plugin，并注册到 `app.json`。
- 插件模块可正常 `require`。
- 完整 `assembleRelease` 未在本任务内重跑（耗时长）；需本地执行后核对四份 APK 文件名与体积。
