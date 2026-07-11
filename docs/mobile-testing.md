# Win11 + iPhone 17 测试方案

> 当前资源：Windows 11 PC、iPhone 17；没有 Mac、没有 Android 真机。目标是先把可验证的产品做实，而不是制造“已经双端验证”的假象。

## 1. 能测什么、不能测什么

| 能力 | 当前测试方式 | 可信度 | 当前限制 |
| --- | --- | --- | --- |
| TypeScript 领域逻辑 | Windows 单元/契约测试 | 高 | 不覆盖原生生命周期 |
| React Native 通用 UI | Windows 组件测试 | 中 | 不代表真机布局完全一致 |
| iOS 产品功能 | EAS development build + iPhone 17 | 高 | 原生问题缺少本地 Xcode 调试 |
| iOS 发布包 | TestFlight + iPhone 17 | 高 | 需要 Apple Developer 账号 |
| Android 通用功能 | Android Studio Emulator | 中 | 不覆盖厂商系统和真实后台限制 |
| Android 设备矩阵 | Firebase Test Lab 等云设备 | 中到高 | 不适合完整微信/OAuth/VPN 人工流程 |
| Android 发布体验 | 借用设备或外部测试者 | 高 | 当前没有设备，不能自行闭环 |
| Android 本地抓取 | 暂不测试 | 无 | 需要 Kotlin `VpnService` 与 Android 真机 |
| iOS 本地抓取 | 暂不测试 | 无 | 需要 Swift Network Extension、签名与 Mac/Xcode |

## 2. 日常测试流水线

每次功能改动在 Windows 执行：

1. TypeScript 类型检查。
2. Rating、B35/B15、排序、筛选和 ID 映射单元测试。
3. Provider 契约测试：正常、缺字段、未知枚举、4xx、5xx、超时和损坏 JSON。
4. 组件状态：加载、空、完成、离线缓存、错误恢复。
5. Android Emulator 冒烟：启动、导航、返回键、键盘和长列表。

这些测试只证明共用代码正确，不能代替 iPhone 或 Android 真机结果。

## 3. iOS 测试方法

### 开发期

- 没有原生依赖的最早期页面可以用 Expo Go 快速查看。
- 正式开发使用 EAS 生成 iPhone development build，安装到 iPhone 17。
- JavaScript 变动通过 Metro 快速迭代；加入或修改原生依赖、权限、app config 后重新云构建。
- 每个功能测试：安全区、手势返回、键盘、系统字体、外部浏览器返回、文件选择、断网、切后台、系统终止和冷启动。

工程建立后预期使用：

```bash
npx expo start
eas build --platform ios --profile development
```

这些命令是未来工程流程，不代表当前仓库已经安装 Expo/EAS。

### 发布前

- 生成 preview/production iOS 构建并上传 TestFlight。
- 在 TestFlight 版本上重新跑：首次安装、覆盖升级、缓存迁移、token 失效、离线重开和崩溃恢复。
- development build 的结果不能替代 TestFlight 分发包。

### 没有 Mac 的停止条件

遇到以下情况不靠猜测继续：

- 仅在 iOS 原生层崩溃且 EAS 日志不足。
- Network Extension、entitlement、provisioning profile 或 app extension 签名失败。
- 需要 Instruments、Xcode Network/Memory 调试或原生断点。

此时临时使用 Mac/远程 Mac 或暂停该原生能力；不让它阻塞普通查分功能。

## 4. Android 测试方法

### 当前阶段

- Windows 安装 Android Studio，仅验证共用产品功能。
- 至少准备两种模拟器：项目最低 Android 版本附近、当前主流版本。
- 覆盖小屏/普通屏、低内存、系统返回键、权限拒绝、断网和进程重建。
- 使用云设备运行自动化冒烟与兼容矩阵，发现机型/系统差异。

### 不能由模拟器证明的内容

- 微信真实登录与 OAuth 完整链路。
- 厂商后台限制、电池优化和通知行为。
- CA 证书信任、HTTPS 拦截和目标 App 是否证书固定。
- `VpnService` 与其他 VPN 冲突、前台服务存活和长期网络恢复。
- Google Play 安装、升级与真实用户反馈。

因此，在获得 Android 真机或外部测试者前，Android 状态只能标记为“兼容开发中”，不能标记为已发布就绪。

### 真机到位后的最小门槛

- 至少 1 台真实 Android 完成核心流程；发布前最好覆盖 2–3 个品牌/系统版本。
- 进入 Google Play 内部测试，验证商店安装与升级。
- 本地抓取另开 Kotlin spike，不混入 React Native 普通功能迭代。

## 5. 数据接入测试矩阵

### Provider API

- 正常返回、空账号、认证失败、token 失效、限流、超时、4xx/5xx。
- 同一 fixture 在 Windows、iOS、Android 得到相同 Rating、B35/B15 和排序。
- 数据来源和最后更新时间始终可见。

### 文件导入

- 正常 JSON、旧 schema、损坏文件、超大文件、重复导入和部分字段缺失。
- iOS Files/分享入口与 Android 文件选择器分别验证。
- 导入前预览，导入失败不覆盖最后一个有效快照。

### 凭据与隐私

- token/cookie 放系统安全存储，不进入 SQLite 普通表、日志或崩溃报告。
- 清除账号后凭据、缓存和派生数据都被删除。
- 提交到仓库的 fixture 不含真实昵称、好友码、token 或完整响应。

## 6. 平台抓取实验的测试要求

### Android `VpnService`

- 只用原生 Kotlin spike 验证，不先封装成 React Native 模块。
- 测试用户 VPN 授权、唯一 VPN 占用、前台通知、onRevoke、进程被杀和网络恢复。
- 单独确认是否能识别目标流量、是否需要 CA、是否存在证书固定。
- 失败必须恢复网络；任何凭据和解密内容不得写普通日志。

### iOS Network Extension

- 只在获得 Mac/Xcode 后开始 Swift spike。
- 先验证 capability、entitlement、app extension 安装和启动，再谈流量解析。
- 测试 VPN 配置授权、extension 崩溃、切换网络、锁屏和卸载后的恢复。
- App Store 可接受性和第三方 App HTTPS 可见性都是独立风险，不能从 Android 或 Windows 结果推断。

## 7. 里程碑验收

### M1 iOS MVP

- Windows 测试全绿。
- iPhone development build 完成核心链路。
- 不依赖本地代理/爬虫。

### M2 iOS Beta

- TestFlight 安装和升级通过。
- provider 与文件导入都有错误恢复。
- 一周日常使用无数据损坏或凭据泄露。

### M3 Android 兼容

- Android Emulator 核心流程通过。
- 云设备自动化通过。
- 至少一台真实 Android 完成人工验收后，才进入 Play 内测。

### M4 抓取实验

- Android/iOS 分别出独立报告：可行性、权限、政策、维护成本、失败恢复和停止建议。
- 任一平台实验失败不影响查分产品继续发布。

## 8. 官方边界参考

- Expo iPhone 云端开发构建：https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/
- Expo iOS 环境配置：https://docs.expo.dev/get-started/set-up-your-environment/?device=physical&mode=development-build&platform=ios
- Android `VpnService`：https://developer.android.com/reference/android/net/VpnService
- Apple Network Extension entitlement：https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.networkextension
- Apple Packet Tunnel Provider：https://developer.apple.com/documentation/networkextension/packet-tunnel-provider
- Firebase Test Lab：https://firebase.google.com/docs/test-lab

