# Tasks

- [ ] Task 1: settings.tsx 登录函数加 iOS cookie-jar 降级提示
  - [ ] SubTask 1.1: 引入 Platform from 'react-native'
  - [ ] SubTask 1.2: login 函数中，若 Platform.OS === 'ios' 且 newSession.mode === 'cookie-jar'，不 setSession/sessions.save，setMessage('iOS Expo Go 账密登录不支持，请改用 Import-Token')，setPassword('')，return
  - [ ] SubTask 1.3: Android cookie-jar 保持现有行为不变
- [ ] Task 2: settings.tsx TextInput 加 textContentType
  - [ ] SubTask 2.1: 用户名 TextInput 加 textContentType="username"
  - [ ] SubTask 2.2: 密码 TextInput 加 textContentType="password"
  - [ ] SubTask 2.3: Import-Token TextInput 加 textContentType="oneTimeCode"
- [ ] Task 3: 验证与交付
  - [ ] SubTask 3.1: npm test 通过
  - [ ] SubTask 3.2: npm run typecheck 通过
  - [ ] SubTask 3.3: npm run lint 通过
  - [ ] SubTask 3.4: git commit（前后各一次）
  - [ ] SubTask 3.5: changelog

# Task Dependencies

- Task 2 与 Task 1 无依赖，可并行
- Task 3 依赖 Task 1 和 Task 2
