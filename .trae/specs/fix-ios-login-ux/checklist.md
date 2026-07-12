# Checklist

- [ ] loginWithPassword 三层 fallback 拿不到 jwt_token 时抛 ProviderError('authentication')
- [ ] 错误消息为"当前环境无法保存账密登录态，请改用 Import-Token"
- [ ] 不再返回 cookie-jar 模式
- [ ] DivingFishProvider.request 移除 cookie-jar 分支
- [ ] DivingFishProvider.requestViaXHR 方法已删除
- [ ] DivingFishProvider.request 只保留 fetch 路径（jwt + import-token）
- [ ] 用户名 TextInput 有 textContentType="username"
- [ ] 用户名 TextInput 有 autoComplete="username"
- [ ] 密码 TextInput 有 textContentType="password"
- [ ] 密码 TextInput 有 autoComplete="current-password"
- [ ] Import-Token TextInput 有 textContentType（避免被当成密码）
- [ ] 单元测试：三层 fallback 拿不到时抛 ProviderError('authentication')
- [ ] 单元测试：其余 3 个场景（getResponseHeader 提取成功、getAllResponseHeaders fallback、401 错误）仍通过
- [ ] npm test 全部通过
- [ ] npm run typecheck 通过
- [ ] npm run lint 通过
- [ ] git commit message 末附 Agent 标识
- [ ] changelog 记录改动原因、具体实现、期望输出、实际输出
