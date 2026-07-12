# Checklist

- [ ] settings.tsx 引入 Platform from 'react-native'
- [ ] login 函数在 iOS + cookie-jar 模式下不 setSession、不 sessions.save
- [ ] login 函数在 iOS + cookie-jar 模式下显示"iOS Expo Go 账密登录不支持，请改用 Import-Token"
- [ ] login 函数在 iOS + cookie-jar 模式下清空密码并 return
- [ ] Android cookie-jar 模式保持现有 setSession/save/invalidate 行为不变
- [ ] 用户名 TextInput 有 textContentType="username"
- [ ] 密码 TextInput 有 textContentType="password"（非 newPassword）
- [ ] Import-Token TextInput 有 textContentType="oneTimeCode"
- [ ] npm test 通过
- [ ] npm run typecheck 通过
- [ ] npm run lint 通过
- [ ] git commit 前后各一次，message 末附 Agent 标识
- [ ] changelog 记录改动原因、具体实现、期望输出、实际输出
