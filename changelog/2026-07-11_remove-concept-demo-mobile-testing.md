# 2026-07-11 删除概念 Demo 并转向移动双端测试

## 改动原因

现有概念 HTML 的视觉结果不符合用户预期，用户决定自行完成界面设计。同时明确电脑端代码只用于 Demo 验证想法，正式产品应面向 Android 和 iOS，不应继续规划 Windows 客户端或同步助手产品化。

## 具体实现

- 删除 `demo/index.html`。
- 更新 `README.md`，移除概念页入口，并将电脑端爬虫明确标记为概念验证。
- 更新 `TODO.md`，保留最初需求与后续反馈，调整目标、实现思路、风险和暂缓范围。
- 更新 `ROADMAP.md`：
  - 将 Windows 同步助手产品化改为 Android/iOS 数据接入验证。
  - M2 改为双端真机验证驱动的数据闭环。
  - 移除桌面应用目录与产品化测试计划。
  - 强调电脑端 PoC 不进入移动端运行时。
- 新增 `docs/mobile-testing.md`，说明 Windows 下 Android/iOS 的开发边界、四层测试流程、真机矩阵、rRanker 必测用例与商店测试路径。

## 期望输出

- 仓库不再保留不需要的概念 HTML。
- ROADMAP 不再把电脑端 Demo 误写成正式交付方向。
- 后续每个功能都有 Android 与 iOS 的明确验证方式。
- 开发者能在 Windows 完成通用测试与 Android 本地测试，并清楚 iOS 真机、EAS Build、TestFlight 和 Mac/Xcode 的使用边界。

## 实际输出

- `demo/index.html` 已删除。
- README、TODO、ROADMAP 均已调整为移动双端优先。
- 双端测试文档已建立，覆盖单元、组件、模拟器、真机、开发构建与商店测试。
- 电脑端 Python、Go、WebUI Demo 保留原状，仅作为历史 PoC 和 fixture 来源。
