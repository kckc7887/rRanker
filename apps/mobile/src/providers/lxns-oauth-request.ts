import { fetch as expoFetch } from 'expo/fetch';
import { LxnsEnvelopeSchema } from '@/domain/schemas';
import { ProviderError, providerErrorFromStatus, type ProviderStatusTexts } from './errors';
import { LXNS_API_ROOT } from './lxns-config';
import {
  lxnsAccessTokenExpired,
  rotateLxnsTokens,
  type LxnsOAuthSession,
} from './lxns-oauth';

/** token 轮换提交：被本次轮换消费掉的旧会话与轮换结果一起上报，提交方据此校验凭据世代。 */
export type LxnsTokenRotationUpdate = {
  /** 请求开始时的会话；其 refresh_token 已在上游被消费。 */
  previous: LxnsOAuthSession;
  next: LxnsOAuthSession;
};

/** token 轮换成功后的回调：由调用方按凭据世代校验后把新会话提交到账号存储。 */
export type LxnsTokenRotationHandler = (update: LxnsTokenRotationUpdate) => void | Promise<unknown>;

/** 落雪品牌的状态码文案：在协议层显式声明，不复用其它数据源的文案做字符串改写。 */
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

/** 各游戏 provider 注入的差异化文案：envelope 校验失败、鉴权拒绝兜底、超时。 */
export type LxnsOAuthRequestTexts = {
  envelopeSchemaMessage: string;
  authRejectedFallback: string;
  timeoutMessage: string;
};

/** 取消检查统一走这里：轮换与请求之间要复查多次，避免在方法里重复展开分支。 */
function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason;
}

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
    // 刷新可能耗时：轮换结果仍会为其它共享账号提交，但这次业务读取必须先重新确认取消。
    assertNotAborted(signal);
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });
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
      if (signal?.aborted) throw error;
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
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}
