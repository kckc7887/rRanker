const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.dirname(require.resolve('react-native-webview/package.json'));
const javaPath = path.join(packageRoot, 'android/src/main/java/com/reactnativecommunity/webview/RNCWebView.java');
const original = 'if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){';
const replacement = [
  '/** HyperOS 的消息监听器可能无法暴露桥接对象。 */',
  '        boolean useLegacyBridge = "Xiaomi".equalsIgnoreCase(android.os.Build.MANUFACTURER);',
  '        if (!useLegacyBridge && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){',
].join('\n');

let java = fs.readFileSync(javaPath, 'utf8');
if (java.includes('if (!useLegacyBridge && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){')) {
  console.log('react-native-webview Xiaomi bridge patch already applied');
} else if (java.includes(original)) {
  java = java.replace(original, replacement);
  fs.writeFileSync(javaPath, java);
  console.log('Applied react-native-webview Xiaomi bridge compatibility patch');
} else {
  throw new Error('react-native-webview bridge implementation changed; Xiaomi compatibility patch was not applied.');
}

const originalDestroy = [
  '    public void destroy() {',
  '        if (mWebChromeClient != null) {',
  '            mWebChromeClient.onHideCustomView();',
  '        }',
  '        super.destroy();',
  '    }',
].join('\n');
const replacementDestroy = originalDestroy.replace('        super.destroy();', [
  '        android.view.ViewParent parent = getParent();',
  '        if (parent instanceof android.view.ViewGroup) {',
  '            android.view.ViewGroup viewGroup = (android.view.ViewGroup) parent;',
  '            viewGroup.removeView(this);',
  '            viewGroup.endViewTransition(this);',
  '        }',
  '        super.destroy();',
].join('\n'));

if (java.includes(replacementDestroy)) {
  console.log('react-native-webview detach patch already applied');
} else if (java.includes(originalDestroy)) {
  fs.writeFileSync(javaPath, java.replace(originalDestroy, replacementDestroy));
  console.log('Applied react-native-webview detach patch');
} else {
  throw new Error('react-native-webview destroy implementation changed; detach patch was not applied.');
}
