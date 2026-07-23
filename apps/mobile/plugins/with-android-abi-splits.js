const {
  createRunOncePlugin,
  withAppBuildGradle,
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
 * prebuild 会重写 android/app/build.gradle，故用 config plugin 持久化。
 */
function withAndroidAbiSplits(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }

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
      anchor: /packagingOptions\s*\{/,
      offset: -1,
      comment: '//',
    });

    if (!result.didMerge) {
      throw new Error(
        `[${TAG}] 未能插入 ABI splits：找不到 packagingOptions 锚点`,
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
