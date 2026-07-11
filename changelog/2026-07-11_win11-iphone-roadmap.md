# 2026-07-11 Win11 + iPhone 条件下重新规划路线

## 改动原因

用户当前只有一台 Windows 11 PC 和一台 iPhone 17，没有 Mac 和 Android 真机。Android 的 `VpnService` 与 iOS 的 Network Extension、本地服务和代理抓取属于不同原生工程，原先按双端同步共同验收的路线不可执行，也会阻塞查分产品本体。

## 具体实现

- 重写 `ROADMAP.md`：
  - 改为 iOS 先行、Android 后续兼容，不要求同步首发对称。
  - 把 provider/token/文件导入设为首版数据入口。
  - 把 Android 本地抓取与 iOS 本地抓取拆成两个 P3 原生实验。
  - 增加 Apple Developer 账号、Android 真机和 Mac/Xcode 决策门槛。
  - 明确本地抓取失败不能阻塞查分、B50、查歌和工具箱。
- 重写 `docs/mobile-testing.md`：
  - 以 Win11 + iPhone 17 为实际测试矩阵。
  - iOS 使用 EAS development build 与 TestFlight。
  - Android 当前使用模拟器和云设备，真机到位前不标记发布就绪。
  - 为 Android `VpnService` 与 iOS Network Extension 设独立实验和停止条件。
- 更新 `README.md`，将数据接入表述改为 provider/token/文件优先。
- 更新 `TODO.md`，保留用户新增约束、目标、风险、优先级与暂缓原因。

## 期望输出

- 现有设备可以完成 M0–M2，不因缺少 Mac 或 Android 真机停摆。
- iOS 产品可以先完成真实设备和 TestFlight 验证。
- Android 保持代码兼容，但在没有真机时不虚报生产可用。
- 两个平台的本地抓取独立评估，任何一个失败都不影响产品本体。

## 实际输出

- ROADMAP 已调整为 M0 平台底座 → M1 iOS MVP → M2 iOS Beta → M3 Android 兼容 → M4 平台抓取实验。
- 测试文档已按现有设备能力重建，并区分当前可验证、云端可验证和暂不可验证项目。
- README 与 TODO 已与新路线同步。
- 本轮只调整产品与测试规划，未创建移动端工程或实现抓取代码。
