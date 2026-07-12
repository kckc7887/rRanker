# 修复 iOS 账密登录 UX 与输入框识别 Spec

## Why

上一个 fix（XHR 提取 Set-Cookie）在 iPhone Expo Go 上仍然不 work：XHR 也拿不到 Set-Cookie，cookie-jar 模式的后续请求也带不上 cookie。用户登录后显示"登录成功"但数据不更新，体验很差。此外 iOS 将登录页输入框当成注册框，每次弹强密码建议。

## What Changes

- `diving-fish-auth.ts` 的 `loginWithPassword`：三层 fallback 拿不到 jwt_token 时，不再静默返回 cookie-jar 模式，而是抛 `ProviderError('authentication', '当前环境无法保存账密登录态，请改用 Import-Token', false)`。让用户立刻得到明确反馈。
- `diving-fish-provider.ts`：删除 `requestViaXHR` 方法和 cookie-jar 分支（cookie-jar 模式不再会被触发，request 回到只有 fetch 路径）。
- `settings.tsx`：给用户名和密码 TextInput 加 `textContentType`（iOS）和 `autoComplete`（Android），让系统识别为登录场景。
  - 用户名：`textContentType="username"` `autoComplete="username"`
  - 密码：`textContentType="password"` `autoComplete="current-password"`

## Impact

- Affected specs: fix-ios-cookie-extraction（其 cookie-jar fallback 方案被废弃）
- Affected code:
  - `apps/mobile/src/providers/diving-fish-auth.ts` — 拿不到 jwt 抛错
  - `apps/mobile/src/providers/diving-fish-provider.ts` — 删 requestViaXHR
  - `apps/mobile/app/(tabs)/settings.tsx` — TextInput 加 textContentType
  - `apps/mobile/tests/diving-fish-auth.test.ts` — 更新测试（cookie-jar 场景改为抛错）

## ADDED Requirements

### Requirement: 账密登录失败明确反馈

系统 SHALL 在账密登录成功（HTTP 200）但无法提取 jwt_token 时，抛出 `ProviderError('authentication')`，消息为"当前环境无法保存账密登录态，请改用 Import-Token"，而非静默返回 cookie-jar 模式。

#### Scenario: iOS Expo Go 账密登录拿不到 jwt

- **WHEN** iOS Expo Go 用户输入水鱼账密登录
- **AND** HTTP 200 但 XHR 三层 fallback 都拿不到 jwt_token
- **THEN** 抛 ProviderError('authentication')
- **AND** 设置页显示"当前环境无法保存账密登录态，请改用 Import-Token"
- **AND** 密码框清空，用户可以立即改用 Import-Token

#### Scenario: Android 账密登录正常

- **WHEN** Android 用户输入水鱼账密登录
- **AND** HTTP 200 且 XHR 能拿到 jwt_token
- **THEN** session 模式为 jwt，数据正常更新

### Requirement: 登录输入框正确标识为登录场景

系统 SHALL 为设置页的用户名和密码 TextInput 设置 `textContentType`（iOS）和 `autoComplete`（Android），使系统识别为登录场景而非注册场景。

#### Scenario: iOS 不弹强密码建议

- **WHEN** iPhone 用户聚焦密码输入框
- **THEN** iOS 不弹出"强密码建议"注册流程
- **AND** QuickType 栏可能显示已保存的密码供自动填充

## MODIFIED Requirements

### Requirement: 水鱼账密登录

`loginWithPassword` SHALL 使用 XMLHttpRequest 发送 POST /login，提取 jwt_token。提取失败时抛 `ProviderError('authentication')`，不再返回 cookie-jar 模式。

### Requirement: 水鱼数据请求

`DivingFishProvider.request` SHALL 仅支持 jwt 和 import-token 两种 session 模式。cookie-jar 分支和 `requestViaXHR` 方法被移除。

## REMOVED Requirements

### Requirement: cookie-jar session 模式

**Reason**: Expo Go 沙盒限制导致 cookie-jar 模式的后续请求无法带上 cookie，实际不工作。
**Migration**: ProviderSession 类型定义中的 cookie-jar 分支保留（避免大面积类型改动），但 loginWithPassword 不再返回此模式。
