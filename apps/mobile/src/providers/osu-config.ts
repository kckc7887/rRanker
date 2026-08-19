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
/**
 * osu! 模组图标包（圆形徽章用单色 SVG）的远程根路径。
 * refer/osu-mod-icons.zip 内容（67 个 acronym 小写.svg）上传于该 S3 存储桶 mod-icon 路径下；
 * 图标按需下载并缓存到本地，未就绪时徽章回退显示模组缩写文字。
 */
export const OSU_MOD_ICONS_ROOT = 'https://rranker-osu-data.cn-nb1.rains3.com/mod-icon';
/** access token 提前刷新的缓冲（秒）。 */
export const OSU_TOKEN_REFRESH_SKEW_SECONDS = 60;
