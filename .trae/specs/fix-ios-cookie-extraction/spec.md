# 修复 iOS Expo Go 登录水鱼后 Set-Cookie 提取失败 Spec

## Why

M1 验收时发现：iPhone Expo Go 登录水鱼后，Android 端数据更新但 iPhone 端数据不更新，点刷新也无效。

根因：iOS Expo Go 的 fetch 底层 NSURLSession 不把 `Set-Cookie` response header 暴露给 JS 层（RN 的 whatwg-fetch 和 XHR polyfill 本身不过滤 Set-Cookie，但 iOS 原生层 `RCTNetworking` 的 `responseReceived` 回调里 `responseHeaders` 字典不含 Set-Cookie key）。导致 `diving-fish-auth.ts` 第 17 行 `response.headers.get('set-cookie')` 在 iOS 上返回 null，fallback 到 `cookie-jar` 模式（`persistable: false`），后续 `DivingFishProvider.request` 不设置 Cookie header，依赖 `credentials: 'include'` 让原生层带 cookie，但 iOS Expo Go 的 fetch 与 NSHTTPCookieStorage 之间存在隔阂，后续请求带不上 cookie → 401/403 → ScoreService 回退 stale 缓存 → 数据不更新。

## What Changes

- `diving-fish-auth.ts` 的 `loginWithPassword` 改用 `XMLHttpRequest` 替代 `fetch` 发送 /login 请求，因为 XHR 的 `getResponseHeader('Set-Cookie')` 走 `_lowerCaseResponseHeaders` 字典直查路径，与 fetch 的 `parseHeaders(getAllResponseHeaders())` 字符串拼装路径不同，在 iOS 上可能拿到 Set-Cookie。
- 提取 jwt_token 时做多层 fallback：先试 `xhr.getResponseHeader('Set-Cookie')`，再试从 `xhr.getAllResponseHeaders()` 字符串中正则搜索 `set-cookie:`，最后 fallback 到 cookie-jar 模式。
- cookie-jar 模式的后续请求改为也用 XHR + `withCredentials = true` 发送，而非 fetch + `credentials: 'include'`，因为 XHR 的 `withCredentials` 在 iOS 上与 NSHTTPCookieStorage 的协作更可靠。
- `DivingFishProvider.request` 在 cookie-jar 模式下改用 XHR 发送请求（仅 cookie-jar 模式，jwt 和 import-token 模式仍用 fetch）。

## Impact

- Affected specs: m1-score-mvp（其验收项 8 "水鱼登录切换" 在 iOS 上不通过）
- Affected code:
  - `apps/mobile/src/providers/diving-fish-auth.ts` — loginWithPassword 改用 XHR
  - `apps/mobile/src/providers/diving-fish-provider.ts` — request 方法在 cookie-jar 模式下改用 XHR
  - `apps/mobile/tests/diving-fish-auth.test.ts` — 补充 XHR 路径的单元测试

## ADDED Requirements

### Requirement: iOS 登录 Set-Cookie 提取

系统 SHALL 在 iOS Expo Go 环境下登录水鱼时，通过 XMLHttpRequest 的 `getResponseHeader('Set-Cookie')` 或 `getAllResponseHeaders()` 字符串解析提取 `jwt_token`，而非依赖 fetch 的 `response.headers.get('set-cookie')`。

#### Scenario: iOS XHR 拿到 Set-Cookie

- **WHEN** iOS Expo Go 用户在设置页输入水鱼账密登录
- **AND** XHR 的 `getResponseHeader('Set-Cookie')` 返回包含 `jwt_token=xxx` 的字符串
- **THEN** session 模式为 `jwt`，`persistable: true`，后续请求用 Cookie header 带 jwt_token
- **AND** 总览/B50/成绩页自动刷新为水鱼真实数据

#### Scenario: iOS XHR 也拿不到 Set-Cookie 但 cookie-jar 生效

- **WHEN** iOS Expo Go 用户登录
- **AND** XHR 的 `getResponseHeader('Set-Cookie')` 返回 null
- **AND** `getAllResponseHeaders()` 字符串中也不含 `set-cookie:`
- **THEN** session 模式为 `cookie-jar`，`persistable: false`
- **AND** 后续请求用 XHR + `withCredentials: true` 发送，依赖 NSHTTPCookieStorage 自动带 cookie
- **AND** 如果后续请求返回 200，数据显示水鱼真实数据
- **AND** 如果后续请求返回 401/403，ScoreService 回退 stale 缓存并显示黄色横幅

#### Scenario: 双端行为一致

- **WHEN** 同一水鱼账号在 iPhone Expo Go 和 Android Emulator 上登录
- **THEN** 两端都能显示水鱼真实数据（DX Rating、B50、成绩列表一致）

## MODIFIED Requirements

### Requirement: 水鱼账密登录

`loginWithPassword` SHALL 使用 XMLHttpRequest（而非 fetch）发送 POST /login 请求，从 XHR response 提取 jwt_token。提取顺序：

1. `xhr.getResponseHeader('Set-Cookie')` 正则匹配 `jwt_token=([^;]+)`
2. `xhr.getAllResponseHeaders()` 字符串中正则搜索 `set-cookie:.*jwt_token=([^;]+)`（大小写不敏感）
3. fallback 到 `cookie-jar` 模式

### Requirement: 水鱼数据请求（cookie-jar 模式）

`DivingFishProvider.request` 在 session 模式为 `cookie-jar` 时 SHALL 使用 XMLHttpRequest + `withCredentials: true` 发送请求，而非 fetch + `credentials: 'include'`。jwt 和 import-token 模式保持 fetch 不变。
