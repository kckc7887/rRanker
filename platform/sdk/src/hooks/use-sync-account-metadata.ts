import { useEffect, useMemo } from 'react';
import { gameAccountMetadata } from '@rranker/sdk/data';
import { useGameData } from '@rranker/sdk/hooks/use-game-data';
import { useSession } from '@rranker/sdk/state/session-store';
import { commitAccountMetadata } from '@rranker/sdk/services/account-metadata';
import { captureBoundAccountWrites } from '@rranker/sdk/services/account-write-scope';

export function useSyncAccountMetadata(): void {
  const { data, activeAccountId } = useGameData(false);
  const assertCurrent = useMemo(() => data ? captureBoundAccountWrites(activeAccountId) : null, [activeAccountId, data]);
  useEffect(() => {
    if (!data || !activeAccountId || !assertCurrent) return;
    const account = useSession.getState().boundAccounts.find(item => item.id === activeAccountId);
    if (!account || account.gameId !== data.gameId || account.providerId !== data.providerId) return;
    const metadata = gameAccountMetadata(data);
    if (!metadata) return;
    void commitAccountMetadata(activeAccountId, metadata, assertCurrent).catch(() => undefined);
  }, [activeAccountId, data, assertCurrent]);
}
