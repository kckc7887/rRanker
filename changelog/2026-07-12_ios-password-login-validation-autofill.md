# 2026-07-12 iOS 账密登录验证与自动填充修复

## 改动原因

用户真机复测后，iPhone Expo Go 使用账号密码仍无法刷新成绩；刷新按钮也无效。同时 iOS 将登录表单误判为注册表单，持续弹出强密码建议。上一轮实现只检查 `/login` 返回 200 就显示成功，没有验证 Cookie 是否真的能访问受保护成绩接口；并且只读取标准化后的响应头，遗漏了 `expo/fetch` 原生 `_rawHeaders`。

## 具体实现

- 登录响应优先从 `expo/fetch` 的原生 `_rawHeaders` 提取 `Set-Cookie` 中的 `jwt_token`，标准 `Headers` 作为回退。
- 设置页在显示登录成功之前，使用新会话完整读取玩家、成绩和 B50；验证失败时不写入会话、不切换登录状态。
- 验证成功的成绩快照直接写入 SQLite 和对应 TanStack Query key，切换到首页后立即展示真实数据，不依赖再次刷新。
- Cookie jar 模式若受保护接口返回鉴权错误，明确提示“账号密码正确，但 iOS 未能携带登录 Cookie”。
- 用户名和密码输入框设置 `textContentType="none"`、`autoComplete="off"`、`importantForAutofill="no"`，关闭 iOS/Android 自动填充语义，避免登录页被识别成注册页并弹强密码建议。
- 新增原生 raw headers JWT 提取测试。

## 期望输出

- iPhone 账号密码登录只有在真实成绩接口验证成功后才显示成功，并立即更新首页数据。
- 无法复用 Cookie 时显示准确错误，不再以旧缓存伪装成登录成功。
- iOS 聚焦密码输入框时不再弹出强密码建议。

## 实际输出

- `npm test`：8 个测试文件、31 项测试全部通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npx expo export --platform ios`：成功，1531 个模块完成 iOS bundling。
- iPhone Expo Go 真机结果待用户复测。
