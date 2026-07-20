# Phigros 查分器接入 B 期：UI 绑定流程

## 改动原因

实现 Phigros TapTap 云存档的登录绑定 UI 流程，使玩家可在游戏管理页完成 TapTap OAuth 授权、自动拉取存档并绑定到 App。

## 具体实现

### 修改文件

1. **`src/providers/phigros-score-provider.ts`** — 新增分步登录 API
   - `beginLogin()`: 调用 `requestDeviceCode()` 获取 qrcodeUrl + deviceCode，由 UI 展示和跳转
   - `pollLogin()`: 轮询 `pollForToken()`，成功后调用 `exchangeSessionToken()` 返回 `ProviderSession`

2. **`src/components/ProviderLoginSheet.tsx`** — 新增 Phigros TapTap 登录分支
   - 新增 `isPhigros` 检测（`provider.id === 'phi-taptap'`）
   - `beginPhigrosLogin()`: 调用 `beginLogin()` → 展示状态 → `Linking.openURL(qrcodeUrl)` 跳转 TapTap 授权
   - `pollPhigros()`: 定时轮询授权状态，显示倒计时，成功后保存 session + 激活账号
   - `cancelPhigrosLogin()`: 取消授权并清理定时器
   - Phigros UI 面板：授权前显示"打开 TapTap 授权页"按钮，授权中显示 ActivityIndicator + 倒计时 + 取消按钮

3. **`src/screens/GameAccountsScreen.tsx`** — Phigros 账号管理
   - `sessionModeLabel()`: 新增 `'phi-session'` → `'TapTap 授权'`
   - `renderAccountActions()`: `isRemote` 识别 `phi-taptap`，显示解除绑定按钮

## 期望输出

- 游戏管理 → 添加 → Phigros → TapTap 云存档 → 点击打开授权页 → 跳转浏览器授权 → 自动轮询 → 绑定成功
- 已绑定 Phigros 账号可解除绑定
- lint/typecheck/test 全部通过

## 实际输出

- `npx tsc --noEmit`: 通过
- `npx eslint src/ --max-warnings 0`: 通过
- `npx vitest run`: 55/55 测试文件通过，253/253 测试通过
