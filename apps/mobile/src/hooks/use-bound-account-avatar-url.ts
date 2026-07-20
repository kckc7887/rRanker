import { useEffect, useState } from 'react';
import type { BoundAccount } from '@/domain/bound-account';
import { resolvePhigrosAvatarUrl } from '@/domain/phigros-avatar-resolver';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import {
  persistBoundAccountAvatar,
  resolveBoundAccountAvatarUrl,
} from '@/services/hydrate-bound-account-avatars';
import { useSession } from '@/state/session-store';

export function useBoundAccountAvatarUrl(account: BoundAccount): string | null {
  const sessionsByAccountId = useSession((state) => state.sessionsByAccountId);
  const updateBoundAccountScore = useSession((state) => state.updateBoundAccountScore);
  const [url, setUrl] = useState<string | null>(account.avatarUrl ?? null);

  useEffect(() => {
    let cancelled = false;

    async function resolve(): Promise<void> {
      if (account.avatarUrl) {
        setUrl(account.avatarUrl);
        return;
      }

      const cached = await resolveBoundAccountAvatarUrl(account);
      if (cancelled) return;
      if (cached) {
        setUrl(cached);
        updateBoundAccountScore(
          account.id,
          account.scoreDisplay,
          account.displayName,
          cached,
        );
        return;
      }

      if (account.providerId !== 'phi-taptap') return;

      const session = sessionsByAccountId[account.id];
      if (session?.mode !== 'phi-session') return;

      try {
        const provider = new PhigrosScoreProvider(session);
        const catalog = new PhigrosCatalogProvider();
        const [summary, gameVersion] = await Promise.all([
          provider.getSummary(),
          catalog.getGameVersion(),
        ]);
        const avatarUrl = await resolvePhigrosAvatarUrl(gameVersion, summary.avatar);
        if (cancelled || !avatarUrl) return;
        setUrl(avatarUrl);
        updateBoundAccountScore(
          account.id,
          account.scoreDisplay,
          account.displayName,
          avatarUrl,
        );
        void persistBoundAccountAvatar(account.id, avatarUrl);
      } catch {
        // 凭据失效或网络不可用时保留查分器图标回退。
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [
    account.avatarUrl,
    account.displayName,
    account.id,
    account.providerId,
    account.scoreDisplay,
    sessionsByAccountId,
    updateBoundAccountScore,
  ]);

  return url;
}
