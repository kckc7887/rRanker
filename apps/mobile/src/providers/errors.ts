import { SessionPersistenceError } from '@/domain/session-vault';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';

export type ProviderErrorCode =
  | 'authentication' | 'permission' | 'rate_limit' | 'timeout'
  | 'upstream_schema' | 'no_data' | 'cache_corrupt' | 'network' | 'unknown'
  | 'authorization_prepare' | 'authorization_open' | 'authorization_callback'
  | 'verification' | 'configuration' | 'credential_storage' | 'local_commit';

export class ProviderError extends Error {
  readonly retryAfterSeconds?: number;
  readonly needsCode?: boolean;
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    options?: ErrorOptions & { retryAfterSeconds?: number; needsCode?: boolean },
  ) {
    super(message, options);
    this.name = 'ProviderError';
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.needsCode = options?.needsCode;
  }
}

export type ProviderUserMessages = Partial<Record<ProviderErrorCode, string>>;

const DEFAULT_PROVIDER_USER_MESSAGES: ProviderUserMessages = {
  authentication: '登录已失效，请重新绑定账号。',
  permission: '当前账号无法完成此操作。',
  rate_limit: '操作太频繁，请稍后再试。',
  timeout: '连接超时，请检查网络后重试。',
  network: '网络连接失败，请检查网络后重试。',
  authorization_prepare: '无法准备授权，请重试；若仍失败，请查看诊断。',
  authorization_open: '无法打开授权页面，请检查浏览器后重试。',
  authorization_callback: '授权回调校验失败，请在 App 内重新发起授权。',
  verification: '远端账号验证失败，请稍后重试。',
  configuration: '当前构建缺少应用凭据，无法完成授权。',
  credential_storage: '无法安全保存账号凭据，请重试；若仍失败，请查看诊断。',
  local_commit: '无法保存本机账号信息，请重试；若仍失败，请查看诊断。',
};

/** 已分类的网络或存储错误保留原阶段；原生错误只展示当前操作的固定文案。 */
export async function runProviderOperation<T>(code: ProviderErrorCode, action: () => T | Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const classified = error instanceof ProviderError || error instanceof SessionPersistenceError ? error
      : new ProviderError(code, DEFAULT_PROVIDER_USER_MESSAGES[code] ?? '账号操作失败，请重试。', false, { cause: error });
    void recordRuntimeDiagnostic('binding', { source: 'account-binding', phase: code, result: 'error', errorCode: classified.code, error: classified });
    throw classified;
  }
}

export function providerErrorToUserMessage(
  error: unknown,
  fallback: string,
  overrides?: ProviderUserMessages,
): string {
  if (!(error instanceof ProviderError) && !(error instanceof SessionPersistenceError)) return fallback;
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
