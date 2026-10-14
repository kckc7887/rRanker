import { buildLxnsIconUrl, accountAvatarResourceKey, accountAvatarSchemaVersion, isPhigrosAvatarUrl } from '@/domain/account-avatar';
import { tufPlayerIdFromAccountId, type BoundAccount } from '@/domain/bound-account';
import { buildChunithmMapIconUrl, CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION, chunithmPersonalResourceKey, type ChunithmPersonalSnapshot } from '@/domain/chunithm-personal';
import { resolveTufAvatarUrl } from '@/domain/tuf';
import type { ProviderSession } from '@/providers/contracts';
import type { DataSource } from '@/domain/models';
import type { GameDataBundle, PhigrosGameDataPayload } from '@/domain/game-data';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';
import { applyLxnsTokenRotation, useSession } from '@/state/session-store';
import { resolveSessionProviders } from '@/state/session-provider-resolver';
import { queryClient } from '@/state/query-client';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { resolvePhigrosAvatarUrl } from '@/services/phigros-avatar-resolver';
import { captureAccountAvatarWrites, persistBoundAccountAvatar } from '@/services/resolve-account-avatar-persist';
import { PhigrosSaveCache } from '@/services/phigros-save-cache';
import { gameDataQueryKey } from '@/services/game-data-query';
import { createInflightGuard, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
import { loadTufPlayerFresh, makeTufSnapshot, TufCache } from '@/services/tuf-cache';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';

export type PhigrosAccountHydration = {
  summary: Pick<Awaited<ReturnType<PhigrosScoreProvider['getSummary']>>, 'rankingScore' | 'challengeModeRank'>;
  avatarUrl: string | null;
  displayName: string;
  source: DataSource;
};

const AVATAR_SYNC_CONCURRENCY = 3;
const repository = new SqliteSnapshotRepository();
const tufCache = new TufCache();
const phigrosSaveCache = new PhigrosSaveCache();

const accountAvatarInflight = createInflightGuard<string>();
const phigrosSummaryInflight = createInflightGuard<string>();

function avatarRequestKey(account: BoundAccount): string {
  return `${account.id}:${resourceWriteGeneration(account.gameId)}:${resourceWriteGeneration('account:' + account.id)}:${useSession.getState().credentialIdsByAccountId[account.id] ?? ''}`;
}

function currentPhigrosPayload(accountId: string): PhigrosGameDataPayload | null {
  const bundle = queryClient.getQueryData<GameDataBundle>(gameDataQueryKey(accountId, 'phigros', 'phi-taptap', 'phi-session'));
  return bundle?.payload.kind === 'phigros' ? bundle.payload : null;
}

function phigrosHydrationFromPayload(payload: PhigrosGameDataPayload): PhigrosAccountHydration {
  return {
    summary: { rankingScore: payload.playerScore.value, challengeModeRank: payload.challengeModeRank },
    avatarUrl: payload.avatarUrl ?? null,
    displayName: payload.player.displayName,
    source: payload.source,
  };
}

export function hydratePhigrosAccount(
  account: BoundAccount,
  session: ProviderSession,
  signal: AbortSignal = getForegroundAbortSignal(),
): Promise<PhigrosAccountHydration> {
  const assertAccount = captureAccountAvatarWrites(account.id);
  return phigrosSummaryInflight.share(avatarRequestKey(account), async requestSignal => {
    const assertCurrent = () => { if (requestSignal.aborted) throw requestSignal.reason; assertAccount(); };
    assertCurrent();
    if (session.mode !== 'phi-session') throw new Error('account hydration aborted');
    const committed = currentPhigrosPayload(account.id);
    if (committed) return phigrosHydrationFromPayload(committed);
    const stored = await phigrosSaveCache.load(account.id);
    assertCurrent();
    const available = currentPhigrosPayload(account.id) ?? stored;
    if (available) return phigrosHydrationFromPayload(available);
    const state = useSession.getState();
    const current = state.boundAccounts.find(item => item.id === account.id)!;
    const provider = resolveSessionProviders(current, state.credentialIdsByAccountId[account.id] ?? null,
      state.sessionsByAccountId[account.id] ?? session).scoreProvider;
    if (!(provider instanceof PhigrosScoreProvider)) throw new Error('Phigros account unavailable');
    const summary = await provider.getSummary(requestSignal);
    const avatarUrl = await resolvePhigrosAvatarUrl(summary.avatar, requestSignal);
    assertCurrent();
    const latest = currentPhigrosPayload(account.id);
    return latest ? phigrosHydrationFromPayload(latest) : {
      summary: { rankingScore: summary.rankingScore, challengeModeRank: summary.challengeModeRank },
      avatarUrl, displayName: current.displayName,
      source: { kind: 'generated', label: 'TapTap云存档', updatedAt: provider.getSaveUpdatedAt()!, isStale: false },
    };
  }, signal);
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
  assertCurrent: () => void,
): Promise<string | null> {
  const persisted = await readCachedAvatarUrl(account.id);
  if (persisted) return persisted;
  const playerId = tufPlayerIdFromAccountId(account.id);
  if (playerId === null) return null;
  try {
    const cachedAvatar = resolveTufAvatarUrl((await tufCache.loadPlayer(playerId))?.data);
    if (cachedAvatar) return cachedAvatar;
    const player = await loadTufPlayerFresh(playerId, signal);
    assertCurrent();
    if (!signal.aborted) await tufCache.savePlayer(playerId, makeTufSnapshot(player), assertCurrent).catch(error =>
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
  const assertAccount = captureAccountAvatarWrites(account.id);
  return accountAvatarInflight.share(avatarRequestKey(account), async requestSignal => {
    const assertCurrent = () => { if (requestSignal.aborted) throw requestSignal.reason; assertAccount(); };
    assertCurrent();
    const avatarUrl = account.providerId === 'lxns'
      ? await resolveLxnsAvatarUrl(account, session, requestSignal)
      : account.providerId === 'phi-taptap'
        ? await resolvePhigrosAvatarUrlForAccount(account, session, requestSignal)
        : account.providerId === 'tuf'
          ? await resolveTufAvatarUrlForAccount(account, requestSignal, assertCurrent)
          : null;
    assertCurrent();
    return avatarUrl;
  }, signal).catch(() => null);
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
  )).map(account => ({ account, assertCurrent: captureAccountAvatarWrites(account.id, signal) }));
  let nextIndex = 0;
  const worker = async () => {
    while (!signal.aborted) {
      const next = pending[nextIndex];
      nextIndex += 1;
      if (!next) return;
      const { account, assertCurrent } = next;
      try {
        assertCurrent();
        const avatarUrl = await resolveAccountAvatarUrl(account, sessionsByAccountId[account.id], signal);
        if (!avatarUrl) continue;
        assertCurrent();
        update(account.id, avatarUrl);
        await persistBoundAccountAvatar(account.id, avatarUrl, assertCurrent);
      } catch {
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AVATAR_SYNC_CONCURRENCY, pending.length) }, () => worker()));
}
