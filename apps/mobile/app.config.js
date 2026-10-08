const base = require('./app.json');

const optimizationModes = {
  A: { minify: true, shrink: true, optimize: true },
  B: { minify: false, shrink: false, optimize: false },
  C: { minify: true, shrink: false, optimize: false },
  D: { minify: true, shrink: false, optimize: true },
};
const optimizationMode = process.env.ANDROID_OPTIMIZATION_MODE ?? 'A';
if (!Object.hasOwn(optimizationModes, optimizationMode)) {
  throw new Error('Invalid ANDROID_OPTIMIZATION_MODE');
}

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    plugins: [
      ...base.expo.plugins.map(plugin => plugin === './plugins/with-android-abi-splits.js'
        ? [plugin, optimizationModes[optimizationMode]] : plugin),
      ['expo-gaode-map', { androidKey: process.env.AMAP_ANDROID_KEY ?? '', enableLocation: false }],
    ],
    /** extra 随客户端打包，不能作为服务端秘密。 */
    extra: {
      ...base.expo.extra,
      osuOAuthClientSecret: process.env.OSU_OAUTH_CLIENT_SECRET ?? '',
      buildCommit: process.env.BUILD_SOURCE_COMMIT ?? '',
      androidOptimizationMode: optimizationMode,
    },
  },
};
