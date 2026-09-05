const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.dirname(require.resolve('react-native-webview/package.json'));
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const javaPath = path.join(packageRoot, 'android/src/main/java/com/reactnativecommunity/webview/RNCWebView.java');
const original = 'if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){';
const replacement = [
  '// HyperOS may report WEB_MESSAGE_LISTENER support while failing to expose the bridge.',
  '        // The legacy interface is limited to rRanker-controlled local HTML on Xiaomi devices.',
  '        boolean useLegacyBridge = "Xiaomi".equalsIgnoreCase(android.os.Build.MANUFACTURER);',
  '        if (!useLegacyBridge && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){',
].join('\n');

if (packageJson.version !== '13.16.1') {
  throw new Error(`Unsupported react-native-webview version ${packageJson.version}; review the Xiaomi bridge patch before upgrading.`);
}

const java = fs.readFileSync(javaPath, 'utf8');
const patchedCount = java.split(replacement).length - 1;
const originalCount = java.replace(replacement, '').split(original).length - 1;
if (patchedCount === 1 && originalCount === 0) {
  console.log('react-native-webview Xiaomi bridge patch already applied');
} else if (patchedCount === 0 && originalCount === 1) {
  fs.writeFileSync(javaPath, java.replace(original, replacement));
  console.log('Applied react-native-webview Xiaomi bridge compatibility patch');
} else {
  throw new Error('react-native-webview bridge implementation changed; Xiaomi compatibility patch was not applied.');
}
