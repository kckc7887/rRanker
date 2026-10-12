import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { OsuGameId } from '@/domain/game-mode-family';
import {
  OSU_MODE_INT_BY_GAME_ID,
  OsuBeatmapsetLookupSchema,
  normalizeOsuBeatmapsetDetail,
  type OsuBeatmapsetDetail,
} from '@/domain/osu';
import { providerErrorFromStatus } from './errors';
import { requestJson } from './http-json';

const OSU_PUBLIC_API_ROOT = 'https://osu.direct/api/v2';
const PAGE_SIZE = 30;
const RANKED_STATUSES = new Set(['ranked', 'approved']);

export type OsuPublicCatalogPage = {
  songs: OsuBeatmapsetDetail[];
  nextPage: number | undefined;
};

export class OsuPublicCatalogProvider {
  private request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    return requestJson({
      baseUrl: OSU_PUBLIC_API_ROOT,
      path,
      schema,
      fetcher: expoFetch as unknown as typeof fetch,
      signal,
      totalAttempts: 1,
      label: 'osu!',
      messages: {
        schema: 'osu! 曲库数据结构与已验证契约不一致',
        timeout: 'osu! 曲库读取超时',
        network: '无法连接 osu! 曲库',
      },
      error: (status) => providerErrorFromStatus(status, {
        noData: 'osu! 未找到该谱面',
        rateLimit: 'osu! 曲库请求过于频繁，请稍后重试',
        server: 'osu! 曲库暂时不可用',
        fallback: { message: (code) => `osu! 曲库返回 HTTP ${code}` },
      }),
    });
  }

  async searchBeatmapsets(
    params: { gameId: OsuGameId; page: number; q?: string; rankedOnly?: boolean },
    signal?: AbortSignal,
  ): Promise<OsuPublicCatalogPage> {
    const query = new URLSearchParams({
      mode: String(OSU_MODE_INT_BY_GAME_ID[params.gameId]),
      amount: String(PAGE_SIZE),
      offset: String(params.page * PAGE_SIZE),
      sort: 'beatmaps.difficulty_rating:desc',
    });
    if (params.rankedOnly) query.set('status', '1,2');
    if (params.q?.trim()) query.set('q', params.q.trim());
    const raw = await this.request(`/search?${query}`, z.array(OsuBeatmapsetLookupSchema), signal);
    const sets = params.rankedOnly ? raw
      .filter((song) => RANKED_STATUSES.has(song.status ?? ''))
      .map((song) => ({ ...song, beatmaps: song.beatmaps?.filter((beatmap) => (
        RANKED_STATUSES.has(beatmap.status ?? song.status ?? '')
      )) })) : raw;
    return {
      songs: sets.map((song) => normalizeOsuBeatmapsetDetail(song, params.gameId)),
      nextPage: raw.length === PAGE_SIZE ? params.page + 1 : undefined,
    };
  }

  async getBeatmapset(
    beatmapsetId: string | number,
    gameId: OsuGameId,
    signal?: AbortSignal,
  ): Promise<OsuBeatmapsetDetail> {
    const raw = await this.request(`/s/${encodeURIComponent(String(beatmapsetId))}`, OsuBeatmapsetLookupSchema, signal);
    return normalizeOsuBeatmapsetDetail(raw, gameId);
  }
}
