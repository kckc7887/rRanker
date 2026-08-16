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

/**
 * providerErrorFromStatus 的各分支文案：传入后接管全部状态码分支，
 * 未列出的分支不生效（对应状态码落入兜底），用于表达各游戏不同的分支结构
 * （如 phira/dxrating 无 401/403 分支、dxrating 兜底 code 为 network）。
 * 完全不传 texts 时逐字回退水鱼缺省版。
 */
export type ProviderStatusTexts = {
  /** 400/401 → authentication（不可重试） */
  authentication?: string;
  /** 401/403 → permission（不可重试）；401 在提供 authentication 时优先走 authentication */
  permission?: string;
  /** 404 → no_data（不可重试） */
  noData?: string;
  /** 429 → rate_limit（可重试） */
  rateLimit?: string;
  /** ≥500 → network（可重试） */
  server?: string;
  /** 其余状态码兜底；code 缺省 'unknown'，retryable 与水鱼版一致（≥500 已被 server 捕获，实际恒 false） */
  fallback: { message: (status: number) => string; code?: ProviderErrorCode };
};

/** 水鱼缺省文案：不传 texts 时逐字等于参数化前的原实现。 */
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
