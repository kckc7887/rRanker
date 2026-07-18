import { fetch as expoFetch } from 'expo/fetch';
import type { DataSource, Player, ScoreRecord } from '@/domain/models';
import {
  LxnsEnvelopeSchema,
  LxnsPlayerSchema,
  LxnsScoreSchema,
  mapLxnsScore,
} from '@/domain/schemas';
import type { ProviderSession, ScoreProvider } from './contracts';
import { ProviderError, providerErrorFromStatus } from './errors';
import { LXNS_API_ROOT } from './lxns-config';
import {
  lxnsAccessTokenExpired,
  refreshLxnsAccessToken,
  type LxnsOAuthSession,
} from './lxns-oauth';

export type LxnsTokenRotationHandler = (session: LxnsOAuthSession) => void | Promise<void>;

function lxnsErrorFromStatus(status: number): ProviderError {
  const base = providerErrorFromStatus(status);
  return new ProviderError(
    base.code,
    base.message.replace('水鱼', '落雪'),
    base.retryable,
  );
}

export class LxnsScoreProvider implements ScoreProvider {
  private session: LxnsOAuthSession;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    session: ProviderSession,
    private readonly onTokensRotated?: LxnsTokenRotationHandler,
  ) {
    if (session.mode !== 'lxns-oauth') {
      throw new ProviderError('authentication', '落雪成绩读取需要 OAuth 会话', false);
    }
    this.session = session;
  }

  getSession(): LxnsOAuthSession {
    return this.session;
  }

  private source(): DataSource {
    return {
      kind: 'lxns',
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

  private async request(path: string): Promise<unknown> {
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
      if (!response.ok) {
        const error = lxnsErrorFromStatus(response.status);
        throw new ProviderError(error.code, `${error.message}（${path}）`, error.retryable, { cause: error });
      }
      const payload: unknown = await response.json();
      const envelope = LxnsEnvelopeSchema.safeParse(payload);
      if (!envelope.success) {
        throw new ProviderError('upstream_schema', '落雪响应结构与已验证契约不一致', true);
      }
      if (!envelope.data.success) {
        throw new ProviderError(
          'authentication',
          envelope.data.message ?? '落雪拒绝了本次请求',
          false,
        );
      }
      return envelope.data.data;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof SyntaxError) {
        throw new ProviderError('upstream_schema', '落雪返回了无效 JSON', true, { cause: error });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('timeout', '落雪读取超时', true, { cause: error });
      }
      throw new ProviderError('network', '无法连接落雪服务', true, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  async getPlayer(): Promise<Player> {
    const data = await this.request('/user/maimai/player');
    const player = LxnsPlayerSchema.safeParse(data);
    if (!player.success) {
      throw new ProviderError('upstream_schema', '落雪玩家响应结构与已验证契约不一致', true);
    }
    return {
      id: String(player.data.friend_code),
      displayName: player.data.name,
      rating: player.data.rating,
      presentation: {
        iconId: player.data.icon?.id,
        namePlateId: player.data.name_plate?.id,
        frameId: player.data.frame?.id,
        trophyName: player.data.trophy?.name,
        trophyColor: player.data.trophy?.color,
      },
      source: this.source(),
    };
  }

  async getRecords(): Promise<ScoreRecord[]> {
    const data = await this.request('/user/maimai/player/scores');
    if (!Array.isArray(data)) {
      throw new ProviderError('upstream_schema', '落雪成绩响应结构与已验证契约不一致', true);
    }
    const records: ScoreRecord[] = [];
    for (const item of data) {
      const parsed = LxnsScoreSchema.safeParse(item);
      if (!parsed.success) {
        throw new ProviderError('upstream_schema', '落雪成绩条目与已验证契约不一致', true);
      }
      // rRanker 当前成绩模型只有 SD / DX。落雪宴会场的 level_index
      // 按接口契约固定为 0，若继续映射会被错误显示成 BASIC。
      if (parsed.data.type === 'utage') continue;
      records.push(mapLxnsScore(parsed.data));
    }
    return records;
  }
}
