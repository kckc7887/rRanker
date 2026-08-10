import { z } from 'zod';
import {
  MuseDashAlbumsResponseSchema,
  MuseDashCeResponseSchema,
  MuseDashDiffdiffResponseSchema,
  MuseDashPlayDetailSchema,
  MuseDashPlayerSchema,
  MuseDashSearchResponseSchema,
} from '@/domain/muse-dash';
import { ProviderError } from './errors';

const MUSE_DASH_API_BASE = 'https://api.musedash.moe';
type FetchLike = typeof fetch;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function statusError(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('permission', '喵斯快跑社区公开接口策略已变化，暂时无法读取数据', false);
  if (status === 404) return new ProviderError('no_data', '喵斯快跑社区未找到对应数据', false);
  if (status === 429) return new ProviderError('rate_limit', '喵斯快跑社区请求过于频繁，请稍后重试', true);
  if (status >= 500) return new ProviderError('network', '喵斯快跑社区服务暂时不可用', true);
  return new ProviderError('unknown', `喵斯快跑社区返回 HTTP ${status}`, false);
}

function retryAfterMs(response: Response): number {
  const raw = response.headers.get('Retry-After');
  if (!raw) return 1_000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.min(5_000, Math.max(0, seconds * 1_000));
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.min(5_000, Math.max(0, date - Date.now())) : 1_000;
}

export class MuseDashProvider {
  constructor(private readonly fetcher: FetchLike = fetch, private readonly baseUrl = MUSE_DASH_API_BASE) {}

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
          throw new ProviderError('upstream_schema', '喵斯快跑社区数据结构与已验证契约不一致', true, { cause: error });
        }
        if (error instanceof ProviderError) throw error;
        const normalized = error instanceof Error && error.name === 'AbortError'
          ? new ProviderError('timeout', '喵斯快跑社区数据读取超时', true, { cause: error })
          : new ProviderError('network', '无法连接喵斯快跑社区服务', true, { cause: error });
        if (attempt === 0) { previousError = normalized; continue; }
        throw normalized;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw previousError ?? new ProviderError('network', '无法连接喵斯快跑社区服务', true);
  }

  /** /search/:string 昵称搜索，返回 [[nickname, user_id], ...]。 */
  searchPlayers(query: string) {
    return this.request(`/search/${encodeURIComponent(query.trim())}`, MuseDashSearchResponseSchema);
  }
  /** /player/:id 玩家资料与全部成绩。 */
  getPlayer(userId: string) { return this.request(`/player/${encodeURIComponent(userId)}`, MuseDashPlayerSchema); }
  /** /rank/:uid/:difficulty/:platform/:id 单曲原始成绩明细（含 miss/judge/combo，成就判定用）。 */
  getPlayDetail(uid: string, difficulty: number, platform: string, userId: string) {
    return this.request(
      `/rank/${encodeURIComponent(uid)}/${difficulty}/${encodeURIComponent(platform)}/${encodeURIComponent(userId)}`,
      MuseDashPlayDetailSchema,
    );
  }
  /** /albums 全量曲库（专辑 → 歌曲）。 */
  getAlbums() { return this.request('/albums', MuseDashAlbumsResponseSchema); }
  /** /ce 角色与精灵名称表。 */
  getCe() { return this.request('/ce', MuseDashCeResponseSchema); }
  /** /diffdiff 全曲定数表。 */
  getDiffdiff() { return this.request('/diffdiff', MuseDashDiffdiffResponseSchema); }
}

export const museDashProvider = new MuseDashProvider();
