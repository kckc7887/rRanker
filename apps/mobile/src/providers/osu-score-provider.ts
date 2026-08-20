import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import type { OsuGameId } from '@/domain/game-mode-family';
import {
  OSU_RULESET_BY_GAME_ID,
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

/** token 轮换成功后的回调：由调用方把新会话持久化到账号存储。 */
export type OsuTokenRotationHandler = (session: OsuOAuthSession) => void | Promise<void>;

/**
 * osu! 官方 API Provider。所有端点要求 Bearer token；
 * http-json 公共请求器无 Authorization 头注入能力、lxns-oauth-request 为落雪
 * envelope 专用（结构性差异保留），此处自建最小 Bearer 骨架：
 * - 互斥刷新：同构 LxnsOAuthRequestCore.ensureFreshAccessToken，轮换走公共 rotateOsuTokens；
 * - 状态码 → ProviderError：走 errors.ts 的 providerErrorFromStatus 公共分支；
 * - 超时 12s、Zod 校验失败归一化为 upstream_schema。
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
        const next = await rotateOsuTokens(this.session.refreshToken);
        this.session = next;
        await this.onTokensRotated?.(next);
      })().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;
    return this.session.accessToken;
  }

  private async request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const accessToken = await this.ensureFreshAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await expoFetch(`${OSU_API_ROOT}${path}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-api-version': '20220705',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const mapped = providerErrorFromStatus(response.status, OSU_STATUS_TEXTS);
        throw new ProviderError(mapped.code, `${mapped.message}（${path}）`, mapped.retryable, { cause: mapped });
      }
      const payload: unknown = await response.json();
      return schema.parse(payload);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        throw new ProviderError('upstream_schema', 'osu! 数据结构与已验证契约不一致', true, { cause: error });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('timeout', 'osu! 数据读取超时', true, { cause: error });
      }
      throw new ProviderError('network', '无法连接 osu! 服务', true, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  /** 当前授权用户（identify scope）；绑定阶段用于取 userId/username。 */
  getOwnUser(gameId: OsuGameId): Promise<OsuUserResponseRaw> {
    return this.request(`/me/${OSU_RULESET_BY_GAME_ID[gameId]}`, OsuUserResponseSchema);
  }

  /** 玩家资料与模式统计（public scope）。 */
  getUser(userId: number, gameId: OsuGameId): Promise<OsuUserResponseRaw> {
    return this.request(`/users/${userId}/${OSU_RULESET_BY_GAME_ID[gameId]}`, OsuUserResponseSchema);
  }

  /** 个人最佳成绩（Top 100，含 beatmap/beatmapset 内嵌信息）。 */
  getBestScores(userId: number, gameId: OsuGameId, limit = 100): Promise<OsuBestScoreRaw[]> {
    const ruleset = OSU_RULESET_BY_GAME_ID[gameId];
    return this.request(
      `/users/${userId}/scores/best?mode=${ruleset}&limit=${limit}&offset=0`,
      z.array(OsuBestScoreSchema),
    );
  }

  /** 最近通过成绩（官方上限 100；明确排除失败成绩）。 */
  getRecentScores(userId: number, gameId: OsuGameId): Promise<OsuBestScoreRaw[]> {
    const ruleset = OSU_RULESET_BY_GAME_ID[gameId];
    return this.request(
      `/users/${userId}/scores/recent?mode=${ruleset}&limit=100&offset=0&include_fails=0`,
      z.array(OsuBestScoreSchema),
    );
  }

  /** 谱面搜索（曲库页）：每页 50 份 beatmapset（上游固定），cursor_string 翻页；m 恒为当前模式。 */
  searchBeatmapsets(params: OsuBeatmapsetSearchParams): Promise<OsuBeatmapsetSearchRaw> {
    const query = new URLSearchParams(buildOsuBeatmapsetSearchQuery(params)).toString();
    return this.request(`/beatmapsets/search?${query}`, OsuBeatmapsetSearchResponseSchema);
  }

  /** 谱面集详情（歌曲详情页）：返回 BeatmapsetExtended 原始数据，模式过滤在规范化层做。 */
  getBeatmapset(beatmapsetId: number | string): Promise<OsuBeatmapsetLookupRaw> {
    return this.request(`/beatmapsets/${encodeURIComponent(String(beatmapsetId))}`, OsuBeatmapsetLookupSchema);
  }
}
