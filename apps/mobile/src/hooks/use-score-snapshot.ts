import { useGameData } from '@/hooks/use-game-data';
import { useSession } from '@/state/session-store';

/** 仅舞萌成绩快照；与总览共用账号级 game-data 查询。 */
export function useScoreSnapshot(enabled = true) {
  const activeGameId = useSession((state) => state.activeGameId);
  const query = useGameData(enabled && activeGameId === 'maimai');
  const snapshot = query.data?.payload.kind === 'maimai'
    ? query.data.payload.snapshot
    : undefined;
  return {
    ...query,
    data: snapshot,
    isDataStale: !!snapshot && (snapshot.source.isStale || snapshot.catalogSource.isStale),
  };
}
