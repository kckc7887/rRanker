# Phigros TapTap 登录 slow_down 错误处理

## 改动原因

Phigros 板块经 TapTap 设备码流程登录时，玩家在 TapTap 点击确认后常出现「授权失败：slow_down」并终止整个登录。`slow_down` 是 TapTap OAuth2 设备码流程（RFC 8628）在轮询令牌端点过频时返回的标准错误：原 `pollForToken` 只识别 `authorization_pending` / `authorization_waiting`，`slow_down` 落入 throw，UI 直接报错；且轮询循环每 `interval` 秒固定触发、无在途防重，网络慢时并发请求进一步推高 `slow_down` 出现概率。

## 具体实现

1. **`phigros-auth.ts`**：`pollForToken` 识别 `slow_down`，返回新增状态 `'slowdown'` 而非抛错；其余错误分支不变。
2. **`phigros-score-provider.ts`**：`pollLogin` 返回类型加入 `'slowdown'` 并透传；`login()` 循环遇 `'slowdown'` 继续轮询。
3. **`ProviderLoginSheet.tsx`**：
   - 新增 `phiPollingRef` 在途防重，上一轮请求未结束时跳过本次 tick；
   - 收到 `'slowdown'` 时不中断流程，按 RFC 8628 通过 `phiNextAllowedAtRef` 将下次轮询延后 5 秒，并提示「TapTap 请求过于频繁，已自动放慢轮询…」；
   - `reset()` / `cancelPhigrosLogin()` 同步清理两个 ref。
4. **`tests/phigros-auth-poll.test.ts`**（新增）：mock fetch 验证 `slow_down` → 返回 `'slowdown'` 不抛错、`authorization_pending` / `authorization_waiting` 原行为不变、成功返回 token、未知错误仍抛错。

## 期望输出

玩家在 TapTap 确认授权后，即使遇到 `slow_down`，登录页继续自动轮询并最终完成绑定，不再出现「授权失败：slow_down」；轮询不会并发重复请求。

## 实际输出

`typecheck`、`lint`（0 error）通过；Vitest 110 个文件 700 用例全部通过（含新增 4 个 `pollForToken` 用例）；Jest 36 个套件 193 用例全部通过。
