# Android / iOS 双端测试方案

> 本文是正式移动客户端建立后的执行方案。当前仓库尚未创建 React Native 工程，以下命令不能视为已经安装或验证的依赖。

## 1. 基本原则

- Android 和 iOS 是两个独立验收目标，不以“React Native 共用代码”代替双端测试。
- 领域算法和 provider 映射先用固定 fixture 验证，再接真机网络与授权流程。
- Expo Go 只用于没有自定义原生依赖的早期页面验证；正式开发使用 `expo-dev-client` development build。
- 电脑端爬虫和 WebUI 只提供已验证的数据样例，不作为移动端运行时或测试前置条件。

## 2. Windows 开发环境的实际边界

| 场景 | Android | iOS |
| --- | --- | --- |
| JavaScript/TypeScript 单元测试 | Windows 本机 | Windows 本机 |
| 本地设备模拟 | Android Studio Emulator | Windows 不支持 iOS Simulator |
| 本地真机开发 | USB Android + `npx expo run:android --device` | 不能在 Windows 本地编译 iOS 原生包 |
| 云端开发构建 | EAS Build，可选 | EAS Build + 已注册 iPhone；设备包需要 Apple Developer 付费账号 |
| 本地原生调试 | Android Studio | 需要 Mac + Xcode |
| 发布前分发 | Google Play 内部测试 | TestFlight |

在尚未使用自定义原生模块时，可以用 iPhone 上的 Expo Go 快速查看页面；一旦引入数据库、网络配置、原生权限或其他原生依赖，应切换到 development build。

## 3. 建议的四层测试

### A. 每次改动都运行

- TypeScript 类型检查。
- 领域算法单元测试：Rating、B35/B15、排序、筛选、ID 映射。
- Zod/provider 契约测试：水鱼样例、微信样例、缺字段、未知枚举、错误响应。
- React Native Testing Library：加载、空、错误、缓存、数据完成五种渲染状态。

这些测试在 Windows 上一次执行即可，但业务用例不得包含平台专属模块。

### B. 每个功能完成时运行

Android：

1. Android Studio 模拟器检查布局、导航和常见系统版本。
2. 至少一台真实 Android 检查网络、存储、返回键、切后台、弱网和低内存恢复。
3. 对涉及权限、登录、外部浏览器、深链、文件选择的功能只认真机结果。

iOS：

1. 无原生依赖阶段可用 iPhone + Expo Go 快速验证页面。
2. 正式功能使用 EAS iOS development build 安装到已注册 iPhone。
3. 检查安全区、键盘、手势返回、权限拒绝、Safari 授权返回、切后台和系统终止恢复。
4. 需要 iOS Simulator、Xcode 日志、原生断点或签名问题定位时，使用 Mac + Xcode。

### C. 合并或里程碑前运行

- Android 与 iOS development build 都必须成功。
- 在同一份 fixture 下对比关键页面：总 Rating、B35/B15 数量、排序、达成率精度、fc/fs/rate。
- 真机执行核心链路：首次启动 → 导入/登录 → 查看 B50 → 查歌 → 离线重开 → 刷新失败恢复。
- 对平台差异拍照或录屏留证，记录设备、系统版本、应用 build number 与数据来源。

### D. 发布候选版本运行

- Android 上传 Google Play 内部测试，再扩大到封闭测试。
- iOS 上传 TestFlight，先内部测试，再按需要邀请外部测试者。
- 商店分发包重新走核心链路，不能用 development build 的结果替代。
- 验证升级安装与本地数据库迁移，不只测试全新安装。

## 4. rRanker 必测用例

### 数据正确性

- 同一 fixture 在两端得到完全相同的 B35、B15、DX Rating 和排序。
- achievements 的小数精度、RA、难度、DX/SD、fc/fs/rate 不因平台格式化而变化。
- 未知枚举显示为可追溯的降级值，不崩溃、不静默删除记录。

### 网络与授权

- 首次授权成功、用户取消、token 过期、限流、超时、无网络、服务端 4xx/5xx。
- 从外部浏览器返回 App 后，授权状态只能消费一次，不能重复提交。
- 切后台或系统杀进程后，代理/provider 请求不会产生重复导入。

### 缓存与隐私

- 首次无缓存、缓存命中、缓存损坏、schema 升级、手动清除数据。
- token/cookie 使用系统安全存储；日志与错误报告不得包含凭据、好友码或完整响应。
- 离线页面明确显示数据来源和最后更新时间。

### 界面与设备

- 小屏 Android、主流 Android、窄屏 iPhone、带刘海/灵动岛 iPhone。
- 深色模式、系统字体放大、中文/日文长歌名、横竖屏策略、键盘遮挡。
- 60 Hz 和高刷新率设备的长列表滚动，678 条以上成绩不应明显卡顿。

## 5. 推荐执行节奏

1. 日常：Windows 单元/组件测试 + Android 模拟器。
2. 每完成一个用户功能：Android 真机 + iPhone development build 各跑一次功能清单。
3. 每个 M1/M2 里程碑：生成 Android/iOS 同版本构建，完整回归。
4. 发布前：Google Play 内部测试 + TestFlight，收集真实设备反馈后再进入生产发布。

## 6. 官方参考

- Expo development build：https://docs.expo.dev/develop/development-builds/create-a-build/
- Windows 开发 iOS 说明：https://docs.expo.dev/faq/#can-i-develop-ios-apps-on-a-windows-computer
- Google Play 测试轨道：https://support.google.com/googleplay/android-developer/answer/9845334
- Apple TestFlight：https://developer.apple.com/testflight/

