import type { DataSource, Player, ScoreRecord } from '@/domain/models';
import { normalizeLxnsCourseRank } from '@/domain/maimai-course-rank';
import {
  LxnsPlayerSchema,
  LxnsScoreSchema,
  mapLxnsScore,
} from '@/domain/schemas';
import type { ProviderSession, ScoreProvider } from './contracts';
import { ProviderError } from './errors';
import {
  LxnsOAuthRequestCore,
  type LxnsOAuthRequestTexts,
  type LxnsTokenRotationHandler,
} from './lxns-oauth-request';
import type { LxnsOAuthSession } from './lxns-oauth';

export type { LxnsTokenRotationHandler } from './lxns-oauth-request';

const LXNS_REQUEST_TEXTS: LxnsOAuthRequestTexts = {
  envelopeSchemaMessage: '落雪响应结构与已验证契约不一致',
  authRejectedFallback: '落雪拒绝了本次请求',
  timeoutMessage: '落雪读取超时',
};

export class LxnsScoreProvider implements ScoreProvider {
  private readonly oauth: LxnsOAuthRequestCore;

  constructor(
    session: ProviderSession,
    onTokensRotated?: LxnsTokenRotationHandler,
  ) {
    if (session.mode !== 'lxns-oauth') {
      throw new ProviderError('authentication', '落雪成绩读取需要 OAuth 会话', false);
    }
    this.oauth = new LxnsOAuthRequestCore(session, onTokensRotated);
  }

  getSession(): LxnsOAuthSession {
    return this.oauth.getSession();
  }

  private source(): DataSource {
    return {
      kind: 'lxns',
      label: '落雪咖啡屋',
      updatedAt: new Date().toISOString(),
      isStale: false,
    };
  }

  private async request(path: string, optional = false): Promise<unknown | null> {
    return this.oauth.request(path, optional, LXNS_REQUEST_TEXTS);
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
      extension: {
        kind: 'maimai',
        courseRank: normalizeLxnsCourseRank(player.data.course_rank),
      },
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

  async getOptionalPlayer(): Promise<Player | null> {
    const data = await this.request('/user/maimai/player', true);
    if (data === null) return null;
    const player = LxnsPlayerSchema.safeParse(data);
    if (!player.success) {
      throw new ProviderError('upstream_schema', '落雪玩家响应结构与已验证契约不一致', true);
    }
    return {
      id: String(player.data.friend_code),
      displayName: player.data.name,
      rating: player.data.rating,
      extension: {
        kind: 'maimai',
        courseRank: normalizeLxnsCourseRank(player.data.course_rank),
      },
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
      records.push(mapLxnsScore(parsed.data));
    }
    return records;
  }

  async getOptionalRecords(): Promise<ScoreRecord[]> {
    const data = await this.request('/user/maimai/player/scores', true);
    if (data === null) return [];
    if (!Array.isArray(data)) {
      throw new ProviderError('upstream_schema', '落雪成绩响应结构与已验证契约不一致', true);
    }
    const records: ScoreRecord[] = [];
    for (const item of data) {
      const parsed = LxnsScoreSchema.safeParse(item);
      if (!parsed.success) {
        throw new ProviderError('upstream_schema', '落雪成绩条目与已验证契约不一致', true);
      }
      records.push(mapLxnsScore(parsed.data));
    }
    return records;
  }
}
