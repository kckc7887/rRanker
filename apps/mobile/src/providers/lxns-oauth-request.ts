import { fetch as expoFetch } from 'expo/fetch';
import { LxnsEnvelopeSchema } from '@/domain/schemas';
import { ProviderError, providerErrorFromStatus, type ProviderStatusTexts } from './errors';
import { requestJson } from './http-json';
import { LXNS_API_ROOT } from './lxns-config';
import {
  lxnsAccessTokenExpired,
  rotateLxnsTokens,
  type LxnsOAuthSession,
} from './lxns-oauth';

export type LxnsTokenRotationUpdate = {
  previous: LxnsOAuthSession;
  next: LxnsOAuthSession;
};

export type LxnsTokenRotationHandler = (update: LxnsTokenRotationUpdate) => void | Promise<unknown>;

const LXNS_STATUS_TEXTS: ProviderStatusTexts = {
  authentication: '登录信息或 Token 无效',
  permission: '当前账号无权读取该数据',
  noData: '未找到玩家数据',
  rateLimit: '请求过于频繁，请稍后重试',
  server: '落雪服务暂时不可用',
  fallback: { message: (status) => `落雪返回 HTTP ${status}`, code: 'unknown' },
};

export function lxnsErrorFromStatus(status: number): ProviderError {
  return providerErrorFromStatus(status, LXNS_STATUS_TEXTS);
}

export type LxnsOAuthRequestTexts = {
  envelopeSchemaMessage: string;
  authRejectedFallback: string;
  timeoutMessage: string;
};

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason;
}

export class LxnsOAuthRequestCore {
  private session: LxnsOAuthSession;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    session: LxnsOAuthSession,
    private readonly onTokensRotated?: LxnsTokenRotationHandler,
  ) {
    this.session = session;
  }

  getSession(): LxnsOAuthSession {
    return this.session;
  }

  private async ensureFreshAccessToken(): Promise<string> {
    if (!lxnsAccessTokenExpired(this.session)) return this.session.accessToken;
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const previous = this.session;
        const next = await rotateLxnsTokens(previous.refreshToken);
        this.session = next;
        await this.onTokensRotated?.({ previous, next });
      })().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;
    return this.session.accessToken;
  }

  async request(
    path: string,
    optional: boolean,
    texts: LxnsOAuthRequestTexts,
    signal?: AbortSignal,
  ): Promise<unknown> {
    assertNotAborted(signal);
    const accessToken = await this.ensureFreshAccessToken();
    /** 轮换仍须保存，但已取消的业务请求不能继续读取。 */
    assertNotAborted(signal);
    try {
      const envelope = await requestJson({
        baseUrl: LXNS_API_ROOT, path, schema: LxnsEnvelopeSchema,
        fetcher: expoFetch as unknown as typeof fetch, label: '落雪', signal,
        authenticated: true, totalAttempts: 1, error: lxnsErrorFromStatus,
        messages: { schema: texts.envelopeSchemaMessage, timeout: texts.timeoutMessage, network: '无法连接落雪服务' },
        init: { headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        } },
      });
      if (!envelope.success) {
        if (optional && envelope.code === 404) return null;
        throw new ProviderError(
          'authentication',
          envelope.message ?? texts.authRejectedFallback,
          false,
        );
      }
      if (optional && (envelope.data === null || envelope.data === undefined)) return null;
      return envelope.data;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (optional && error instanceof ProviderError && error.code === 'no_data') return null;
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('network', '无法连接落雪服务', true, { cause: error });
    }
  }
}
