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

export function providerErrorFromStatus(status: number): ProviderError {
  if (status === 400 || status === 401) return new ProviderError('authentication', '登录信息或 Token 无效', false);
  if (status === 403) return new ProviderError('permission', '当前账号无权读取该数据', false);
  if (status === 404) return new ProviderError('no_data', '未找到玩家数据', false);
  if (status === 429) return new ProviderError('rate_limit', '请求过于频繁，请稍后重试', true);
  if (status >= 500) return new ProviderError('network', '水鱼服务暂时不可用', true);
  return new ProviderError('unknown', `水鱼返回 HTTP ${status}`, status >= 500);
}
