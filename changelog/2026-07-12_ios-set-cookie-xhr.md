# 2026-07-12 修复 iOS Set-Cookie 提取 bug

## 改动原因

iPhone Expo Go 登录水鱼查分器后数据不更新。根因：iOS fetch 底层 NSURLSession 不把 `Set-Cookie` response header 暴露给 JS 层，导致 `loginWithPassword` 无法从 `response.headers.get('set-cookie')` 提取 `jwt_token`，cookie 仅留在原生 cookie jar 中但 JS 无法读取，后续请求也无法附带鉴权。需要改用 XMLHttpRequest 提取 `jwt_token`，并在 cookie-jar 模式下用 XHR + withCredentials 复用原生 cookie jar。

## 具体实现

- **`src/providers/diving-fish-auth.ts`**：`loginWithPassword` 由 fetch 改为 XMLHttpRequest 发送 POST `/login`。
  - 用 `setTimeout(() => xhr.abort(), 10_000)` 实现 10s 超时（RN XHR 不支持 `timeout` 属性）。
  - `withCredentials = true` 携带 cookie。
  - jwt_token 提取三层 fallback：
    1. `xhr.getResponseHeader('Set-Cookie')` 正则匹配 `jwt_token=([^;]+)`；
    2. `xhr.getAllResponseHeaders()` 字符串中正则搜索 `set-cookie:.*jwt_token=([^;]+)`（大小写不敏感）；
    3. fallback 到 `{ mode: 'cookie-jar', persistable: false }`。
  - 错误处理：非 2xx 用 `providerErrorFromStatus(status)`，`onabort`/`ontimeout` 抛 `ProviderError('timeout')`，`onerror` 抛 `ProviderError('network')`。
  - `useImportToken` 保持不变。

- **`src/providers/diving-fish-provider.ts`**：`request` 方法在 `session.mode === 'cookie-jar'` 时分流到新增的私有方法 `requestViaXHR(path)`。
  - `requestViaXHR` 用 XHR + `withCredentials = true` 发送 GET，12s 超时，错误处理与 fetch 路径一致（状态码错误 → `providerErrorFromStatus`，JSON 解析失败 → `upstream_schema`，超时 → `timeout`，网络 → `network`）。
  - jwt 和 import-token 模式保持原 fetch 路径不变。
  - 其余方法（getPlayer/getRecords/getBest50/getSongs/getChartStats/source/parseContract）不变。

- **`tests/diving-fish-auth.test.ts`**（新建）：vitest + node 环境，用 MockXHR（`vi.stubGlobal('XMLHttpRequest', MockXHR)`）覆盖 4 个场景：
  1. `getResponseHeader('Set-Cookie')` 返回 `jwt_token=abc123; ...` → `{ mode: 'jwt', value: 'abc123', persistable: true }`；
  2. `getResponseHeader` 返回 null，`getAllResponseHeaders` 含 `set-cookie: jwt_token=def456; ...` → `{ mode: 'jwt', value: 'def456', persistable: true }`；
  3. 两层都拿不到 → `{ mode: 'cookie-jar', persistable: false }`；
  4. 401 状态码 → 抛 `ProviderError('authentication')`。

## 期望输出

- `npm test` / `npm run typecheck` / `npm run lint` 全部通过。
- iPhone Expo Go 登录后能提取 jwt_token（或退化到 cookie-jar 模式继续用原生 jar 鉴权），数据正常更新。

## 实际输出

- `npm test`：7 文件 29 项全过（新增 4 项 diving-fish-auth 测试）。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- 双端真机验证待用户在 iPhone Expo Go 上手动确认登录后数据更新。
