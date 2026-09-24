import Constants from 'expo-constants';

/**
 * osu! OAuth 配置。
 * osu! API 换 token 必须携带 client_secret（无 PKCE 模式）。
 * 该凭据只在构建时经 app.config.js 注入 extra，随包内置是已知取舍；
 * 公开源码、日志与文档里不得出现真实凭据值。
 */
export const OSU_OAUTH_CLIENT_ID = '65933';

function readExtraSecret(): string {
  try {
    const extra = Constants.expoConfig?.extra as { osuOAuthClientSecret?: unknown } | undefined;
    return typeof extra?.osuOAuthClientSecret === 'string' ? extra.osuOAuthClientSecret : '';
  } catch {
    return '';
  }
}

/** 构建注入的 osu! 应用凭据；调用时读取。测试经 OSU_OAUTH_CLIENT_SECRET 环境变量提供。 */
export function osuOAuthClientSecret(): string {
  return readExtraSecret() || process.env.OSU_OAUTH_CLIENT_SECRET || '';
}
export const OSU_OAUTH_REDIRECT_URI = 'rranker://oauth/osu';
export const OSU_OAUTH_SCOPE = 'identify public';
export const OSU_OAUTH_AUTHORIZE_URL = 'https://osu.ppy.sh/oauth/authorize';
export const OSU_OAUTH_TOKEN_URL = 'https://osu.ppy.sh/oauth/token';
export const OSU_API_ROOT = 'https://osu.ppy.sh/api/v2';
export const OSU_BEATMAPSET_DOWNLOAD_ROOT = 'https://dl.sayobot.cn/beatmaps/download';
/**
 * osu! 模组图标包（圆形徽章用单色 SVG）的远程根路径。
 * 图标按小写 acronym 命名，使用 .svg 扩展名；
 * 图标按需下载并缓存到本地，未就绪时徽章回退显示模组缩写文字。
 */
export const OSU_MOD_ICONS_ROOT = 'https://rranker-osu-data.cn-nb1.rains3.com/mod-icon';
/** access token 提前刷新的缓冲（秒）。 */
export const OSU_TOKEN_REFRESH_SKEW_SECONDS = 60;
