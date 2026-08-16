/** 落雪 OAuth 公开配置。不要把 client_secret 写入本仓库或 App。 */
export const LXNS_OAUTH_CLIENT_ID = 'd8764370-02ab-4035-b3d8-0d8cac1ee504';
export const LXNS_OAUTH_REDIRECT_URI = 'rranker://oauth/lxns';
export const LXNS_OAUTH_SCOPE = 'read_user_profile write_player read_player';
export const LXNS_OAUTH_AUTHORIZE_URL = 'https://maimai.lxns.net/oauth/authorize';
export const LXNS_OAUTH_TOKEN_URL = 'https://maimai.lxns.net/api/v0/oauth/token';
export const LXNS_API_ROOT = 'https://maimai.lxns.net/api/v0';
/** access token 提前刷新的缓冲（秒）。 */
export const LXNS_TOKEN_REFRESH_SKEW_SECONDS = 60;
