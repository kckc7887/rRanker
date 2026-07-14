# 本机 HTTP 模块改为 optional 探测

## 改动原因
在 Expo Go 下 `import('expo-http-server')` 仍会执行包内 `requireNativeModule('ExpoHttpServer')`，直接抛 `Cannot find native module`。

## 具体实现
- `local-capture-http` 不再 import `expo-http-server` JS
- 用 `requireOptionalNativeModule('ExpoHttpServer')` + 自建路由绑定
- Expo Go / 未编入原生模块时安静降级并提示开发构建

## 期望输出
Expo Go 打开上传页不再红屏 ERROR；提示需 `npx expo run:android/ios`。

## 实际输出
optional 探测已落地。
