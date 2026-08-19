import { useQuery } from '@tanstack/react-query';
import { osuUserIdFromAccountId } from '@/domain/bound-account';
import type { OsuGameId } from '@/domain/game-mode-family';
import { normalizeOsuBeatmapsetDetail, type OsuBeatmapsetDetail } from '@/domain/osu';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import { applyOsuTokenRotation, useSession } from '@/state/session-store';

/**
 * osu! 歌曲详情（GET /beatmapsets/{id}，实时查询不做本地快照）：
 * - 仅 osu 会话（osu-oauth）可用，未绑定/非 osu 账号不发请求（bound 判定与 use-osu-catalog 一致）；
 * - token 轮换与 use-game-data 的 osu 分支同构（applyOsuTokenRotation 广播到共享凭据账号）；
 * - 模式过滤与星数降序在 normalizeOsuBeatmapsetDetail 内完成。
 */
export function useOsuBeatmapsetDetail(gameId: OsuGameId | null, beatmapsetId: string | null) {
  const session = useSession((s) => s.session);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const userId = gameId === null ? null : osuUserIdFromAccountId(activeAccountId);
  const bound = activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null;

  const query = useQuery({
    queryKey: ['osu-beatmapset-detail', gameId, userId, beatmapsetId] as const,
    queryFn: async (): Promise<OsuBeatmapsetDetail> => {
      const provider = new OsuScoreProvider(
        session as OsuOAuthSession,
        (next) => applyOsuTokenRotation(activeAccountId, next),
      );
      const raw = await provider.getBeatmapset(beatmapsetId as string);
      return normalizeOsuBeatmapsetDetail(raw, gameId as OsuGameId);
    },
    enabled: bound && beatmapsetId !== null,
    staleTime: 60_000,
  });

  return { ...query, bound };
}
