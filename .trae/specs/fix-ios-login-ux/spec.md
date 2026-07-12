# 修复 iOS 账密登录 UX 与强密码建议 Spec

## Why

上一个 spec（fix-ios-cookie-extraction）用 XHR 替代 fetch 提取 Set-Cookie，但用户真机验证后发现 iPhone Expo Go 下账密登录仍然不行——XHR 和 fetch 底层走同一个 `RCTNetworking.__didReceiveResponse` 回调，iOS 原生层（NSURLSession）根本不把 Set-Cookie 传给 JS 层的 responseHeaders 字典，所以 XHR 的 `getResponseHeader` 和 `getAllResponseHeaders` 也拿不到。cookie-jar 模式下 XHR + withCredentials 也没让后续数据请求带上 cookie，数据仍然 401 回退 stale。

结论：iOS Expo Go 下账密登录这条路彻底走不通，只能用 Import-Token。

同时用户反馈：iPhone 把登录页的用户名/密码输入框当成注册框，每次都弹出强密码建议。原因是 TextInput 没设 `textContentType`，iOS 默认行为不确定，可能触发 newPassword 联想。

## What Changes

- `app/(tabs)/settings.tsx` 的 `login` 函数：检测 `Platform.OS === 'ios'` 且 `newSession.mode === 'cookie-jar'` 时，不 setSession、不保存到 SecureStore，提示"iOS Expo Go 账密登录不支持，请改用 Import-Token"。Android 的 cookie-jar 模式保持现有行为不变。
- `app/(tabs)/settings.tsx` 的用户名 TextInput 加 `textContentType="username"`，密码 TextInput 加 `textContentType="password"`（非 newPassword，避免强密码建议）。
- Import-Token TextInput 加 `textContentType="oneTimeCode"`（避免 iOS 当成密码框）。

## Impact

- Affected specs: fix-ios-cookie-extraction（其 XHR 方案在 iOS 上仍无效，本 spec 是其后续收尾）
- Affected code: `apps/mobile/app/(tabs)/settings.tsx` — login 函数 + TextInput 属性

## ADDED Requirements

### Requirement: iOS 账密登录降级提示

系统 SHALL 在 iOS 平台下，当账密登录结果为 cookie-jar 模式（即未能提取 jwt_token）时，不设置 session、不保存凭据，并向用户显示"iOS Expo Go 账密登录不支持，请改用 Import-Token"提示。

#### Scenario: iOS cookie-jar 模式被拒绝

- **WHEN** iOS Expo Go 用户输入水鱼账密点登录
- **AND** loginWithPassword 返回 `{ mode: 'cookie-jar', persistable: false }`
- **THEN** 不调用 setSession，不调用 sessions.save
- **AND** 显示"iOS Expo Go 账密登录不支持，请改用 Import-Token"
- **AND** 密码输入框清空

#### Scenario: Android cookie-jar 模式仍可用

- **WHEN** Android 用户输入水鱼账密点登录
- **AND** loginWithPassword 返回 cookie-jar 模式
- **THEN** 正常 setSession、保存、invalidateQueries（保持现有行为）

### Requirement: 登录表单 textContentType

系统 SHALL 为登录表单的 TextInput 设置正确的 `textContentType`，避免 iOS 自动填充将其误判为注册框。

- 用户名输入框：`textContentType="username"`
- 密码输入框：`textContentType="password"`（非 newPassword）
- Import-Token 输入框：`textContentType="oneTimeCode"`

#### Scenario: iOS 不弹强密码建议

- **WHEN** iOS 用户聚焦密码输入框
- **THEN** iOS 键盘上方不弹出"使用强密码"建议
- **AND** 可正常从 iCloud 钥匙串填充已保存的密码

## REMOVED Requirements

### Requirement: iOS XHR Set-Cookie 提取（来自 fix-ios-cookie-extraction）

**Reason**: XHR 与 fetch 底层走同一个原生回调，iOS 原生层不把 Set-Cookie 传给 JS，XHR 路径同样无效。
**Migration**: XHR 提取逻辑保留在代码中（不删除，Android 上可能有边缘场景用到），但 iOS 下不再依赖它——cookie-jar 模式直接降级为提示用 Import-Token。
