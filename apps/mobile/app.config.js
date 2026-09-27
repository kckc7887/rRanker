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

/**
 * app.json 提供版本、包名与插件列表；动态配置按优化模式设置 Android 插件参数。
 * 构建提交身份、优化模式与 osu! OAuth 应用凭据经 extra 注入应用。
 * osu! 凭据缺失时换码或令牌轮换明确报错；客户端构建注入不具备服务端保密性。
 */
module.exports = {
  ...base,
  expo: {
    ...base.expo,
    plugins: base.expo.plugins.map(plugin => plugin === './plugins/with-android-abi-splits.js'
      ? [plugin, optimizationModes[optimizationMode]] : plugin),
    extra: {
      ...base.expo.extra,
      osuOAuthClientSecret: process.env.OSU_OAUTH_CLIENT_SECRET ?? '',
      buildCommit: process.env.BUILD_SOURCE_COMMIT ?? '',
      androidOptimizationMode: optimizationMode,
    },
  },
};
