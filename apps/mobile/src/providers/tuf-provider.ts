import { z } from 'zod';
import {
  TufDifficultyHashSchema, TufDifficultyListSchema, TufLevelDetailResponseSchema,
  TufLevelPageSchema, TufLevelPassListSchema, TufPassPageSchema, TufPlayerSchema, TufPlayerSearchResponseSchema,
  TufVideoDetailsSchema, tufHttpsUrl,
  type TufLevelQuery, type TufPassQuery,
} from '@/domain/tuf';
import { ProviderError } from './errors';
import { requestJson } from './http-json';

const TUF_API_BASE = 'https://api.tuforums.com';
type FetchLike = typeof fetch;

function statusError(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('permission', 'TUF 公开接口策略已变化，暂时无法读取社区数据', false);
  if (status === 404) return new ProviderError('no_data', 'TUF 未找到对应数据', false);
  if (status === 429) return new ProviderError('rate_limit', 'TUF 请求过于频繁，请稍后重试', true);
  if (status >= 500) return new ProviderError('network', 'TUF 社区服务暂时不可用', true);
  return new ProviderError('unknown', `TUF 返回 HTTP ${status}`, false);
}

export class TufProvider {
  constructor(private readonly fetcher: FetchLike = fetch, private readonly baseUrl = TUF_API_BASE) {}

  /** 统一走 http-json 公共层；超时/重试/退避语义与默认一致，文案经 messages 逐字保留 TUF 现状。 */
  private request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return requestJson({
      path,
      schema,
      fetcher: this.fetcher,
      baseUrl: this.baseUrl,
      error: statusError,
      label: 'TUF',
      messages: {
        schema: 'TUF 数据结构与已验证契约不一致',
        timeout: 'TUF 数据读取超时',
        network: '无法连接 TUF 社区服务',
      },
    });
  }

  searchPlayers(query: string, limit = 30, offset = 0) {
    const params = new URLSearchParams({ query: query.trim(), limit: String(limit), offset: String(offset) });
    return this.request(`/v3/players/search?${params}`, TufPlayerSearchResponseSchema);
  }
  getPlayer(playerId: number) { return this.request(`/v3/players/${playerId}`, TufPlayerSchema); }
  getPlayerProfile(playerId: number) { return this.request(`/v3/players/${playerId}/profile`, TufPlayerSchema); }
  getPasses(playerId: number, query: TufPassQuery) {
    const params = new URLSearchParams({
      offset: String(query.offset), limit: String(query.limit), sortBy: query.sortBy,
      order: query.order, bestPerLevel: String(query.bestPerLevel),
    });
    if (query.query?.trim()) params.set('query', query.query.trim());
    return this.request(`/v3/players/${playerId}/passes?${params}`, TufPassPageSchema);
  }
  searchLevels(query: TufLevelQuery) {
    const params = new URLSearchParams({ offset: String(query.offset), limit: String(query.limit) });
    if (query.query?.trim()) params.set('query', query.query.trim());
    if (query.sort && query.order) params.set('sort', `${query.sort}_${query.order}`);
    if (query.pguRange) params.set('pguRange', query.pguRange);
    if (query.specialDifficulties?.length) params.set('specialDifficulties', query.specialDifficulties.join(','));
    return this.request(`/v2/database/levels?${params}`, TufLevelPageSchema);
  }
  getLevel(levelId: number) { return this.request(`/v2/database/levels/${levelId}`, TufLevelDetailResponseSchema); }
  getLevelPasses(levelId: number) { return this.request(`/v2/database/passes/level/${levelId}`, TufLevelPassListSchema); }
  getVideoDetails(videoLink: string) {
    const normalized = tufHttpsUrl(videoLink);
    if (!normalized) throw new ProviderError('unknown', 'TUF 视频链接无效', false);
    return this.request(`/v2/media/video-details/${encodeURIComponent(normalized)}`, TufVideoDetailsSchema);
  }
  getDifficulties() { return this.request('/v2/database/difficulties', TufDifficultyListSchema); }
  getDifficultyHash() { return this.request('/v2/database/difficulties/hash', TufDifficultyHashSchema); }
}

export const tufProvider = new TufProvider();
