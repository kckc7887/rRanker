const base = require('./app.json');

/**
 * Expo 动态配置：app.json 仍是静态配置的唯一来源（含版本、包名、插件）。
 * 本文件只叠加构建时注入的 osu! OAuth 应用凭据（EAS Secret / CI Secret / 本地环境变量），
 * 经 Constants.expoConfig.extra 进入应用；缺失时 osu! 授权会明确报错，不会静默使用空凭据。
 */
module.exports = {
  ...base,
  expo: {
    ...base.expo,
    extra: {
      ...base.expo.extra,
      osuOAuthClientSecret: process.env.OSU_OAUTH_CLIENT_SECRET ?? '',
    },
  },
};
