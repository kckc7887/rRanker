import Constants from 'expo-constants';

/** osu! 换码要求 client_secret，由构建配置注入。 */
export const OSU_OAUTH_CLIENT_ID = '65933';

function readExtraSecret(): string {
  try {
    const extra = Constants.expoConfig?.extra as { osuOAuthClientSecret?: unknown } | undefined;
    return typeof extra?.osuOAuthClientSecret === 'string' ? extra.osuOAuthClientSecret : '';
  } catch {
    return '';
  }
}

export function osuOAuthClientSecret(): string {
  return readExtraSecret() || process.env.OSU_OAUTH_CLIENT_SECRET || '';
}
export const OSU_OAUTH_REDIRECT_URI = 'rranker://oauth/osu';
export const OSU_OAUTH_SCOPE = 'identify public';
export const OSU_OAUTH_AUTHORIZE_URL = 'https://osu.ppy.sh/oauth/authorize';
export const OSU_OAUTH_TOKEN_URL = 'https://osu.ppy.sh/oauth/token';
export const OSU_API_ROOT = 'https://osu.ppy.sh/api/v2';
export const OSU_BEATMAPSET_DOWNLOAD_ROOT = 'https://dl.sayobot.cn/beatmaps/download';
export const OSU_MOD_ICONS_ROOT = 'https://rranker-osu-data.cn-nb1.rains3.com/mod-icon';
export const OSU_TOKEN_REFRESH_SKEW_SECONDS = 60;
