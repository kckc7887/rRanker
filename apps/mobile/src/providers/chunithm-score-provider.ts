import { fetch as expoFetch } from 'expo/fetch';
import {
  ChunithmBestsSchema,
  ChunithmPlayerSchema,
  ChunithmScoreSchema,
  emptyChunithmBests,
  type ChunithmBests,
  type ChunithmPersonalSnapshot,
  type ChunithmPlayer,
  type ChunithmScore,
} from '@/domain/chunithm-personal';
import { LxnsEnvelopeSchema } from '@/domain/schemas';
import type { ProviderSession } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';
import { LXNS_API_ROOT } from './lxns-config';
import {
  lxnsAccessTokenExpired,
  refreshLxnsAccessToken,
  type LxnsOAuthSession,
} from './lxns-oauth';
import type { LxnsTokenRotationHandler } from './lxns-score-provider';

type OptionalResponse = { found: boolean; data?: unknown };

function lxnsErrorFromStatus(status: number): ProviderError {
  const base = providerErrorFromStatus(status);
  return new ProviderError(
    base.code,
    base.message.replace('水鱼', '落雪'),
    base.retryable,
  );
}

export class ChunithmScoreProvider {
  private session: LxnsOAuthSession;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    session: ProviderSession,
    private readonly onTokensRotated?: LxnsTokenRotationHandler,
  ) {
    if (session.mode !== 'lxns-oauth') {
      throw new ProviderError('authentication', '中二节奏落雪读取需要 OAuth 会话', false);
    }
    this.session = session;
  }

  getSession(): LxnsOAuthSession {
    return this.session;
  }

  private source() {
    return {
      kind: 'lxns' as const,
      label: '落雪咖啡屋',
      updatedAt: new Date().toISOString(),
      isStale: false,
    };
  }

  private async ensureFreshAccessToken(): Promise<string> {
    if (!lxnsAccessTokenExpired(this.session)) return this.session.accessToken;
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const next = await refreshLxnsAccessToken(this.session.refreshToken);
        this.session = next;
        await this.onTokensRotated?.(next);
      })().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;
    return this.session.accessToken;
  }

  private async request(path: string, optional = false): Promise<OptionalResponse> {
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
      if (optional && response.status === 404) return { found: false };
      if (!response.ok) {
        const error = lxnsErrorFromStatus(response.status);
        throw new ProviderError(error.code, `${error.message}（${path}）`, error.retryable, { cause: error });
      }
      const payload: unknown = await response.json();
      const envelope = LxnsEnvelopeSchema.safeParse(payload);
      if (!envelope.success) {
        throw new ProviderError('upstream_schema', '落雪中二响应结构与已验证契约不一致', true);
      }
      if (!envelope.data.success) {
        if (optional && envelope.data.code === 404) return { found: false };
        throw new ProviderError(
          'authentication',
          envelope.data.message ?? '落雪拒绝了本次中二请求',
          false,
        );
      }
      if (optional && (envelope.data.data === null || envelope.data.data === undefined)) {
        return { found: false };
      }
      return { found: true, data: envelope.data.data };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof SyntaxError) {
        throw new ProviderError('upstream_schema', '落雪返回了无效 JSON', true, { cause: error });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('timeout', '落雪中二读取超时', true, { cause: error });
      }
      throw new ProviderError('network', '无法连接落雪服务', true, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  async getPlayer(): Promise<ChunithmPlayer | null> {
    const result = await this.request('/user/chunithm/player', true);
    if (!result.found) return null;
    const parsed = ChunithmPlayerSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new ProviderError('upstream_schema', '落雪中二玩家响应结构与已验证契约不一致', true);
    }
    return parsed.data;
  }

  async getScores(): Promise<ChunithmScore[]> {
    const result = await this.request('/user/chunithm/player/scores', true);
    if (!result.found) return [];
    if (!Array.isArray(result.data)) {
      throw new ProviderError('upstream_schema', '落雪中二成绩响应结构与已验证契约不一致', true);
    }
    return result.data.map((item) => {
      const parsed = ChunithmScoreSchema.safeParse(item);
      if (!parsed.success) {
        throw new ProviderError('upstream_schema', '落雪中二成绩条目与已验证契约不一致', true);
      }
      return parsed.data;
    });
  }

  async getBests(): Promise<ChunithmBests> {
    const result = await this.request('/user/chunithm/player/bests', true);
    if (!result.found) return emptyChunithmBests();
    const parsed = ChunithmBestsSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new ProviderError('upstream_schema', '落雪中二 B50 响应结构与已验证契约不一致', true);
    }
    return {
      bests: parsed.data.bests,
      selections: parsed.data.selections,
      new_bests: parsed.data.new_bests,
    };
  }

  async getSnapshot(): Promise<ChunithmPersonalSnapshot> {
    const [player, scores, bests] = await Promise.all([
      this.getPlayer(),
      this.getScores(),
      this.getBests(),
    ]);
    return {
      player,
      scores,
      bests,
      source: this.source(),
    };
  }
}
