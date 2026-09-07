import { useEffect } from 'react';
import { gameAccountMetadata } from '@/domain/game-data';
import { useGameData } from '@/hooks/use-game-data';
import { useSession } from '@/state/session-store';
import { persistBoundAccountThumbnail } from '@/services/account-thumbnail';
import { persistBoundAccountAvatar } from '@/services/resolve-account-avatar-persist';
import { SecureSessionStore } from '@/storage/secure-session-store';

/** Mounted once below QueryClientProvider; all page observers remain side-effect free. */
export function useSyncAccountMetadata(): void {
  const { data, activeAccountId } = useGameData(false);
  useEffect(() => {
    if (!data || !activeAccountId) return;
    const metadata = gameAccountMetadata(data);
    if (!metadata) return;
    const { scoreDisplay, displayName, avatarUrl, challengeModeRank, ratingPossession, storedDisplayName } = metadata;
    useSession.getState().updateBoundAccountScore(activeAccountId, scoreDisplay, displayName, avatarUrl, challengeModeRank, ratingPossession);
    void persistBoundAccountThumbnail(activeAccountId, { scoreDisplay, avatarUrl: avatarUrl ?? undefined, challengeModeRank, ratingPossession }).catch(() => undefined);
    if (avatarUrl && data.payload.kind !== 'majdata-net' && data.payload.kind !== 'phira') {
      void persistBoundAccountAvatar(activeAccountId, avatarUrl).catch(() => undefined);
    }
    if (storedDisplayName !== undefined) {
      void new SecureSessionStore().updateAccountMetadata(activeAccountId, {
        displayName: storedDisplayName, scoreDisplay,
        ...(challengeModeRank !== undefined ? { challengeModeRank: challengeModeRank ?? undefined } : {}),
        ...(ratingPossession !== undefined ? { ratingPossession } : {}),
      }).catch(() => undefined);
    }
  }, [activeAccountId, data]);
}
