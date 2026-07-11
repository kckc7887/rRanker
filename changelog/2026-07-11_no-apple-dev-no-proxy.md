# 2026-07-11 暂不开通 Apple Developer 账号、先不做代理

## 改动原因

用户确认技术判断并给出决策：UI 与本地服务（领域逻辑、provider、SQLite 缓存、Rating 计算、SecureStore 凭据）双端共用 TypeScript 代码，互通；只有代理（微信流量拦截）是平台专属原生工程，不互通。用户决定暂不花 $99 开通 Apple Developer 账号，M1/M2 用 Expo Go 验证；既然本地服务能互通，就先不做代理部分，集中做查分器本体。

依据 Expo 官方文档（https://docs.expo.dev/get-started/set-up-your-environment/）确认：Expo Go 定位为 playground，但支持 expo-sqlite、expo-secure-store、expo-file-system、fetch 等 Expo SDK 模块，足以覆盖查分器 MVP 的 provider 调用、JSON 导入、本地缓存、凭据存储和 UI；不支持自定义原生模块、TestFlight 分发和原生层调试。由于代理部分暂缓（暂不需要原生模块），这些限制当前可接受。

## 具体实现

- `ROADMAP.md`：
  - 顶部基线补充 2026-07-11 决策说明。
  - 核心决策新增“暂不开通 Apple Developer 账号”与“代理部分暂不做”两条。
  - M1 阶段改为 Expo Go + iPhone 17 验证，明确只用 Expo Go 支持的 SDK 模块；TestFlight 验收延后。
  - M2 阶段改为 Expo Go 验证，TestFlight 列为可选升级项。
  - 第 7 节“关键决策门槛”Apple Developer 账号与本地抓取均标注当前决策与升级条件。
  - 第 8 节“下一步执行顺序”第 1 步标记为已确认，后续步骤同步 Expo Go 路径。
- `TODO.md`：
  - 标题与“用户原始意图”补充 2026-07-11 决策。
  - 用户价值新增“降低成本”。
  - 实现思路改为 Expo Go 验证、只用 Expo Go 支持的 SDK 模块、代理整体暂不做。
  - 依赖/风险更新 Expo Go 限制与抓取前提。
  - 暂缓原因明确代理因平台专属暂不做。
- `docs/mobile-testing.md`：
  - 顶部补充 2026-07-11 更新说明。
  - 能力矩阵 iOS 产品功能改为 Expo Go + iPhone 17，iOS 发布包标记暂不测试。
  - 第 3 节 iOS 测试方法重写为“Expo Go 为主”，新增“何时升级到 EAS development build / TestFlight”小节。
  - 里程碑 M1/M2 验收改为 Expo Go 路径。

## 期望输出

- 路线明确：M1/M2 用 Expo Go 完成 iOS 查分器本体验证，不因缺少 Apple Developer 账号停摆。
- 代理/抓取整体暂缓，不进入首版关键路径。
- 未来升级条件清晰：需要 TestFlight、原生模块或抓取 spike 时再开通账号。

## 实际输出

- ROADMAP、TODO、mobile-testing 三份文档已同步新决策。
- 本轮只调整产品与测试规划，未创建移动端工程或实现代码。
- Expo Go 能力边界已对照官方文档核对，查分器 MVP 不触及不支持项。
