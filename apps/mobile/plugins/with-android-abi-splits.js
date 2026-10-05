const {
  createRunOncePlugin,
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
} = require('expo/config-plugins');
const {
  mergeContents,
} = require('@expo/config-plugins/build/utils/generateCode');
const fs = require('node:fs/promises');
const path = require('node:path');

const TAG = 'rranker-android-abi-splits';

const SPLITS_BLOCK = `    splits {
        abi {
            enable true
            reset()
            include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
            universalApk false
        }
    }`;

/** prebuild 会重写原生文件，分包和 R8 设置在此注入。 */
function withAndroidAbiSplits(config, options = {}) {
  const { minify = true, shrink = true, optimize = true } = options;
  config = withDangerousMod(config, ['android', async (config) => {
    const file = path.join(config.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    const contents = await fs.readFile(file, 'utf8');
    /** Expo Record 注解通过反射创建，R8 full mode 必须保留。 */
    const rule = '-keep @interface expo.modules.kotlin.records.** { *; }';
    if (!contents.includes(rule)) await fs.writeFile(file, `${contents.trimEnd()}\n\n${rule}\n`);
    return config;
  }]);
  config = withGradleProperties(config, (config) => {
    for (const key of ['android.enableMinifyInReleaseBuilds', 'android.enableShrinkResourcesInReleaseBuilds']) {
      config.modResults = config.modResults.filter(entry => entry.type !== 'property' || entry.key !== key);
      config.modResults.push({ type: 'property', key, value: String(key.includes('Minify') ? minify : shrink) });
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
      /getDefaultProguardFile\((["'])proguard-android(?:-optimize)?\.txt\1\)/g,
      `getDefaultProguardFile("proguard-android${optimize ? '-optimize' : ''}.txt")`,
    );
    const src = config.modResults.contents;
    if (src.includes(`@generated begin ${TAG}`)) {
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
