# Tasks

- [ ] Task 1: diving-fish-auth.ts 拿不到 jwt 时抛错而非返回 cookie-jar
  - [ ] SubTask 1.1: 三层 fallback 拿不到 jwt_token 时，抛 ProviderError('authentication', '当前环境无法保存账密登录态，请改用 Import-Token', false)
  - [ ] SubTask 1.2: 更新 tests/diving-fish-auth.test.ts，原"两层都拿不到返回 cookie-jar"改为"抛 ProviderError('authentication')"
- [ ] Task 2: diving-fish-provider.ts 删 requestViaXHR 和 cookie-jar 分支
  - [ ] SubTask 2.1: request 方法移除 cookie-jar 分支，只保留 fetch 路径（jwt + import-token）
  - [ ] SubTask 2.2: 删除 requestViaXHR 方法
- [ ] Task 3: settings.tsx TextInput 加 textContentType
  - [ ] SubTask 3.1: 用户名 TextInput 加 textContentType="username" autoComplete="username"
  - [ ] SubTask 3.2: 密码 TextInput 加 textContentType="password" autoComplete="current-password"
  - [ ] SubTask 3.3: Import-Token TextInput 加 textContentType="oneTimeCode" autoComplete="off"（避免被当成密码）
- [ ] Task 4: 验证与交付
  - [ ] SubTask 4.1: npm test 通过
  - [ ] SubTask 4.2: npm run typecheck 通过
  - [ ] SubTask 4.3: npm run lint 通过
  - [ ] SubTask 4.4: git commit（前后各一次）
  - [ ] SubTask 4.5: 写 changelog

# Task Dependencies

- Task 2 依赖 Task 1（cookie-jar 不再被触发才能安全删除 requestViaXHR）
- Task 3 独立
- Task 4 依赖 1、2、3
