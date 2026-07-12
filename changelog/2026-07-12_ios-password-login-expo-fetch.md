# 2026-07-12 修复 iOS 账号密码登录

## 改动原因

iPhone Expo Go 使用账号密码登录水鱼后，React Native 全局 fetch/XHR 无法稳定暴露或复用 `Set-Cookie`，导致后续成绩请求未携带登录 Cookie；Android 网络栈下同一流程正常。产品要求 iOS 必须支持账号密码登录，Import-Token 不能作为替代方案。

## 具体实现

- 登录和水鱼数据请求统一改用 Expo SDK 54 内置、Expo Go 已包含的 `expo/fetch`。
- 登录请求使用 `credentials: 'include'`，并等待响应体完成，让 iOS `URLSession` 将 HttpOnly Cookie 写入共享原生 Cookie jar。
- JS 能读取 `Set-Cookie` 时继续提取 JWT 并保存到 SecureStore；iOS 隐藏该响应头时进入仅当前运行会话有效的 `cookie-jar` 模式。
- 后续水鱼请求同样使用 `expo/fetch` 和 `credentials: 'include'`，由 iOS 原生 Cookie jar 自动携带登录 Cookie。
- 新增账号密码登录、Cookie jar 后续请求、401 和网络错误测试；Vitest 使用测试 shim，生产包仍解析官方 `expo/fetch`。

## 期望输出

- iPhone Expo Go 使用水鱼账号密码登录后，当前运行会话立即读取并刷新真实成绩。
- Android 原有账号密码、JWT 和 Import-Token 路径保持可用。
- 若 iOS 不向 JS 暴露 HttpOnly JWT，密码仍不保存，Cookie 只由原生网络层管理。

## 实际输出

- `npm test`：8 个测试文件、30 项测试全部通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npx expo export --platform ios`：成功，1531 个模块完成 iOS bundling，确认生产构建可解析官方 `expo/fetch`。
- iPhone Expo Go 账号密码登录结果待用户真机验证。
