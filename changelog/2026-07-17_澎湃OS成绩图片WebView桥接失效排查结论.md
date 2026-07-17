# 澎湃OS 成绩图片 WebView 桥接失效排查结论

## 改动原因

构建安装包后在澎湃OS 2.0.208.0 设备上使用成绩导出页时，出现三个症状：

1. 预览窗不渲染
2. 导出提示超时
3. 导出按钮底部小字显示「页面已载入，等待渲染」，WebView 版本未知

关键约束：其他设备与其他位置均不出问题，且无诊断信息（logcat、Chrome Inspector）可获取。用户明确要求先排查问题、不进行代码修改，并将排查得到的猜测写入 changelog 留档。

## 具体实现

本次未修改任何代码，仅完成代码层面排查并将结论记录到本文件。排查覆盖范围：

- [apps/mobile/app/best-image.tsx](../apps/mobile/app/best-image.tsx) 预览 WebView（588-609 行）与导出 WebView（635 行）配置
- [apps/mobile/src/features/best-image/build-best-image-html.ts](../apps/mobile/src/features/best-image/build-best-image-html.ts) 内联 `postToNative` 脚本逻辑
- [apps/mobile/src/features/best-image/load-best-image-assets.ts](../apps/mobile/src/features/best-image/load-best-image-assets.ts) 资源加载与 data: URI 转换
- [apps/mobile/src/features/best-image/best-image-export.ts](../apps/mobile/src/features/best-image/best-image-export.ts) 导出尺寸与平台分支
- [apps/mobile/node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebView.java](../apps/mobile/node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebView.java) 桥接注入实现
- [apps/mobile/node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java](../apps/mobile/node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java) `onPageStarted` 注入时序
- [apps/mobile/android/app/build.gradle](../apps/mobile/android/app/build.gradle) 与 [proguard-rules.pro](../apps/mobile/android/app/proguard-rules.pro) 构建配置
- [apps/mobile/android/app/src/main/AndroidManifest.xml](../apps/mobile/android/app/src/main/AndroidManifest.xml) 与 debug 变体 manifest
- [apps/mobile/android/app/src/main/java/com/rranker/app/MainApplication.kt](../apps/mobile/android/app/src/main/java/com/rranker/app/MainApplication.kt) 应用初始化代码

### 症状与代码状态的精确对应

| 用户观察到的现象 | 对应代码状态 | 触发位置 |
| --- | --- | --- |
| 预览窗不渲染 | HTML 已加载但渲染未推进到 `ready` | `best-image.tsx` 预览 WebView |
| 导出提示超时 | 30 秒未收到 `best-image-ready` 消息 | `waitForExportPage` reject |
| 「页面已载入，等待渲染」 | `BestImageWebViewPhase = 'loaded'`，由 `onLoadEnd` 设置 | `WEBVIEW_STATUS_LABELS` |
| 「WebView 版本未知」 | 从未收到 `best-image-runtime` 消息 | `currentWebViewState?.version ?? '版本未知'` |

### 排除项（已通过代码确认）

- 应用内 `react-native-webview` 唯一使用位置就是 `best-image.tsx`，无其他页面可对比，但其他设备正常 → 代码本身没有问题
- 预览与导出两个 WebView 配置高度一致，唯一差异是导出 WebView 多 `androidLayerType="software"`，不影响桥接
- 无针对澎湃OS/HyperOS 的版本检测、平台分支、特性检测代码
- 未设置 `injectedJavaScriptBeforeContentLoaded`，HTML 内联脚本完全依赖原生 `addWebMessageListener` 注入的 `window.ReactNativeWebView` 桥
- release 包未开启 R8 混淆（`minifyEnabled false`），排除 ProGuard 移除 `@JavascriptInterface` 的可能
- release 包未设置 `networkSecurityConfig`，main manifest 也未设置 `usesCleartextTraffic`，但 baseUrl 是 HTTPS 不影响
- `load-best-image-assets.ts` 已将字体与 Rating 框转成 `data:` URI，规避 `file://` 资源在 HTTPS baseUrl 下的混合内容问题
- `MainApplication.kt` 没有任何 WebView 初始化或全局配置代码
- HTML 语法兼容（可选链、ResizeObserver、CSS inset 等）在其他设备上已验证正常
- `versionCode` 已从 1 提升到 2，问题仍存在

### 核心矛盾

HTML 已加载完成（`onLoadEnd` 触发 → `loaded` 状态），但页面内联脚本的所有 `postToNative` 调用全部失败：

- 没有发出 `best-image-runtime` 消息 → 版本未知
- 没有发出 `best-image-ready` 消息 → 30 秒后超时

关键证据在 [build-best-image-html.ts](../apps/mobile/src/features/best-image/build-best-image-html.ts) 内联脚本：

```javascript
const postToNative = (message) => {
  const bridge = window.ReactNativeWebView;
  if (!bridge || typeof bridge.postMessage !== 'function') return false;
  bridge.postMessage(JSON.stringify(message));
  return true;
};
```

该函数在 `window.ReactNativeWebView` 不存在或 `postMessage` 不是函数时**静默返回 false，不抛错、不重试**——这与现象完全吻合。

## 期望输出

为后续修复方向提供排查依据，并在用户允许改代码后可直接按本文件「修复方向」章节实施。

## 实际输出

### 最可能的根因（按可能性排序）

#### 主因：`WebViewCompat.addWebMessageListener` 在澎湃OS WebView 上注入失败或不可用

react-native-webview 13.15.0 的桥接逻辑（`RNCWebView.java` 254-277 行）：

```java
if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
    // 走 addWebMessageListener 主路径
    WebViewCompat.addWebMessageListener(webView, JAVASCRIPT_INTERFACE, Set.of("*"), ...);
} else {
    // fallback 到 addJavascriptInterface
    addJavascriptInterface(fallbackBridge, JAVASCRIPT_INTERFACE);
}
```

问题点：

- 澎湃OS 2.0.208.0 的 WebView（基于小米魔改的 Chromium）很可能报告支持 `WEB_MESSAGE_LISTENER` 特性，让代码走主路径
- 但实际注入的 `window.ReactNativeWebView.postMessage` 在 `loadDataWithBaseURL` 加载的 HTML 中不可用或不是函数
- 由于走了主路径，不会 fallback 到 `addJavascriptInterface`
- HTML 内联脚本中的 `postToNative` 检测到 `typeof bridge.postMessage !== 'function'` 后静默返回 false，不抛错
- 结果：HTML 加载完成（触发 `onLoadEnd` → `loaded` 状态），但零消息回传（版本未知 + 30 秒超时）

#### 加重因素：`loadDataWithBaseURL` 与 `addWebMessageListener` 的已知脆弱组合

`loadDataWithBaseURL` 加载的 HTML 字符串，页面 origin 处理在不同 WebView 实现上不一致：

- 标准 Android WebView：origin 通常为 `about:blank` 或 baseUrl 的 origin
- `addWebMessageListener` 的 `Set.of("*")` 通配符 origin 匹配在某些 WebView 实现上对 `about:blank` / data: 类 origin 处理有差异
- 澎湃OS WebView 在这块可能有 bug

#### 次要可能：澎湃OS对特定包名/versionCode 的阻断

社区证据确认澎湃OS部分版本会让特定 `applicationId` 与 `versionCode=1` 的应用 WebView 回调不打印日志、白屏。项目已将 `versionCode` 从 1 提升到 2，但问题仍存在——说明该设备的阻断条件可能不止 `versionCode=1`，或与 `applicationId="com.rranker.app"` 本身有关。

### 为什么其他设备正常

其他设备的 WebView（标准 Android System WebView 或 Chrome）对 `addWebMessageListener` 的实现是完整的，所以走主路径也能正常工作。

### 不改代码的验证方法

1. 检查澎湃OS设备 WebView 提供方：设置 → 应用管理 → 系统应用 → 找「Android System WebView」或「Mi Webview」/「Xiaomi WebView」，查看版本号。若存在小米自研 WebView 提供方，则确认是魔改 WebView 对 `addWebMessageListener` 支持有缺陷。
2. 切换 WebView 实现：开发者选项 → 「WebView实现」→ 尝试切换到「Android System WebView」。若切换后问题消失，确认是澎湃OS默认 WebView 提供方的问题。
3. 清除应用数据后重试，排除缓存/状态污染。
4. 在澎湃OS设备上安装 debug 版本验证：debug 默认开启 WebView 调试，可直接通过 Chrome Inspector 调试，确认 `window.ReactNativeWebView` 的状态。
5. 对比其他 RN 应用：在澎湃OS设备上安装任意使用 `react-native-webview` 加载 HTML 字符串的开源 RN 应用，看是否也复现桥接失效。

### 若允许改代码的修复方向（仅作建议，不擅自实施）

按优先级排序：

1. **强制走 `addJavascriptInterface` fallback**：通过 `patch-package` 修改 `RNCWebView.java`，跳过 `addWebMessageListener` 直接使用 `addJavascriptInterface`。或增加条件判断，仅澎湃OS设备走 fallback。`addJavascriptInterface` 是更老但更兼容的桥接方式，几乎所有 WebView 都支持。
2. **在 HTML 内联脚本增加诊断回传**：在 `postToNative` 失败时通过 `console.error` 输出，由原生 `WebChromeClient.onConsoleMessage` 接收并打印到 logcat。能在没有 Chrome Inspector 的情况下通过 logcat 看到失败原因。
3. **通过 `injectedJavaScriptBeforeContentLoaded` 显式注入桥探针**：在页面加载前打印 `window.ReactNativeWebView` 的状态，确认桥是否在 HTML 执行前就可用。
4. **更换 `baseUrl` 或改用 `loadUrl` 方案**：将 `baseUrl: 'https://assets2.lxns.net/'` 改为 `about:blank`，或将 HTML 写入临时文件后用 `loadUrl('file://...')` 加载，规避 `loadDataWithBaseURL` 与 `addWebMessageListener` 的 origin 处理差异。
5. **使用 `injectedJavaScript` 在 `onPageFinished` 后再次注入桥**：`RNCWebView.java` 的 `callInjectedJavaScript` 会在 `onPageFinished` 后执行 `injectedJS`，可在此处重新探测桥状态并重试 `postToNative`。

### 最终结论

最可能的根因是**澎湃OS 2.0.208.0 设备的 WebView（很可能为小米魔改的 WebView 提供方）对 `WebViewCompat.addWebMessageListener` 的支持有缺陷**——`WebViewFeature.isFeatureSupported(WEB_MESSAGE_LISTENER)` 返回 true，但实际注入的 `window.ReactNativeWebView.postMessage` 在 `loadDataWithBaseURL` 加载的 HTML 中不可用。由于代码走了主路径，不会 fallback 到更兼容的 `addJavascriptInterface`，导致 HTML 内联脚本的 `postToNative` 静默失败，最终表现就是「页面已载入（onLoadEnd 触发）、版本未知（runtime 消息没发出）、30 秒超时（ready 消息没发出）」。
