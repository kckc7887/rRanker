# 2026-07-11 开发前准备审计

## 改动原因

在正式开发前进行最后检查，确认 ROADMAP、数据协议、Expo Go 能力、测试路径和仓库准备是否足以支撑开工，并把仍未验证的假设改成显式门禁。

## 具体实现

- 新增 `docs/development-readiness.md`：
  - 给出当前可开工与不可开工范围。
  - 明确脱敏 fixture、水鱼只读契约、UI 设计输入三个阻塞门禁。
  - 记录 scaffold 时才锁定的版本、包管理器、应用标识和目录结构。
  - 明确 Expo Go、SQLite、SecureStore、安全与发布边界。
  - 提供 M0 完成清单。
- 更新 `docs/api-protocol.md`：把现有内容标记为历史 PoC 清单，增加逐端点复验、脱敏样例和失败降级要求。
- 更新 `ROADMAP.md`：增加范围冻结规则和开工门禁步骤。
- 更新 `TODO.md`：记录 API 契约、UI 输入、SecureStore 生物鉴权与 SQLCipher 风险。
- 更新 `README.md`：增加开发准备文档入口。
- 未读取、修改或整理 `refer/`。

## 期望输出

- 开发者能明确区分“可以开始 M0”与“可以开始真实 provider/UI”的条件。
- 不会把历史水鱼端点表直接当作当前生产契约。
- 不会把 Expo Go 测试结果误称为正式分发验证。
- 开工前已有数据、安全、UI 和测试的可执行检查表。

## 实际输出

- 当前规划顺序一致，未发现爬虫重新进入 M0–M4 的冲突。
- 确认仓库尚无 Expo scaffold、正式 fixture 和已复验水鱼契约，因此结论为“可开始 M0 准备，M1 仍有三个门禁”。
- Expo 官方资料确认 SQLite、SecureStore 和 DocumentPicker 可在 Expo Go 使用；同时确认 Expo Go 不支持 SQLCipher，SecureStore 生物鉴权存在限制，且 Expo Go 不等同生产级构建。
- 本轮仅完善准备文档，未创建工程、调用水鱼 API、读取参考目录或实现产品代码。
