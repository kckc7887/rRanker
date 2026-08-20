import { useQuery } from '@tanstack/react-query';
import { osuUserIdFromAccountId } from '@/domain/bound-account';
import type { OsuGameId } from '@/domain/game-mode-family';
import { normalizeOsuScores, type OsuBestScore } from '@/domain/osu';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import type { OsuOAuthSession } from '@/providers/osu-oauth';
import { applyOsuTokenRotation, useSession } from '@/state/session-store';

/**
 * osu! 最近通过成绩：账号级 query key，沿用 OAuth token 轮换，60 秒内复用缓存。
 * 与最佳成绩快照彻底分离，不写入 SQLite 或备份结构。
 */
export function useOsuRecentScores(gameId: OsuGameId | null, enabled = true) {
  const session = useSession((state) => state.session);
  const activeProviderId = useSession((state) => state.activeProviderId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const userId = gameId === null ? null : osuUserIdFromAccountId(activeAccountId);
  const bound = activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null;

  const query = useQuery({
    queryKey: ['osu-recent-scores', activeAccountId, gameId, userId] as const,
    queryFn: async (): Promise<OsuBestScore[]> => {
      const provider = new OsuScoreProvider(
        session as OsuOAuthSession,
        (next) => applyOsuTokenRotation(activeAccountId, next),
      );
      const raw = await provider.getRecentScores(userId as number, gameId as OsuGameId);
      return normalizeOsuScores(raw);
    },
    enabled: enabled && bound,
    staleTime: 60_000,
  });

  return { ...query, bound };
}
