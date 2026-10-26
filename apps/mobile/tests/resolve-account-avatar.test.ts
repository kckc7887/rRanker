import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChunithmBoundAccount, createMaimaiBoundAccount, createPhigrosBoundAccount, createTufBoundAccount } from '@/domain/bound-account';
import type { PhigrosSummary } from '@/domain/phigros';
import type { ProviderSession } from '@/providers/contracts';
import { hydratePhigrosAccount, resolveAccountAvatarUrl, syncAllAccountAvatars } from '@/services/resolve-account-avatar';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { tufProvider } from '@/providers/tuf-provider';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { gameDataQueryKey } from '@/services/game-data-query';
import { phigrosPayloadFromSnapshot, type GameDataBundle, type PhigrosGameDataPayload } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { persistBoundAccountAvatar } from '@/services/resolve-account-avatar-persist';
import { hydratePhigrosAccountSummaries } from '@/services/hydrate-phigros-account-summaries';
import { SecureSessionStore } from '@/storage/secure-session-store';
import * as phigrosAuth from '@/providers/phigros-auth';

const sqlite = vi.hoisted(() => ({
  getLatest: vi.fn(),
  getResource: vi.fn(),
  saveResource: vi.fn(),
}));
const avatars = vi.hoisted(() => ({ resolve: vi.fn() }));
const lifecycle = vi.hoisted(() => ({ signal: new AbortController().signal }));

vi.mock('@/services/phigros-avatar-resolver', () => ({ resolvePhigrosAvatarUrl: avatars.resolve }));

vi.mock('@/state/app-lifecycle-core', () => ({
  getForegroundAbortSignal: () => lifecycle.signal,
}));

vi.mock('@/storage/sqlite-snapshot-repository', () => ({
  SqliteSnapshotRepository: class {
    getLatest = sqlite.getLatest;
    getResource = sqlite.getResource;
    saveResource = sqlite.saveResource;
    deleteResource = vi.fn().mockResolvedValue(undefined);
  },
}));

const lxnsAccount = createMaimaiBoundAccount({
  providerId: 'lxns',
  displayName: '落雪玩家',
  rating: 15000,
  playerId: '123456789',
});
const tufAccount = createTufBoundAccount({ playerId: 25, displayName: 'TUF 玩家' });
const phiSession: ProviderSession = { mode: 'phi-session', sessionToken: 'token', openid: 'player', displayName: 'player', persistable: true };
const lxnsSession: ProviderSession = {
  mode: 'lxns-oauth', accessToken: 'access-token', refreshToken: 'refresh-token',
  expiresAt: Date.now() + 120_000, persistable: true,
};
const summary: PhigrosSummary = {
  saveVersion: 1, challengeModeRank: 201, rankingScore: 15.4321, gameVersion: 301,
  avatar: 'avatar.Cipher1', cleared: [1, 2, 3, 4], fullCombo: [0, 1, 2, 3], phi: [0, 0, 1, 2],
};
const tufPlayer = {
  id: 25, name: 'TUF 玩家', rankedScore: 1, generalScore: 0, ppScore: 0,
  totalPasses: 0, universalPassCount: 0, worldFirstCount: 0, topScores: [], globalRank: null,
};

function bindPhigrosAccount(playerId: string) {
  const account = createPhigrosBoundAccount({ openid: playerId, displayName: playerId, rating: 15 });
  useSession.getState().upsertBoundAccount(account);
  useSession.setState(state => ({
    sessionsByAccountId: { ...state.sessionsByAccountId, [account.id]: phiSession },
    credentialIdsByAccountId: { ...state.credentialIdsByAccountId, [account.id]: `credential:${account.id}` },
  }));
  return account;
}

function phigrosPayload(rating: number, updatedAt = '2026-10-14T01:00:00.000Z'): PhigrosGameDataPayload {
  const source = { kind: 'generated' as const, label: 'TapTap云存档', updatedAt, isStale: false };
  return phigrosPayloadFromSnapshot({
    player: { id: 'player', displayName: '云存档玩家', rating, source },
    records: [], bestSections: [], challengeModeRank: 301, source,
    progress: { cleared: [1, 2, 3, 4], fullCombo: [0, 1, 2, 3], phi: [0, 0, 1, 2] },
  }, source, { avatarUrl: 'https://example.test/current-avatar.png' });
}

function publishPhigrosPayload(accountId: string, payload: PhigrosGameDataPayload) {
  queryClient.setQueryData<GameDataBundle>(gameDataQueryKey(accountId, 'phigros', 'phi-taptap', 'phi-session'), {
    gameId: 'phigros', providerId: 'phi-taptap', profile: getGameProfile('phigros'), payload,
  });
}

function summaryMetadata(rating: number) {
  const avatar = Buffer.from('avatar.Cipher1');
  const bytes = Buffer.alloc(9 + avatar.length + 24);
  bytes[0] = 1;
  bytes.writeUInt16LE(201, 1);
  bytes.writeFloatLE(rating, 3);
  bytes[7] = 1;
  bytes[8] = avatar.length;
  avatar.copy(bytes, 9);
  return { summaryBase64: bytes.toString('base64'), saveUrl: 'https://example.test/save', updatedAt: '2026-10-14T00:00:00.000Z' };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('resolveAccountAvatarUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    sqlite.getLatest.mockReset();
    sqlite.getLatest.mockResolvedValue(null);
    sqlite.getResource.mockReset();
    sqlite.getResource.mockResolvedValue(null);
    sqlite.saveResource.mockResolvedValue(undefined);
    queryClient.clear();
    for (const account of useSession.getState().boundAccounts) useSession.getState().removeBoundAccount(account.id);
    useSession.setState({
      boundAccounts: [lxnsAccount, tufAccount],
      sessionsByAccountId: { [lxnsAccount.id]: lxnsSession },
      credentialIdsByAccountId: { [lxnsAccount.id]: 'lxns-credential' },
    });
    vi.spyOn(SecureSessionStore.prototype, 'updateAccountMetadata').mockResolvedValue(undefined);
    lifecycle.signal = new AbortController().signal;
    avatars.resolve.mockImplementation(async (key: string) => `https://example.test/${key}.png`);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers LXNS icon id from snapshot before live fetch', async () => {
    sqlite.getLatest.mockResolvedValue({
      player: { presentation: { iconId: 255406 } },
    });

    await expect(resolveAccountAvatarUrl(lxnsAccount, {
      mode: 'lxns-oauth',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 120_000,
      persistable: true,
    })).resolves.toBe('https://assets2.lxns.net/maimai/icon/255406.png');
  });

  it('falls back to live LXNS player when snapshot has no icon', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      code: 200,
      data: {
        name: '落雪玩家',
        rating: 15000,
        friend_code: 123456789,
        icon: { id: 200201, name: '头像' },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(resolveAccountAvatarUrl(lxnsAccount, {
      mode: 'lxns-oauth',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 120_000,
      persistable: true,
    })).resolves.toBe('https://assets2.lxns.net/maimai/icon/200201.png');
  });

  it('uses the cached public TUF profile avatar', async () => {
    sqlite.getResource.mockResolvedValueOnce(null).mockResolvedValueOnce({
      data: { ...tufPlayer, avatarUrl: 'https://example.test/tuf-cache.png' },
      source: { kind: 'tuf', label: 'TUF', updatedAt: '', isStale: false },
    });
    await expect(resolveAccountAvatarUrl(tufAccount, undefined))
      .resolves.toBe('https://example.test/tuf-cache.png');
  });

  it('prefers the persisted account avatar over the public profile', async () => {
    sqlite.getResource.mockResolvedValue({ avatarUrl: 'https://example.test/account.png' });
    await expect(resolveAccountAvatarUrl(tufAccount, undefined)).resolves.toBe('https://example.test/account.png');
  });

  it('uses the cached Chunithm map icon without an active session', async () => {
    sqlite.getResource.mockResolvedValue({ player: { map_icon: { id: 1001001 } } });
    const account = createChunithmBoundAccount({ displayName: '中二玩家', rating: 16, playerId: '1' });
    useSession.getState().upsertBoundAccount(account);
    await expect(resolveAccountAvatarUrl(account, undefined))
      .resolves.toBe('https://assets2.lxns.net/chunithm/icon/1001001.png');
  });

  it('keeps the account usable when the avatar request fails', async () => {
    vi.spyOn(tufProvider, 'getPlayerProfile').mockRejectedValueOnce(new Error('unavailable'));
    await expect(resolveAccountAvatarUrl(tufAccount, undefined)).resolves.toBeNull();
  });

  it('returns no avatar when the foreground request has already been cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    lifecycle.signal = controller.signal;
    sqlite.getResource.mockResolvedValue({ avatarUrl: 'https://example.test/account.png' });
    await expect(resolveAccountAvatarUrl(tufAccount, undefined)).resolves.toBeNull();
  });

  it('shares Phigros summary hydration with avatar resolution', async () => {
    const account = bindPhigrosAccount('shared-summary');
    vi.spyOn(PhigrosScoreProvider.prototype, 'getSaveUpdatedAt').mockReturnValue('2026-10-14T00:00:00.000Z');
    const request = vi.spyOn(PhigrosScoreProvider.prototype, 'getSummary').mockResolvedValue(summary);
    const [hydration, avatar] = await Promise.all([
      hydratePhigrosAccount(account, phiSession), resolveAccountAvatarUrl(account, phiSession),
    ]);
    expect(hydration).toEqual({
      summary: { rankingScore: summary.rankingScore, challengeModeRank: summary.challengeModeRank },
      avatarUrl: 'https://example.test/avatar.Cipher1.png', displayName: account.displayName,
      source: { kind: 'generated', label: 'TapTap云存档', updatedAt: '2026-10-14T00:00:00.000Z', isStale: false },
    });
    expect(avatar).toBe(hydration.avatarUrl);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a cancelled Phigros summary on the next request', async () => {
    const account = bindPhigrosAccount('cancelled-summary');
    vi.spyOn(PhigrosScoreProvider.prototype, 'getSaveUpdatedAt').mockReturnValue('2026-10-14T00:00:00.000Z');
    const controller = new AbortController();
    const fresh = { ...summary, rankingScore: 16, avatar: 'avatar.Fresh' };
    vi.spyOn(PhigrosScoreProvider.prototype, 'getSummary')
      .mockImplementationOnce(async () => { controller.abort(); return summary; })
      .mockResolvedValueOnce(fresh);
    await expect(hydratePhigrosAccount(account, phiSession, controller.signal)).rejects.toThrow();
    await expect(hydratePhigrosAccount(account, phiSession))
      .resolves.toMatchObject({ summary: { rankingScore: 16, challengeModeRank: fresh.challengeModeRank }, avatarUrl: 'https://example.test/avatar.Fresh.png' });
  });

  it('refreshes the public TUF profile when cached avatar fields are missing', async () => {
    vi.spyOn(tufProvider, 'getPlayerProfile').mockResolvedValueOnce({
      id: 25, name: 'TUF 玩家', rankedScore: 1, generalScore: 0, ppScore: 0,
      totalPasses: 0, universalPassCount: 0, worldFirstCount: 0, topScores: [],
      avatarUrl: 'https://example.test/tuf-live.png', globalRank: null,
    });
    await expect(resolveAccountAvatarUrl(tufAccount, undefined))
      .resolves.toBe('https://example.test/tuf-live.png');
  });

  it('deduplicates concurrent hydration for the same account', async () => {
    let resolvePlayer!: (value: Awaited<ReturnType<typeof tufProvider.getPlayerProfile>>) => void;
    const pendingPlayer = new Promise<Awaited<ReturnType<typeof tufProvider.getPlayerProfile>>>((resolve) => {
      resolvePlayer = resolve;
    });
    const request = vi.spyOn(tufProvider, 'getPlayerProfile').mockReturnValue(pendingPlayer);

    const first = resolveAccountAvatarUrl(tufAccount, undefined);
    const second = resolveAccountAvatarUrl(tufAccount, undefined);
    resolvePlayer({
      id: 25, name: 'TUF 玩家', rankedScore: 1, generalScore: 0, ppScore: 0,
      totalPasses: 0, universalPassCount: 0, worldFirstCount: 0, topScores: [],
      avatarUrl: 'https://example.test/tuf-live.png', globalRank: null,
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      'https://example.test/tuf-live.png',
      'https://example.test/tuf-live.png',
    ]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('limits account hydration to three concurrent requests', async () => {
    let active = 0;
    let maximum = 0;
    const batchStarted = Promise.withResolvers<void>();
    const releaseBatch = Promise.withResolvers<void>();
    vi.spyOn(tufProvider, 'getPlayerProfile').mockImplementation(async (playerId) => {
      active += 1;
      maximum = Math.max(maximum, active);
      if (active === 3) batchStarted.resolve();
      await releaseBatch.promise;
      active -= 1;
      return {
        id: playerId, name: `TUF ${playerId}`, rankedScore: 1, generalScore: 0, ppScore: 0,
        totalPasses: 0, universalPassCount: 0, worldFirstCount: 0, topScores: [],
        avatarUrl: `https://example.test/${playerId}.png`, globalRank: null,
      };
    });
    const accounts = Array.from({ length: 8 }, (_, index) => createTufBoundAccount({
      playerId: 100 + index,
      displayName: `TUF ${index}`,
    }));
    for (const account of accounts) useSession.getState().upsertBoundAccount(account);

    const updates: Record<string, string> = {};
    const pending = syncAllAccountAvatars(accounts, {}, (id, url) => { updates[id] = url; }, new AbortController().signal);
    await batchStarted.promise;
    releaseBatch.resolve();
    await pending;

    expect(maximum).toBe(3);
    expect(updates).toEqual(Object.fromEntries(accounts.map((account, index) => [account.id, `https://example.test/${100 + index}.png`])));
    for (const [id, avatarUrl] of Object.entries(updates)) {
      expect(sqlite.saveResource).toHaveBeenCalledWith(`account-avatar:${id}`, 1, expect.any(String), { avatarUrl }, expect.any(Function));
    }
  });

  it('uses the current Phigros payload after refreshing a previously hydrated account', async () => {
    const account = bindPhigrosAccount('refreshed-summary');
    vi.spyOn(phigrosAuth, 'getGameSave').mockResolvedValue(summaryMetadata(15));
    await expect(hydratePhigrosAccount(account, phiSession)).resolves.toMatchObject({ summary: { rankingScore: 15 } });

    const payload = phigrosPayload(16);
    publishPhigrosPayload(account.id, payload);
    sqlite.getResource.mockResolvedValue(phigrosPayload(14, '2026-10-13T00:00:00.000Z'));
    await expect(hydratePhigrosAccount(account, phiSession)).resolves.toEqual({
      summary: { rankingScore: 16, challengeModeRank: 301 }, avatarUrl: payload.avatarUrl,
      displayName: payload.player.displayName, source: payload.source,
    });
    await hydratePhigrosAccountSummaries();
    expect(useSession.getState().boundAccounts.find(item => item.id === account.id)).toMatchObject({
      scoreDisplay: '16.0000', challengeModeRank: 301, displayName: '云存档玩家',
    });
    expect(SecureSessionStore.prototype.updateAccountMetadata).toHaveBeenCalledWith(account.id, expect.objectContaining({
      scoreDisplay: '16.0000', challengeModeRank: 301, displayName: '云存档玩家',
    }), expect.any(Function));
  });

  it('uses a query published while the Phigros disk snapshot is being read', async () => {
    const account = bindPhigrosAccount('reading-summary');
    const reading = deferred<void>();
    const stored = deferred<PhigrosGameDataPayload>();
    sqlite.getResource.mockImplementation(async () => { reading.resolve(); return stored.promise; });
    const pending = hydratePhigrosAccount(account, phiSession);
    await reading.promise;
    publishPhigrosPayload(account.id, phigrosPayload(16));
    stored.resolve(phigrosPayload(14, '2026-10-13T00:00:00.000Z'));
    await expect(pending).resolves.toMatchObject({ summary: { rankingScore: 16 }, source: { updatedAt: '2026-10-14T01:00:00.000Z' } });
  });

  it('uses a stored Phigros payload without changing its cloud save time', async () => {
    const account = bindPhigrosAccount('stored-summary');
    sqlite.getResource.mockResolvedValue(phigrosPayload(15, '2026-10-13T02:00:00.000Z'));
    vi.spyOn(phigrosAuth, 'getGameSave').mockRejectedValue(new Error('offline'));
    await expect(hydratePhigrosAccount(account, phiSession)).resolves.toMatchObject({
      summary: { rankingScore: 15 }, source: { updatedAt: '2026-10-13T02:00:00.000Z' },
    });
  });

  it('reuses the account Provider summary when no complete Phigros snapshot exists', async () => {
    const account = bindPhigrosAccount('provider-summary');
    const upstream = vi.spyOn(phigrosAuth, 'getGameSave').mockResolvedValue(summaryMetadata(15));
    const first = await hydratePhigrosAccount(account, phiSession);
    upstream.mockRejectedValue(new Error('offline'));
    await expect(hydratePhigrosAccount(account, phiSession, new AbortController().signal)).resolves.toEqual(first);
    expect(first.source.updatedAt).toBe('2026-10-14T00:00:00.000Z');
  });

  it('does not treat a Phigros storage read failure as an absent snapshot', async () => {
    const account = bindPhigrosAccount('storage-failure');
    sqlite.getResource.mockRejectedValue(new Error('storage unavailable'));
    await expect(hydratePhigrosAccount(account, phiSession)).rejects.toThrow('storage unavailable');
  });

  it.each(['game-clear', 'unbind-and-rebind'] as const)('does not publish an avatar after %s', async action => {
    const started = deferred<void>();
    const response = deferred<typeof tufPlayer & { avatarUrl: string }>();
    vi.spyOn(tufProvider, 'getPlayerProfile').mockImplementation(async () => { started.resolve(); return response.promise; });
    const update = vi.fn();
    const pending = syncAllAccountAvatars([tufAccount], {}, update);
    await started.promise;
    if (action === 'game-clear') invalidateResourceWrites('adofai');
    else {
      useSession.getState().removeBoundAccount(tufAccount.id);
      useSession.getState().upsertBoundAccount(tufAccount);
    }
    response.resolve({ ...tufPlayer, avatarUrl: 'https://example.test/late.png' });
    await pending;
    expect(update).not.toHaveBeenCalled();
    expect(sqlite.saveResource).not.toHaveBeenCalled();
  });

  it('does not reuse shared avatar work across account removal', async () => {
    const started = deferred<void>();
    const oldResponse = deferred<typeof tufPlayer & { avatarUrl: string }>();
    vi.spyOn(tufProvider, 'getPlayerProfile')
      .mockImplementationOnce(async () => { started.resolve(); return oldResponse.promise; })
      .mockResolvedValueOnce({ ...tufPlayer, avatarUrl: 'https://example.test/new.png' });
    const old = resolveAccountAvatarUrl(tufAccount, undefined);
    await started.promise;
    useSession.getState().removeBoundAccount(tufAccount.id);
    useSession.getState().upsertBoundAccount(tufAccount);
    await expect(resolveAccountAvatarUrl(tufAccount, undefined)).resolves.toBe('https://example.test/new.png');
    oldResponse.resolve({ ...tufPlayer, avatarUrl: 'https://example.test/old.png' });
    await expect(old).resolves.toBeNull();
    expect(sqlite.saveResource.mock.calls.map(call => call[3]?.data?.avatarUrl)).not.toContain('https://example.test/old.png');
  });

  it('retains the initial cache generation before shared avatar work starts', async () => {
    sqlite.getResource.mockResolvedValue({ avatarUrl: 'https://example.test/obsolete.png' });
    const pending = resolveAccountAvatarUrl(tufAccount, undefined);
    invalidateResourceWrites('adofai');
    await expect(pending).resolves.toBeNull();
  });

  it('allows another consumer to finish when one avatar consumer cancels', async () => {
    const started = deferred<void>();
    const response = deferred<typeof tufPlayer & { avatarUrl: string }>();
    vi.spyOn(tufProvider, 'getPlayerProfile').mockImplementation(async () => { started.resolve(); return response.promise; });
    const controller = new AbortController();
    const canceled = resolveAccountAvatarUrl(tufAccount, undefined, controller.signal);
    const remaining = resolveAccountAvatarUrl(tufAccount, undefined, new AbortController().signal);
    await started.promise;
    controller.abort();
    response.resolve({ ...tufPlayer, avatarUrl: 'https://example.test/shared.png' });
    await expect(canceled).resolves.toBeNull();
    await expect(remaining).resolves.toBe('https://example.test/shared.png');
  });

  it('allows LXNS rotation and switching the active account during avatar loading', async () => {
    const expired: ProviderSession = { ...lxnsSession, refreshToken: 'avatar-rotation-old', expiresAt: 0 };
    useSession.setState({ sessionsByAccountId: { [lxnsAccount.id]: expired } });
    vi.spyOn(SecureSessionStore.prototype, 'updateCredentialSession').mockResolvedValue('applied');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/oauth/token')) return new Response(JSON.stringify({
        access_token: 'avatar-rotation-access', refresh_token: 'avatar-rotation-new', expires_in: 3600,
      }), { status: 200 });
      useSession.getState().selectBoundAccount(tufAccount.id);
      return new Response(JSON.stringify({ success: true, code: 200, data: {
        name: '落雪玩家', rating: 15000, friend_code: 123456789, icon: { id: 200201, name: '头像' },
      } }), { status: 200 });
    }));
    const update = vi.fn();
    await syncAllAccountAvatars([lxnsAccount], { [lxnsAccount.id]: expired }, update);
    expect(update).toHaveBeenCalledWith(lxnsAccount.id, 'https://assets2.lxns.net/maimai/icon/200201.png');
    expect(useSession.getState().sessionsByAccountId[lxnsAccount.id]).toMatchObject({ refreshToken: 'avatar-rotation-new' });
    expect(useSession.getState().activeAccountId).toBe(tufAccount.id);
  });

  it('rejects an avatar when its credential is replaced before the disk lookup finishes', async () => {
    const started = deferred<void>();
    const snapshot = deferred<{ player: { presentation: { iconId: number } } }>();
    sqlite.getLatest.mockImplementation(async () => { started.resolve(); return snapshot.promise; });
    const result = resolveAccountAvatarUrl(lxnsAccount, lxnsSession);
    await started.promise;
    useSession.setState({ credentialIdsByAccountId: { [lxnsAccount.id]: 'new-lxns-credential' } });
    snapshot.resolve({ player: { presentation: { iconId: 200201 } } });
    await expect(result).resolves.toBeNull();
  });

  it('checks account eligibility again before an avatar queued for storage is committed', async () => {
    const started = deferred<void>();
    const saved = deferred<void>();
    sqlite.saveResource.mockImplementation(async (_key, _schema, _time, _value, assertCurrent: () => void) => {
      started.resolve();
      await saved.promise;
      assertCurrent();
    });
    const pending = persistBoundAccountAvatar(lxnsAccount.id, 'https://example.test/queued.png');
    const rejected = expect(pending).rejects.toThrow();
    await started.promise;
    useSession.getState().removeBoundAccount(lxnsAccount.id);
    useSession.getState().upsertBoundAccount(lxnsAccount);
    saved.resolve();
    await rejected;
  });
});
