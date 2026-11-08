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

module.exports = ({ config }) => ({
  ...config,
  icon: require.resolve('@rranker/sdk/assets/icon.png'),
  plugins: [
    ...config.plugins.map(plugin => plugin === './plugins/with-android-abi-splits.js'
      ? [plugin, optimizationModes[optimizationMode]] : plugin),
  ],
  /** extra 随客户端打包，不能作为服务端秘密。 */
  extra: {
    ...config.extra,
    buildCommit: process.env.BUILD_SOURCE_COMMIT ?? '',
    androidOptimizationMode: optimizationMode,
  },
});
