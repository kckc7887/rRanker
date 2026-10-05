import { buildLxnsIconUrl, accountAvatarResourceKey, accountAvatarSchemaVersion, isPhigrosAvatarUrl } from '@/domain/account-avatar';
import { tufPlayerIdFromAccountId, type BoundAccount } from '@/domain/bound-account';
import { buildChunithmMapIconUrl, CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION, chunithmPersonalResourceKey, type ChunithmPersonalSnapshot } from '@/domain/chunithm-personal';
import { resolveTufAvatarUrl } from '@/domain/tuf';
import type { ProviderSession } from '@/providers/contracts';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';
import { applyLxnsTokenRotation } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { resolvePhigrosAvatarUrl } from '@/services/phigros-avatar-resolver';
import { persistBoundAccountAvatar } from '@/services/resolve-account-avatar-persist';
import { loadTufPlayerFresh, makeTufSnapshot, TufCache } from '@/services/tuf-cache';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';

export type PhigrosAccountHydration = {
  summary: Awaited<ReturnType<PhigrosScoreProvider['getSummary']>>;
  avatarUrl: string | null;
};

const AVATAR_SYNC_CONCURRENCY = 3;
const repository = new SqliteSnapshotRepository();
const tufCache = new TufCache();

const accountAvatarInflight = new Map<string, Promise<string | null>>();
const phigrosSummaryInflight = new Map<string, Promise<PhigrosAccountHydration>>();
const phigrosSummaryCache = new Map<string, PhigrosAccountHydration>();

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
    const summary = await new PhigrosScoreProvider(session).getSummary(signal);
    const result = { summary, avatarUrl: await resolvePhigrosAvatarUrl(summary.avatar, signal) };
    if (signal.aborted) throw new Error('account hydration aborted');
    phigrosSummaryCache.set(account.id, result);
    return result;
  })();
  phigrosSummaryInflight.set(account.id, pending);
  void pending.finally(() => {
    if (phigrosSummaryInflight.get(account.id) === pending) phigrosSummaryInflight.delete(account.id);
  }).catch(() => undefined);
  return pending;
}

function readCachedAvatarUrl(accountId: string): Promise<string | null> {
  return repository
    .getResource<{ avatarUrl: string }>(accountAvatarResourceKey(accountId), accountAvatarSchemaVersion(accountId))
    .then((cached) => cached?.avatarUrl ?? null);
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
      const provider = new ChunithmScoreProvider(session, update => applyLxnsTokenRotation(account.id, update));
      return buildChunithmMapIconUrl((await provider.getPlayer(signal))?.map_icon?.id);
    }
    const provider = new LxnsScoreProvider(session, update => applyLxnsTokenRotation(account.id, update));
    return buildLxnsIconUrl((await provider.getPlayer(signal)).presentation?.iconId);
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
    const cachedAvatar = resolveTufAvatarUrl((await tufCache.loadPlayer(playerId))?.data);
    if (cachedAvatar) return cachedAvatar;
    const player = await loadTufPlayerFresh(playerId, signal);
    if (!signal.aborted) void tufCache.savePlayer(playerId, makeTufSnapshot(player)).catch(error =>
      recordRuntimeDiagnostic('operation', { source: 'account-avatar', gameType: 'adofai', phase: 'cache-persist', result: signal.aborted ? 'cancelled' : 'failed', error }));
    return resolveTufAvatarUrl(player);
  } catch {
    return null;
  }
}

export function resolveAccountAvatarUrl(
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
    && (!account.avatarUrl || (account.gameId === 'phigros' && !isPhigrosAvatarUrl(account.avatarUrl)))
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
  await Promise.all(Array.from({ length: Math.min(AVATAR_SYNC_CONCURRENCY, pending.length) }, () => worker()));
}
