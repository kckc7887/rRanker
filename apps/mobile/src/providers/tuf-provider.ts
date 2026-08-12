import { z } from 'zod';
import {
  TufDifficultyHashSchema, TufDifficultyListSchema, TufLevelDetailResponseSchema,
  TufLevelPageSchema, TufLevelPassListSchema, TufPassPageSchema, TufPlayerSchema, TufPlayerSearchResponseSchema,
  TufVideoDetailsSchema, tufHttpsUrl,
  type TufLevelQuery, type TufPassQuery,
} from '@/domain/tuf';
import { ProviderError } from './errors';

const TUF_API_BASE = 'https://api.tuforums.com';
type FetchLike = typeof fetch;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function statusError(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('permission', 'TUF 公开接口策略已变化，暂时无法读取社区数据', false);
  if (status === 404) return new ProviderError('no_data', 'TUF 未找到对应数据', false);
  if (status === 429) return new ProviderError('rate_limit', 'TUF 请求过于频繁，请稍后重试', true);
  if (status >= 500) return new ProviderError('network', 'TUF 社区服务暂时不可用', true);
  return new ProviderError('unknown', `TUF 返回 HTTP ${status}`, false);
}

function retryAfterMs(response: Response): number {
  const raw = response.headers.get('Retry-After');
  if (!raw) return 1_000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.min(5_000, Math.max(0, seconds * 1_000));
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.min(5_000, Math.max(0, date - Date.now())) : 1_000;
}

export class TufProvider {
  constructor(private readonly fetcher: FetchLike = fetch, private readonly baseUrl = TUF_API_BASE) {}

  private async request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    let previousError: ProviderError | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
          headers: { Accept: 'application/json', 'Cache-Control': 'no-store' }, signal: controller.signal,
        });
        if (!response.ok) {
          const error = statusError(response.status);
          if (attempt === 0 && error.retryable) {
            previousError = error;
            if (response.status === 429) await pause(retryAfterMs(response));
            continue;
          }
          throw error;
        }
        return schema.parse(await response.json());
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          throw new ProviderError('upstream_schema', 'TUF 数据结构与已验证契约不一致', true, { cause: error });
        }
        if (error instanceof ProviderError) throw error;
        const normalized = error instanceof Error && error.name === 'AbortError'
          ? new ProviderError('timeout', 'TUF 数据读取超时', true, { cause: error })
          : new ProviderError('network', '无法连接 TUF 社区服务', true, { cause: error });
        if (attempt === 0) { previousError = normalized; continue; }
        throw normalized;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw previousError ?? new ProviderError('network', '无法连接 TUF 社区服务', true);
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
