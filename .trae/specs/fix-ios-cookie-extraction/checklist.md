# Checklist

- [x] loginWithPassword 使用 XMLHttpRequest（而非 fetch）发送 POST /login
- [x] jwt_token 提取有三层 fallback：getResponseHeader('Set-Cookie') → getAllResponseHeaders() 正则 → cookie-jar
- [x] XHR 超时 10s，超时后 abort 并抛 ProviderError('timeout')
- [x] XHR 错误处理：非 200 状态码映射到对应 ProviderError（401/403 → authentication，500 → upstream，等）
- [x] DivingFishProvider.request 在 cookie-jar 模式下使用 XHR + withCredentials=true
- [x] DivingFishProvider.request 在 jwt 模式下保持 fetch + Cookie header 不变
- [x] DivingFishProvider.request 在 import-token 模式下保持 fetch + Import-Token header 不变
- [x] cookie-jar 模式下 XHR 请求 12s 超时，错误处理与 fetch 路径一致
- [x] 单元测试覆盖：getResponseHeader 返回 jwt_token 时提取成功
- [x] 单元测试覆盖：getResponseHeader 返回 null 但 getAllResponseHeaders 含 set-cookie 时提取成功
- [x] 单元测试覆盖：两层都拿不到时 fallback 到 cookie-jar 模式
- [x] npm test 全部通过
- [x] npm run typecheck 通过
- [x] npm run lint 通过
- [x] 每个 task 前后各一次 git commit，message 末附 Agent 标识
- [x] changelog 记录改动原因、具体实现、期望输出、实际输出
