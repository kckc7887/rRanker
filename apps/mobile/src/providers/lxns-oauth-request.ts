import { fetch as expoFetch } from 'expo/fetch';
import { LxnsEnvelopeSchema } from '@/domain/schemas';
import { ProviderError, providerErrorFromStatus } from './errors';
import { LXNS_API_ROOT } from './lxns-config';
import {
  lxnsAccessTokenExpired,
  rotateLxnsTokens,
  type LxnsOAuthSession,
} from './lxns-oauth';

/** token 轮换成功后的回调：由调用方把新会话持久化到账号存储。 */
export type LxnsTokenRotationHandler = (session: LxnsOAuthSession) => void | Promise<void>;

/** 把通用 provider 状态码错误文案从「水鱼」改写为「落雪」品牌语义。 */
export function lxnsErrorFromStatus(status: number): ProviderError {
  const base = providerErrorFromStatus(status);
  return new ProviderError(
    base.code,
    base.message.replace('水鱼', '落雪'),
    base.retryable,
  );
}

/** 各游戏 provider 注入的差异化文案：envelope 校验失败、鉴权拒绝兜底、超时。 */
export type LxnsOAuthRequestTexts = {
  envelopeSchemaMessage: string;
  authRejectedFallback: string;
  timeoutMessage: string;
};

/**
 * LXNS OAuth 请求核心：持有会话并负责 token 互斥轮换（refreshPromise 去重，
 * 轮换走公共 rotateLxnsTokens），为落雪系 provider 提供同构的 Bearer 请求骨架。
 * request 返回 null 当且仅当 optional 分支命中（HTTP 404 / envelope code 404 / data 缺失）；
 * 非 optional 时上游 data 为 null/undefined 会原样透传，由调用方自行判别。
 */
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
        const next = await rotateLxnsTokens(this.session.refreshToken);
        this.session = next;
        await this.onTokensRotated?.(next);
      })().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;
    return this.session.accessToken;
  }

  async request(path: string, optional: boolean, texts: LxnsOAuthRequestTexts): Promise<unknown> {
    const accessToken = await this.ensureFreshAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await expoFetch(`${LXNS_API_ROOT}${path}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      });
      if (optional && response.status === 404) return null;
      if (!response.ok) {
        const error = lxnsErrorFromStatus(response.status);
        throw new ProviderError(error.code, `${error.message}（${path}）`, error.retryable, { cause: error });
      }
      const payload: unknown = await response.json();
      const envelope = LxnsEnvelopeSchema.safeParse(payload);
      if (!envelope.success) {
        throw new ProviderError('upstream_schema', texts.envelopeSchemaMessage, true);
      }
      if (!envelope.data.success) {
        if (optional && envelope.data.code === 404) return null;
        throw new ProviderError(
          'authentication',
          envelope.data.message ?? texts.authRejectedFallback,
          false,
        );
      }
      if (optional && (envelope.data.data === null || envelope.data.data === undefined)) return null;
      return envelope.data.data;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof SyntaxError) {
        throw new ProviderError('upstream_schema', '落雪返回了无效 JSON', true, { cause: error });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('timeout', texts.timeoutMessage, true, { cause: error });
      }
      throw new ProviderError('network', '无法连接落雪服务', true, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}
