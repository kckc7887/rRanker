import { buildLxnsIconUrl } from '@/domain/account-avatar';
import type { BoundAccount } from '@/domain/bound-account';
import {
  buildChunithmMapIconUrl,
  CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
  chunithmPersonalResourceKey,
  type ChunithmPersonalSnapshot,
} from '@/domain/chunithm-personal';
import { resolvePhigrosAvatarUrl } from '@/domain/phigros-avatar-resolver';
import { resolveTufAvatarUrl } from '@/domain/tuf';
import { tufPlayerIdFromAccountId } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { applyLxnsTokenRotation } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import {
  accountAvatarResourceKey,
  persistBoundAccountAvatar,
} from '@/services/resolve-account-avatar-persist';
import { loadTufPlayerFresh, makeTufSnapshot, TufCache } from '@/services/tuf-cache';

const repository = new SqliteSnapshotRepository();
const AVATAR_RESOURCE_SCHEMA = 1;
const tufCache = new TufCache();

type StoredAccountAvatar = {
  avatarUrl: string;
};

async function readCachedAvatarUrl(accountId: string): Promise<string | null> {
  const cached = await repository.getResource<StoredAccountAvatar>(
    accountAvatarResourceKey(accountId),
    AVATAR_RESOURCE_SCHEMA,
  );
  return cached?.avatarUrl ?? null;
}

async function resolveLxnsAvatarUrl(
  account: BoundAccount,
  session: ProviderSession | undefined,
): Promise<string | null> {
  const fromSnapshot = account.gameId === 'chunithm'
    ? buildChunithmMapIconUrl((
      await repository.getResource<ChunithmPersonalSnapshot>(
        chunithmPersonalResourceKey(account.id),
        CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
      )
    )?.player?.map_icon?.id)
    : buildLxnsIconUrl((await repository.getLatest(account.id))?.player.presentation?.iconId);
  if (fromSnapshot) return fromSnapshot;

  if (session?.mode !== 'lxns-oauth') return null;

  try {
    if (account.gameId === 'chunithm') {
      const provider = new ChunithmScoreProvider(
        session,
        (next) => applyLxnsTokenRotation(account.id, next),
      );
      const player = await provider.getPlayer();
      return buildChunithmMapIconUrl(player?.map_icon?.id);
    }
    const provider = new LxnsScoreProvider(
      session,
      (next) => applyLxnsTokenRotation(account.id, next),
    );
    const player = await provider.getPlayer();
    return buildLxnsIconUrl(player.presentation?.iconId);
  } catch {
    return null;
  }
}

async function resolvePhigrosAvatarUrlForAccount(
  account: BoundAccount,
  session: ProviderSession | undefined,
): Promise<string | null> {
  const cached = await readCachedAvatarUrl(account.id);
  if (cached) return cached;

  if (session?.mode !== 'phi-session') return null;

  try {
    const provider = new PhigrosScoreProvider(session);
    const catalog = new PhigrosCatalogProvider();
    const [summary, gameVersion] = await Promise.all([
      provider.getSummary(),
      catalog.getGameVersion(),
    ]);
    return await resolvePhigrosAvatarUrl(gameVersion, summary.avatar);
  } catch {
    return null;
  }
}

async function resolveTufAvatarUrlForAccount(account: BoundAccount): Promise<string | null> {
  const persisted = await readCachedAvatarUrl(account.id);
  if (persisted) return persisted;
  const playerId = tufPlayerIdFromAccountId(account.id);
  if (playerId === null) return null;
  try {
    const cached = await tufCache.loadPlayer(playerId);
    const cachedAvatar = resolveTufAvatarUrl(cached?.data);
    if (cachedAvatar) return cachedAvatar;
    const player = await loadTufPlayerFresh(playerId);
    void tufCache.savePlayer(playerId, makeTufSnapshot(player)).catch(() => undefined);
    return resolveTufAvatarUrl(player);
  } catch {
    return null;
  }
}

export async function resolveAccountAvatarUrl(
  account: BoundAccount,
  session: ProviderSession | undefined,
): Promise<string | null> {
  if (account.providerId === 'lxns') {
    return resolveLxnsAvatarUrl(account, session);
  }
  if (account.providerId === 'phi-taptap') {
    return resolvePhigrosAvatarUrlForAccount(account, session);
  }
  if (account.providerId === 'tuf') {
    return resolveTufAvatarUrlForAccount(account);
  }
  return null;
}

export async function syncAllAccountAvatars(
  accounts: readonly BoundAccount[],
  sessionsByAccountId: Readonly<Record<string, ProviderSession>>,
  update: (accountId: string, avatarUrl: string) => void,
): Promise<void> {
  await Promise.all(accounts.map(async (account) => {
    if (account.providerId !== 'lxns' && account.providerId !== 'phi-taptap' && account.providerId !== 'tuf') return;
    if (account.avatarUrl) return;

    const avatarUrl = await resolveAccountAvatarUrl(account, sessionsByAccountId[account.id]);
    if (!avatarUrl) return;

    update(account.id, avatarUrl);
    void persistBoundAccountAvatar(account.id, avatarUrl);
  }));
}
