export type ProviderErrorCode =
  | 'authentication' | 'permission' | 'rate_limit' | 'timeout'
  | 'upstream_schema' | 'no_data' | 'cache_corrupt' | 'network' | 'unknown';

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

export type ProviderUserMessages = Partial<Record<ProviderErrorCode, string>>;

const DEFAULT_PROVIDER_USER_MESSAGES: ProviderUserMessages = {
  authentication: '登录已失效，请重新绑定账号。',
  permission: '当前账号无法完成此操作。',
  rate_limit: '操作太频繁，请稍后再试。',
  timeout: '连接超时，请检查网络后重试。',
  network: '网络连接失败，请检查网络后重试。',
};

export function providerErrorToUserMessage(
  error: unknown,
  fallback: string,
  overrides?: ProviderUserMessages,
): string {
  if (!(error instanceof ProviderError)) return fallback;
  return overrides?.[error.code] ?? DEFAULT_PROVIDER_USER_MESSAGES[error.code] ?? fallback;
}

export type ProviderStatusTexts = {
  authentication?: string;
  permission?: string;
  noData?: string;
  rateLimit?: string;
  server?: string;
  fallback: { message: (status: number) => string; code?: ProviderErrorCode };
};

const DIVING_FISH_STATUS_TEXTS: Required<ProviderStatusTexts> = {
  authentication: '登录信息或 Token 无效',
  permission: '当前账号无权读取该数据',
  noData: '未找到玩家数据',
  rateLimit: '请求过于频繁，请稍后重试',
  server: '水鱼服务暂时不可用',
  fallback: { message: (status) => `水鱼返回 HTTP ${status}`, code: 'unknown' },
};

export function providerErrorFromStatus(status: number, texts?: ProviderStatusTexts): ProviderError {
  const t = texts ?? DIVING_FISH_STATUS_TEXTS;
  if (t.authentication !== undefined && (status === 400 || status === 401)) {
    return new ProviderError('authentication', t.authentication, false);
  }
  if (t.permission !== undefined && (status === 401 || status === 403)) {
    return new ProviderError('permission', t.permission, false);
  }
  if (t.noData !== undefined && status === 404) {
    return new ProviderError('no_data', t.noData, false);
  }
  if (t.rateLimit !== undefined && status === 429) {
    return new ProviderError('rate_limit', t.rateLimit, true);
  }
  if (t.server !== undefined && status >= 500) {
    return new ProviderError('network', t.server, true);
  }
  return new ProviderError(t.fallback.code ?? 'unknown', t.fallback.message(status), status >= 500);
}
