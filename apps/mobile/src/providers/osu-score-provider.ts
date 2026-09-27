import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { OsuGameId } from '@/domain/game-mode-family';
import {
  OSU_RULESET_BY_GAME_ID,
  OsuBeatmapUserScoreResponseSchema,
  OsuBeatmapsetLookupSchema,
  OsuBeatmapsetSearchResponseSchema,
  OsuBestScoreSchema,
  OsuUserResponseSchema,
  buildOsuBeatmapsetSearchQuery,
  type OsuBeatmapsetLookupRaw,
  type OsuBeatmapsetSearchParams,
  type OsuBeatmapsetSearchRaw,
  type OsuBestScoreRaw,
  type OsuUserResponseRaw,
} from '@/domain/osu';
import { ProviderError, providerErrorFromStatus, type ProviderStatusTexts } from './errors';
import { requestJson } from './http-json';
import { OSU_API_ROOT } from './osu-config';
import {
  osuAccessTokenExpired,
  rotateOsuTokens,
  type OsuOAuthSession,
} from './osu-oauth';

/** osu! 状态码分支文案（401 鉴权、404 无数据、429 限流 60 次/分钟、≥500 服务端）。 */
const OSU_STATUS_TEXTS: ProviderStatusTexts = {
  authentication: 'osu! 授权已失效，请重新绑定',
  permission: '当前 osu! 账号无权读取该数据',
  noData: 'osu! 未找到该玩家数据',
  rateLimit: 'osu! 请求过于频繁，请稍后重试',
  server: 'osu! 服务暂时不可用',
  fallback: { message: (status) => `osu! 返回 HTTP ${status}` },
};

/** token 轮换成功后的回调：由调用方按凭据世代校验后把新会话提交到账号存储。 */
export type OsuTokenRotationHandler = (
  session: OsuOAuthSession,
  expected: OsuOAuthSession,
) => void | Promise<unknown>;

/**
 * osu! 官方 API Provider。所有端点要求 Bearer token，请求统一走 http-json 公共执行器：
 * 鉴权头经 init.headers 注入，超时、取消、结构错误与网络错误归一化都由公共执行器负责。
 * 协议差异保留在协议层：
 * - x-api-version 与 osu! 状态码文案（OSU_STATUS_TEXTS）；
 * - 互斥刷新：同构 LxnsOAuthRequestCore.ensureFreshAccessToken，轮换走公共 rotateOsuTokens；
 * - 只读端点固定总尝试次数 1，不自动重试。
 */
export class OsuScoreProvider {
  private session: OsuOAuthSession;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    session: OsuOAuthSession,
    private readonly onTokensRotated?: OsuTokenRotationHandler,
  ) {
    this.session = session;
  }

  getSession(): OsuOAuthSession {
    return this.session;
  }

  private async ensureFreshAccessToken(): Promise<string> {
    if (!osuAccessTokenExpired(this.session)) return this.session.accessToken;
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const expected = this.session;
        const next = await rotateOsuTokens(expected.refreshToken);
        this.session = next;
        await this.onTokensRotated?.(next, expected);
      })().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;
    return this.session.accessToken;
  }

  private async request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    const accessToken = await this.ensureFreshAccessToken();
    if (signal?.aborted) throw signal.reason;
    return requestJson({
      baseUrl: OSU_API_ROOT,
      path,
      schema,
      fetcher: expoFetch as unknown as typeof fetch,
      signal,
      totalAttempts: 1,
      timeoutMs: 12_000,
      label: 'osu!',
      messages: {
        schema: 'osu! 数据结构与已验证契约不一致',
        timeout: 'osu! 数据读取超时',
        network: '无法连接 osu! 服务',
      },
      init: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-api-version': '20220705',
        },
      },
      error: (status) => {
        const mapped = providerErrorFromStatus(status, OSU_STATUS_TEXTS);
        return new ProviderError(mapped.code, `${mapped.message}（${path}）`, mapped.retryable, { cause: mapped });
      },
    });
  }

  /** 当前授权用户（identify scope）；绑定阶段用于取 userId/username。 */
  getOwnUser(gameId: OsuGameId, signal?: AbortSignal): Promise<OsuUserResponseRaw> {
    return this.request(`/me/${OSU_RULESET_BY_GAME_ID[gameId]}`, OsuUserResponseSchema, signal);
  }

  /** 玩家资料与模式统计（public scope）。 */
  getUser(userId: number, gameId: OsuGameId, signal?: AbortSignal): Promise<OsuUserResponseRaw> {
    return this.request(`/users/${userId}/${OSU_RULESET_BY_GAME_ID[gameId]}`, OsuUserResponseSchema, signal);
  }

  /** 个人最佳成绩（Top 100，含 beatmap/beatmapset 内嵌信息）。 */
  getBestScores(
    userId: number,
    gameId: OsuGameId,
    limit = 100,
    signal?: AbortSignal,
  ): Promise<OsuBestScoreRaw[]> {
    const ruleset = OSU_RULESET_BY_GAME_ID[gameId];
    return this.request(
      `/users/${userId}/scores/best?mode=${ruleset}&limit=${limit}&offset=0`,
      z.array(OsuBestScoreSchema),
      signal,
    );
  }

  /** 指定玩家在单张谱面的最佳成绩；未游玩时官方返回 404，归一化为 null。 */
  async getUserBeatmapScore(
    userId: number,
    beatmapId: number,
    gameId: OsuGameId,
    signal?: AbortSignal,
  ): Promise<OsuBestScoreRaw | null> {
    const ruleset = OSU_RULESET_BY_GAME_ID[gameId];
    try {
      const response = await this.request(
        `/beatmaps/${beatmapId}/scores/users/${userId}?mode=${ruleset}`,
        OsuBeatmapUserScoreResponseSchema,
        signal,
      );
      return response.score;
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'no_data') return null;
      throw error;
    }
  }

  /** 谱面搜索（曲库页）：每页 50 份 beatmapset（上游固定），cursor_string 翻页；m 恒为当前模式。 */
  searchBeatmapsets(
    params: OsuBeatmapsetSearchParams,
    signal?: AbortSignal,
  ): Promise<OsuBeatmapsetSearchRaw> {
    const query = new URLSearchParams(buildOsuBeatmapsetSearchQuery(params)).toString();
    return this.request(`/beatmapsets/search?${query}`, OsuBeatmapsetSearchResponseSchema, signal);
  }

  /** 谱面集详情（歌曲详情页）：返回 BeatmapsetExtended 原始数据，模式过滤在规范化层做。 */
  getBeatmapset(beatmapsetId: number | string, signal?: AbortSignal): Promise<OsuBeatmapsetLookupRaw> {
    return this.request(
      `/beatmapsets/${encodeURIComponent(String(beatmapsetId))}`,
      OsuBeatmapsetLookupSchema,
      signal,
    );
  }

}
