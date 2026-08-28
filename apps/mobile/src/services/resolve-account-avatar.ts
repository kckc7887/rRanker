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
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';

const repository = new SqliteSnapshotRepository();
const AVATAR_RESOURCE_SCHEMA = 1;
const tufCache = new TufCache();
const accountAvatarInflight = new Map<string, Promise<string | null>>();
const phigrosSummaryInflight = new Map<string, Promise<PhigrosAccountHydration>>();
const phigrosSummaryCache = new Map<string, PhigrosAccountHydration>();

type StoredAccountAvatar = {
  avatarUrl: string;
};

export type PhigrosAccountHydration = {
  summary: Awaited<ReturnType<PhigrosScoreProvider['getSummary']>>;
  avatarUrl: string | null;
};

export function hydratePhigrosAccount(
  account: BoundAccount,
  session: ProviderSession,
  signal: AbortSignal = getForegroundAbortSignal(),
): Promise<PhigrosAccountHydration> {
  const cached = phigrosSummaryCache.get(account.id);
  if (cached) return Promise.resolve(cached);
  const existing = phigrosSummaryInflight.get(account.id);
  if (existing) return existing;
  const pending = (async () => {
    if (signal.aborted || session.mode !== 'phi-session') throw new Error('account hydration aborted');
    const provider = new PhigrosScoreProvider(session);
    const catalog = new PhigrosCatalogProvider();
    const [summary, gameVersion] = await Promise.all([
      provider.getSummary(signal),
      catalog.getGameVersion(signal),
    ]);
    if (signal.aborted) throw new Error('account hydration aborted');
    const result = {
      summary,
      avatarUrl: await resolvePhigrosAvatarUrl(gameVersion, summary.avatar),
    };
    if (!signal.aborted) phigrosSummaryCache.set(account.id, result);
    return result;
  })();
  phigrosSummaryInflight.set(account.id, pending);
  void pending.finally(() => {
    if (phigrosSummaryInflight.get(account.id) === pending) phigrosSummaryInflight.delete(account.id);
  }).catch(() => undefined);
  return pending;
}

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
  signal: AbortSignal,
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
      const player = await provider.getPlayer(signal);
      return buildChunithmMapIconUrl(player?.map_icon?.id);
    }
    const provider = new LxnsScoreProvider(
      session,
      (next) => applyLxnsTokenRotation(account.id, next),
    );
    const player = await provider.getPlayer(signal);
    return buildLxnsIconUrl(player.presentation?.iconId);
  } catch {
    return null;
  }
}

async function resolvePhigrosAvatarUrlForAccount(
  account: BoundAccount,
  session: ProviderSession | undefined,
  signal: AbortSignal,
): Promise<string | null> {
  const cached = await readCachedAvatarUrl(account.id);
  if (cached) return cached;

  if (session?.mode !== 'phi-session') return null;

  try {
    return (await hydratePhigrosAccount(account, session, signal)).avatarUrl;
  } catch {
    return null;
  }
}

async function resolveTufAvatarUrlForAccount(
  account: BoundAccount,
  signal: AbortSignal,
): Promise<string | null> {
  const persisted = await readCachedAvatarUrl(account.id);
  if (persisted) return persisted;
  const playerId = tufPlayerIdFromAccountId(account.id);
  if (playerId === null) return null;
  try {
    const cached = await tufCache.loadPlayer(playerId);
    const cachedAvatar = resolveTufAvatarUrl(cached?.data);
    if (cachedAvatar) return cachedAvatar;
    const player = await loadTufPlayerFresh(playerId, signal);
    if (!signal.aborted) void tufCache.savePlayer(playerId, makeTufSnapshot(player)).catch(() => undefined);
    return resolveTufAvatarUrl(player);
  } catch {
    return null;
  }
}

export async function resolveAccountAvatarUrl(
  account: BoundAccount,
  session: ProviderSession | undefined,
  signal: AbortSignal = getForegroundAbortSignal(),
): Promise<string | null> {
  const existing = accountAvatarInflight.get(account.id);
  if (existing) return existing;
  const pending = (async () => {
    if (signal.aborted) return null;
    const avatarUrl = account.providerId === 'lxns'
      ? await resolveLxnsAvatarUrl(account, session, signal)
      : account.providerId === 'phi-taptap'
        ? await resolvePhigrosAvatarUrlForAccount(account, session, signal)
        : account.providerId === 'tuf'
          ? await resolveTufAvatarUrlForAccount(account, signal)
          : null;
    return signal.aborted ? null : avatarUrl;
  })();
  accountAvatarInflight.set(account.id, pending);
  void pending.finally(() => {
    if (accountAvatarInflight.get(account.id) === pending) accountAvatarInflight.delete(account.id);
  }).catch(() => undefined);
  return pending;
}

export async function syncAllAccountAvatars(
  accounts: readonly BoundAccount[],
  sessionsByAccountId: Readonly<Record<string, ProviderSession>>,
  update: (accountId: string, avatarUrl: string) => void,
  signal: AbortSignal = getForegroundAbortSignal(),
): Promise<void> {
  const pending = accounts.filter((account) => (
    (account.providerId === 'lxns' || account.providerId === 'phi-taptap' || account.providerId === 'tuf')
    && !account.avatarUrl
  ));
  let nextIndex = 0;
  const worker = async () => {
    while (!signal.aborted) {
      const account = pending[nextIndex];
      nextIndex += 1;
      if (!account) return;
      const avatarUrl = await resolveAccountAvatarUrl(account, sessionsByAccountId[account.id], signal);
      if (!avatarUrl || signal.aborted) continue;

      update(account.id, avatarUrl);
      await persistBoundAccountAvatar(account.id, avatarUrl);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, () => worker()));
}
