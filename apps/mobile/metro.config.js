const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

for (const ext of ['css', 'html', 'wav', 'bundle']) {
  if (!config.resolver.assetExts.includes(ext)) {
    config.resolver.assetExts.push(ext);
  }
}

// Ionicons 字体子集化：@expo/vector-icons 内部 require 的 vendor 全量字体（约 381KB）
// 重定向到项目内子集字体 assets/fonts/Ionicons.ttf（scripts/subset-ionicons.mjs 生成，
// 约 7KB），使 Metro 资产与 expo-font 原生嵌入共用同一份子集文件，避免双份全量字体进包。
const IONICON_VENDOR_SUFFIX = ['vendor', 'react-native-vector-icons', 'Fonts', 'Ionicons.ttf'].join('/');
const IONICON_SUBSET_FONT = path.join(__dirname, 'assets', 'fonts', 'Ionicons.ttf');
const previousResolveRequest = config.resolver.resolveRequest;
const ZOD_ROOT = path.dirname(require.resolve('zod/package.json'));
const ZOD_LOCALE_INDEXES = new Set(['index.js', 'index.cjs'].map(
  (name) => path.join(ZOD_ROOT, 'v4', 'locales', name),
));
const ZOD_LOCALE_SUBSET = path.join(__dirname, 'src', 'utils', 'zod-locales.ts');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName.endsWith(IONICON_VENDOR_SUFFIX) &&
    context.originModulePath.includes(path.join('@expo', 'vector-icons'))
  ) {
    return context.resolveRequest(
      { ...context, resolveRequest: previousResolveRequest ?? undefined },
      IONICON_SUBSET_FONT,
      platform,
    );
  }
  const resolve = previousResolveRequest ?? context.resolveRequest;
  const result = resolve(context, moduleName, platform);
  if (
    (platform === 'android' || platform === 'ios') &&
    result.type === 'sourceFile' &&
    ZOD_LOCALE_INDEXES.has(path.normalize(result.filePath)) &&
    context.originModulePath.startsWith(ZOD_ROOT + path.sep)
  ) {
    return resolve(context, ZOD_LOCALE_SUBSET, platform);
  }
  return result;
};

module.exports = config;
