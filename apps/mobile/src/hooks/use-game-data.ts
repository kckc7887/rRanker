import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  emptyGamePayload,
  formatPlayerScore,
  maimaiPayloadFromSnapshot,
  type GameDataBundle,
} from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { ScoreService } from '@/services/score-service';
import { useSession } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();
const GAME_DATA_QUERY_VERSION = 4;

export function useGameData() {
  const session = useSession((s) => s.session);
  const activeGameId = useSession((s) => s.activeGameId);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const updateBoundAccountScore = useSession((s) => s.updateBoundAccountScore);
  const scoreProvider = useSession((s) => s.scoreProvider);
  const catalogProvider = useSession((s) => s.catalogProvider);
  const profile = getGameProfile(activeGameId);

  const query = useQuery({
    queryKey: ['game-data', GAME_DATA_QUERY_VERSION, activeAccountId, activeGameId, activeProviderId, session?.mode ?? 'none'],
    queryFn: async (): Promise<GameDataBundle> => {
      if (activeGameId === 'test') {
        return {
          gameId: 'test',
          providerId: null,
          profile: getGameProfile('test'),
          payload: emptyGamePayload('test', '测试游戏'),
        };
      }
      if (activeGameId === 'phigros') {
        return {
          gameId: 'phigros',
          providerId: null,
          profile: getGameProfile('phigros'),
          payload: {
            kind: 'unsupported',
            gameId: 'phigros',
            displayName: 'Phigros',
            message: '空空空，暂未接入成绩。',
          },
        };
      }

      const persist = !!session;
      const snapshot = await new ScoreService(
        scoreProvider,
        catalogProvider,
        activeAccountId,
        persist ? repository : undefined,
        persist ? repository : undefined,
      ).load();

      return {
        gameId: 'maimai',
        providerId: activeProviderId,
        profile: getGameProfile('maimai'),
        payload: maimaiPayloadFromSnapshot(snapshot, getGameProfile('maimai')),
      };
    },
  });

  useEffect(() => {
    if (!query.data || query.data.payload.kind !== 'maimai') return;
    updateBoundAccountScore(
      activeAccountId,
      formatPlayerScore(query.data.payload.playerScore.value, query.data.profile.ratingDigits),
      query.data.payload.player.displayName,
    );
  }, [activeAccountId, query.data, updateBoundAccountScore]);

  return {
    ...query,
    profile,
    activeGameId,
    activeProviderId,
    activeAccountId,
    isDataStale: !!query.data && query.data.payload.kind === 'maimai'
      && (query.data.payload.source.isStale || query.data.payload.catalogSource.isStale),
  };
}
