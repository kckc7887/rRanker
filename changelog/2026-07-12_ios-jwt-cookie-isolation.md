# 2026-07-12 iOS JWT Cookie 隔离与强密码提示修复

## 改动原因

iPhone 真机在账号密码登录后的受保护接口验证阶段返回 403“当前账号无权读取该数据”，Android 正常。已提取 JWT 的请求仍设置 `credentials: include`，可能同时携带 Expo Go 原生 Cookie jar 中的残留 Cookie和手动 `jwt_token`，造成 iOS 服务端身份解析冲突。同时 `textContentType="none"` 未能阻止 iOS 强密码建议。

## 具体实现

- JWT 与 Import-Token 模式改用 `credentials: omit`，禁止原生 Cookie jar 参与请求；JWT 模式只发送本次登录响应提取到的 `jwt_token`。
- 仅 `cookie-jar` 回退模式继续使用 `credentials: include`。
- Provider 错误消息增加失败端点路径，便于区分 `/player/profile`、`/player/records` 和公共曲库接口。
- 密码输入框改用 `textContentType="oneTimeCode"` 与 `autoComplete="one-time-code"`，规避 iOS 将安全输入框推断为新密码/注册表单；密码仍使用 `secureTextEntry` 隐藏。
- 新增 JWT Cookie 隔离和端点错误信息测试。

## 期望输出

- iPhone 使用账号密码取得 JWT 后，后续请求只携带最新 JWT，不受 Expo Go 残留 Cookie 影响。
- 若仍有 403，界面会显示具体失败端点。
- iOS 密码框不再弹出强密码生成建议。

## 实际输出

- `npm test`：8 个测试文件、33 项测试全部通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npx expo export --platform ios`：成功，1531 个模块完成 iOS bundling。
- iPhone Expo Go 真机结果待用户复测。
