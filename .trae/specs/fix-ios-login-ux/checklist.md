# Checklist

- [x] loginWithPassword 三层 fallback 拿不到 jwt_token 时抛 ProviderError('authentication')
- [x] 错误消息为"当前环境无法保存账密登录态，请改用 Import-Token"
- [x] 不再返回 cookie-jar 模式
- [x] DivingFishProvider.request 移除 cookie-jar 分支
- [x] DivingFishProvider.requestViaXHR 方法已删除
- [x] DivingFishProvider.request 只保留 fetch 路径（jwt + import-token）
- [x] 用户名 TextInput 有 textContentType="username"
- [x] 用户名 TextInput 有 autoComplete="username"
- [x] 密码 TextInput 有 textContentType="password"
- [x] 密码 TextInput 有 autoComplete="current-password"
- [x] Import-Token TextInput 有 textContentType="oneTimeCode"
- [x] 单元测试：三层 fallback 拿不到时抛 ProviderError('authentication')
- [x] 单元测试：其余 3 个场景仍通过
- [x] npm test 全部通过
- [x] npm run typecheck 通过
- [x] npm run lint 通过
- [x] git commit message 末附 Agent 标识
- [x] changelog 记录改动原因、具体实现、期望输出、实际输出
