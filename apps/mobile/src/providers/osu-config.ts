/**
 * osu! OAuth 配置（闭源随包内置，经用户确认）。
 * osu! API 换 token 必须携带 client_secret（无 PKCE 模式）。
 */
export const OSU_OAUTH_CLIENT_ID = '65933';
export const OSU_OAUTH_CLIENT_SECRET = 'sReah02QEDvoCeQxzObA7HLw968zbsZWDPYk38RS';
export const OSU_OAUTH_REDIRECT_URI = 'rranker://oauth/osu';
export const OSU_OAUTH_SCOPE = 'identify public';
export const OSU_OAUTH_AUTHORIZE_URL = 'https://osu.ppy.sh/oauth/authorize';
export const OSU_OAUTH_TOKEN_URL = 'https://osu.ppy.sh/oauth/token';
export const OSU_API_ROOT = 'https://osu.ppy.sh/api/v2';
/** access token 提前刷新的缓冲（秒）。 */
export const OSU_TOKEN_REFRESH_SKEW_SECONDS = 60;
