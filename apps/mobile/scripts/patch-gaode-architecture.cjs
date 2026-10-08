const { readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

/** Expo 启动会广播 OnCreate；无原生库的架构不得恢复高德 SDK。 */
const target = join(dirname(require.resolve('expo-gaode-map/package.json')),
  'android/src/main/java/expo/modules/gaodemap/modules/SDKInitializer.kt');
const source = readFileSync(target, 'utf8');
const original = 'fun restorePersistedState(context: Context) {';
const replacement = `${original}
        if (android.os.Build.SUPPORTED_ABIS.firstOrNull() !in listOf("arm64-v8a", "armeabi-v7a")) return`;
if (!source.includes(replacement)) {
  if (!source.includes(original)) throw new Error('找不到高德 SDK 状态恢复入口');
  writeFileSync(target, source.replace(original, replacement), 'utf8');
}

/** 与宿主使用同一 NDK，避免 AGP 回退下载另一版本。 */
const gradlePath = join(dirname(require.resolve('expo-gaode-map/package.json')), 'android/build.gradle');
const gradle = readFileSync(gradlePath, 'utf8');
const ndk = '  ndkVersion rootProject.ext.ndkVersion';
if (!gradle.includes(ndk)) {
  if (!gradle.includes('android {')) throw new Error('找不到高德 Android 构建配置');
  writeFileSync(gradlePath, gradle.replace('android {', `android {\n${ndk}`), 'utf8');
}
