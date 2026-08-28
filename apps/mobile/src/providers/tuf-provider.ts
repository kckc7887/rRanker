import { z } from 'zod';
import {
  TufDifficultyHashSchema, TufDifficultyListSchema, TufLevelDetailResponseSchema,
  TufLevelPageSchema, TufLevelPassListSchema, TufPassPageSchema, TufPlayerSchema, TufPlayerSearchResponseSchema,
  TufVideoDetailsSchema, tufHttpsUrl,
  type TufLevelQuery, type TufPassQuery,
} from '@/domain/tuf';
import { ProviderError, providerErrorFromStatus, type ProviderStatusTexts } from './errors';
import { requestJson } from './http-json';

const TUF_API_BASE = 'https://api.tuforums.com';
type FetchLike = typeof fetch;

const TUF_STATUS_TEXTS: ProviderStatusTexts = {
  permission: 'TUF 公开接口策略已变化，暂时无法读取社区数据',
  noData: 'TUF 未找到对应数据',
  rateLimit: 'TUF 请求过于频繁，请稍后重试',
  server: 'TUF 社区服务暂时不可用',
  fallback: { message: (status) => `TUF 返回 HTTP ${status}` },
};

function statusError(status: number): ProviderError {
  return providerErrorFromStatus(status, TUF_STATUS_TEXTS);
}

export class TufProvider {
  constructor(private readonly fetcher: FetchLike = fetch, private readonly baseUrl = TUF_API_BASE) {}

  private request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
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
      signal,
    });
  }

  searchPlayers(query: string, limit = 30, offset = 0, signal?: AbortSignal) {
    const params = new URLSearchParams({ query: query.trim(), limit: String(limit), offset: String(offset) });
    return this.request(`/v3/players/search?${params}`, TufPlayerSearchResponseSchema, signal);
  }
  getPlayer(playerId: number, signal?: AbortSignal) { return this.request(`/v3/players/${playerId}`, TufPlayerSchema, signal); }
  getPlayerProfile(playerId: number, signal?: AbortSignal) { return this.request(`/v3/players/${playerId}/profile`, TufPlayerSchema, signal); }
  getPasses(playerId: number, query: TufPassQuery, signal?: AbortSignal) {
    const params = new URLSearchParams({
      offset: String(query.offset), limit: String(query.limit), sortBy: query.sortBy,
      order: query.order, bestPerLevel: String(query.bestPerLevel),
    });
    if (query.query?.trim()) params.set('query', query.query.trim());
    return this.request(`/v3/players/${playerId}/passes?${params}`, TufPassPageSchema, signal);
  }
  searchLevels(query: TufLevelQuery, signal?: AbortSignal) {
    const params = new URLSearchParams({ offset: String(query.offset), limit: String(query.limit) });
    if (query.query?.trim()) params.set('query', query.query.trim());
    if (query.sort && query.order) params.set('sort', `${query.sort}_${query.order}`);
    if (query.pguRange) params.set('pguRange', query.pguRange);
    if (query.specialDifficulties?.length) params.set('specialDifficulties', query.specialDifficulties.join(','));
    return this.request(`/v2/database/levels?${params}`, TufLevelPageSchema, signal);
  }
  getLevel(levelId: number, signal?: AbortSignal) {
    return this.request(`/v2/database/levels/${levelId}`, TufLevelDetailResponseSchema, signal);
  }
  getLevelPasses(levelId: number, signal?: AbortSignal) {
    return this.request(`/v2/database/passes/level/${levelId}`, TufLevelPassListSchema, signal);
  }
  getVideoDetails(videoLink: string, signal?: AbortSignal) {
    const normalized = tufHttpsUrl(videoLink);
    if (!normalized) throw new ProviderError('unknown', 'TUF 视频链接无效', false);
    return this.request(`/v2/media/video-details/${encodeURIComponent(normalized)}`, TufVideoDetailsSchema, signal);
  }
  getDifficulties(signal?: AbortSignal) {
    return this.request('/v2/database/difficulties', TufDifficultyListSchema, signal);
  }
  getDifficultyHash(signal?: AbortSignal) {
    return this.request('/v2/database/difficulties/hash', TufDifficultyHashSchema, signal);
  }
}

export const tufProvider = new TufProvider();
