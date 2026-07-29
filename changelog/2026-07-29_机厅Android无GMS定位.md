# 机厅查找 Android 无 GMS 定位

## 改动原因

机厅查找在 Android 上通过 `expo-location.getCurrentPositionAsync` 取坐标，底层依赖 Google Fused Location。国产安卓普遍无 Google Play 服务，会出现「已授权定位权限仍显示定位失败」。

## 具体实现

1. 安装 `@react-native-community/geolocation`，Android 使用 `locationProvider: 'android'`（系统 LocationManager，不经 GMS）。
2. 新增 `acquireArcadeGpsOrigin`：权限与逆地理仍走 `expo-location`；Android 高精度失败后再试粗精度/缓存；iOS 继续用 `expo-location`。
3. 机厅查找页改用该工具；定位失败文案引导开启系统定位或手动设置搜索原点。
4. 补充 Vitest 覆盖权限拒绝、双平台路径与 Android 回退。

## 期望输出

- Android（含无 GMS 机型）在系统定位开启且已授权时可拿到坐标并加载附近机厅。
- iOS 定位行为不变。
- 定位失败时提示可手动设置原点。
- 相关单测通过；需重新打 Android 原生包后生效。

## 实际输出

- `vitest`：100 文件 / 617 项通过（含 `acquire-arcade-gps-origin` 6 项）。
- `jest`：34 suites / 164 项通过。
- `typecheck` / `lint` 通过。
