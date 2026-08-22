import { z } from 'zod';
import {
  MuseDashAlbumsResponseSchema,
  MuseDashCeResponseSchema,
  MuseDashDiffdiffResponseSchema,
  MuseDashPlayDetailSchema,
  MuseDashPlayerSchema,
  MuseDashSearchResponseSchema,
} from '@/domain/muse-dash';
import { requestJson } from './http-json';
import { ProviderError, providerErrorFromStatus, type ProviderStatusTexts } from './errors';

const MUSE_DASH_API_BASE = 'https://api.musedash.moe';
const MUSE_DASH_LABEL = 'MuseDash.moe';
type FetchLike = typeof fetch;

const MUSE_DASH_STATUS_TEXTS: ProviderStatusTexts = {
  permission: `${MUSE_DASH_LABEL}公开接口策略已变化，暂时无法读取数据`,
  noData: `${MUSE_DASH_LABEL}未找到对应数据`,
  rateLimit: `${MUSE_DASH_LABEL}请求过于频繁，请稍后重试`,
  server: `${MUSE_DASH_LABEL}服务暂时不可用`,
  fallback: { message: (status) => `${MUSE_DASH_LABEL}返回 HTTP ${status}` },
};

function statusError(status: number): ProviderError {
  return providerErrorFromStatus(status, MUSE_DASH_STATUS_TEXTS);
}

export class MuseDashProvider {
  constructor(private readonly fetcher: FetchLike = fetch, private readonly baseUrl = MUSE_DASH_API_BASE) {}

  private request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return requestJson({
      path,
      schema,
      fetcher: this.fetcher,
      baseUrl: this.baseUrl,
      error: statusError,
      label: MUSE_DASH_LABEL,
    });
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
