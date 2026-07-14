/** 落雪 OAuth 公开配置。不要把 client_secret 写入本仓库或 App。 */
export const LXNS_OAUTH_CLIENT_ID = 'd52cfb09-7ee8-4aab-a165-e1565b7156b1';
export const LXNS_OAUTH_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
export const LXNS_OAUTH_SCOPE = 'read_user_profile write_player read_player';
export const LXNS_OAUTH_AUTHORIZE_URL = 'https://maimai.lxns.net/oauth/authorize';
export const LXNS_OAUTH_TOKEN_URL = 'https://maimai.lxns.net/api/v0/oauth/token';
export const LXNS_API_ROOT = 'https://maimai.lxns.net/api/v0';
/** access token 提前刷新的缓冲（秒）。 */
export const LXNS_TOKEN_REFRESH_SKEW_SECONDS = 60;
