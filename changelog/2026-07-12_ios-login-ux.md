# 2026-07-12 修复 iOS 账密登录 UX 与输入框识别

## 改动原因

上一个 fix（XHR 提取 Set-Cookie）在 iPhone Expo Go 上仍不 work：XHR 也拿不到 Set-Cookie，cookie-jar 模式后续请求也带不上 cookie。用户登录后显示"登录成功"但数据不更新。此外 iOS 将登录页输入框当成注册框，每次弹强密码建议。

## 具体实现

- **`src/providers/diving-fish-auth.ts`**：三层 fallback 拿不到 jwt_token 时，不再静默返回 cookie-jar 模式，改为抛 `ProviderError('authentication', '当前环境无法保存账密登录态，请改用 Import-Token', false)`。
- **`src/providers/diving-fish-provider.ts`**：删除 `requestViaXHR` 方法和 cookie-jar 分支，`request` 回到只有 fetch 路径（jwt + import-token）。
- **`app/(tabs)/settings.tsx`**：三个 TextInput 加 `textContentType`（iOS）和 `autoComplete`（Android）：
  - 用户名：`textContentType="username"` `autoComplete="username"`
  - 密码：`textContentType="password"` `autoComplete="current-password"`
  - Import-Token：`textContentType="oneTimeCode"` `autoComplete="off"`
- **`tests/diving-fish-auth.test.ts`**：原"两层都拿不到返回 cookie-jar"改为"抛 ProviderError('authentication')"。

## 期望输出

- `npm test` / `npm run typecheck` / `npm run lint` 全部通过。
- iOS Expo Go 账密登录失败时，设置页显示"当前环境无法保存账密登录态，请改用 Import-Token"，用户立即得到反馈。
- iOS 聚焦密码输入框时不再弹强密码建议。

## 实际输出

- `npm test`：7 文件 29 项全过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- 双端真机验证待用户确认。
