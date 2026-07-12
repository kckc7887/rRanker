# Tasks

- [ ] Task 1: 改写 diving-fish-auth.ts loginWithPassword 用 XHR 提取 Set-Cookie
  - [ ] SubTask 1.1: 用 XMLHttpRequest 替代 fetch 发送 POST /login，带 10s 超时（AbortController 改为 setTimeout + xhr.abort()）
  - [ ] SubTask 1.2: 提取 jwt_token 三层 fallback：getResponseHeader('Set-Cookie') → getAllResponseHeaders() 正则搜索 → cookie-jar
  - [ ] SubTask 1.3: 保持错误处理（401/403 → authentication，超时 → timeout，网络 → network）与现有契约一致
- [ ] Task 2: 改写 diving-fish-provider.ts request 方法在 cookie-jar 模式下用 XHR
  - [ ] SubTask 2.1: 抽取一个 `xhrFetch` 辅助函数（或内联），在 cookie-jar 模式下用 XHR + withCredentials=true 发送 GET 请求
  - [ ] SubTask 2.2: jwt 和 import-token 模式保持现有 fetch 路径不变
  - [ ] SubTask 2.3: 保持 12s 超时和错误处理（401/403/500/timeout/network/upstream_schema）一致
- [ ] Task 3: 补充单元测试
  - [ ] SubTask 3.1: 测试 XHR 路径 getResponseHeader('Set-Cookie') 返回 jwt_token 时提取成功
  - [ ] SubTask 3.2: 测试 XHR getResponseHeader 返回 null 但 getAllResponseHeaders 含 set-cookie 时提取成功
  - [ ] SubTask 3.3: 测试两层都拿不到时 fallback 到 cookie-jar 模式
- [ ] Task 4: 验证与交付
  - [ ] SubTask 4.1: npm test 通过
  - [ ] SubTask 4.2: npm run typecheck 通过
  - [ ] SubTask 4.3: npm run lint 通过
  - [ ] SubTask 4.4: 每个 task 前后 git commit
  - [ ] SubTask 4.5: 写 changelog

# Task Dependencies

- Task 2 依赖 Task 1（cookie-jar 模式定义在 auth 模块）
- Task 3 依赖 Task 1 和 Task 2
- Task 4 依赖 Task 1、2、3
