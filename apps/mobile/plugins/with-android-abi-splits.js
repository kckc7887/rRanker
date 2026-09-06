const {
  createRunOncePlugin,
  withAppBuildGradle,
  withGradleProperties,
} = require('expo/config-plugins');
const {
  mergeContents,
} = require('@expo/config-plugins/build/utils/generateCode');

const TAG = 'rranker-android-abi-splits';

const SPLITS_BLOCK = `    splits {
        abi {
            enable true
            reset()
            include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
            universalApk false
        }
    }`;

/**
 * 一次 assembleRelease 按 ABI 各出一份 APK，避免四合一 fat 包。
 * prebuild 会重写原生文件；分包、R8 和资源裁剪必须由同一插件持久化。
 */
function withAndroidAbiSplits(config) {
  config = withGradleProperties(config, (config) => {
    for (const key of ['android.enableMinifyInReleaseBuilds', 'android.enableShrinkResourcesInReleaseBuilds']) {
      config.modResults = config.modResults.filter(entry => entry.type !== 'property' || entry.key !== key);
      config.modResults.push({ type: 'property', key, value: 'true' });
    }
    return config;
  });
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(`[${TAG}] Unsupported app build script language`);
    }

    const original = config.modResults.contents;
    if (!/getDefaultProguardFile\(["']proguard-android(?:-optimize)?\.txt["']\)/.test(original)) {
      throw new Error(`[${TAG}] Default ProGuard configuration not found`);
    }
    config.modResults.contents = original.replace(
      /getDefaultProguardFile\((["'])proguard-android\.txt\1\)/g,
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );
    const src = config.modResults.contents;
    if (src.includes(`@generated begin ${TAG}`)) {
      return config;
    }

    // 手工已写入但无标记时避免重复插入
    if (/\bsplits\s*\{\s*\n\s*abi\s*\{/.test(src)) {
      return config;
    }

    const result = mergeContents({
      src,
      newSrc: SPLITS_BLOCK,
      tag: TAG,
      anchor: /^android\s*\{\s*$/,
      offset: 1,
      comment: '//',
    });

    if (!result.didMerge) {
      throw new Error(
        `[${TAG}] 未能插入 ABI splits：找不到 android 锚点`,
      );
    }

    config.modResults.contents = result.contents;
    return config;
  });
}

module.exports = createRunOncePlugin(
  withAndroidAbiSplits,
  'with-android-abi-splits',
  '1.0.0',
);
