import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChunithmBoundAccount, createMaimaiBoundAccount, createPhigrosBoundAccount, createTufBoundAccount } from '@/domain/bound-account';
import type { PhigrosSummary } from '@/domain/phigros';
import type { ProviderSession } from '@/providers/contracts';
import { hydratePhigrosAccount, resolveAccountAvatarUrl, syncAllAccountAvatars } from '@/services/resolve-account-avatar';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { tufProvider } from '@/providers/tuf-provider';

const sqlite = vi.hoisted(() => ({
  getLatest: vi.fn(),
  getResource: vi.fn(),
  saveResource: vi.fn(),
}));
const avatars = vi.hoisted(() => ({ resolve: vi.fn() }));
const lifecycle = vi.hoisted(() => ({ signal: new AbortController().signal }));

vi.mock('@/services/phigros-avatar-resolver', () => ({ resolvePhigrosAvatarUrl: avatars.resolve }));

vi.mock('@/state/session-store', () => ({
  applyLxnsTokenRotation: vi.fn(),
}));

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
const phiSession: ProviderSession = { mode: 'phi-session', sessionToken: 'token', playerId: 'player', persistable: true };
const summary: PhigrosSummary = {
  saveVersion: 1, challengeModeRank: 201, rankingScore: 15.4321, gameVersion: 301,
  avatar: 'avatar.Cipher1', cleared: [1, 2, 3, 4], fullCombo: [0, 1, 2, 3], phi: [0, 0, 1, 2],
};
const tufPlayer = {
  id: 25, name: 'TUF 玩家', rankedScore: 1, generalScore: 0, ppScore: 0,
  totalPasses: 0, universalPassCount: 0, worldFirstCount: 0, topScores: [], globalRank: null,
};

describe('resolveAccountAvatarUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    sqlite.getLatest.mockReset();
    sqlite.getLatest.mockResolvedValue(null);
    sqlite.getResource.mockReset();
    sqlite.getResource.mockResolvedValue(null);
    sqlite.saveResource.mockResolvedValue(undefined);
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
    const account = createPhigrosBoundAccount({ playerId: 'shared-summary', rating: 15 });
    const request = vi.spyOn(PhigrosScoreProvider.prototype, 'getSummary').mockResolvedValue(summary);
    const [hydration, avatar] = await Promise.all([
      hydratePhigrosAccount(account, phiSession), resolveAccountAvatarUrl(account, phiSession),
    ]);
    expect(hydration).toEqual({ summary, avatarUrl: 'https://example.test/avatar.Cipher1.png' });
    expect(avatar).toBe(hydration.avatarUrl);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a cancelled Phigros summary on the next request', async () => {
    const account = createPhigrosBoundAccount({ playerId: 'cancelled-summary', rating: 15 });
    const controller = new AbortController();
    const fresh = { ...summary, rankingScore: 16, avatar: 'avatar.Fresh' };
    vi.spyOn(PhigrosScoreProvider.prototype, 'getSummary')
      .mockImplementationOnce(async () => { controller.abort(); return summary; })
      .mockResolvedValueOnce(fresh);
    await expect(hydratePhigrosAccount(account, phiSession, controller.signal)).rejects.toThrow();
    await expect(hydratePhigrosAccount(account, phiSession))
      .resolves.toEqual({ summary: fresh, avatarUrl: 'https://example.test/avatar.Fresh.png' });
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
    vi.spyOn(tufProvider, 'getPlayerProfile').mockImplementation(async (playerId) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
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

    const updates: Record<string, string> = {};
    await syncAllAccountAvatars(accounts, {}, (id, url) => { updates[id] = url; }, new AbortController().signal);

    expect(maximum).toBe(3);
    expect(updates).toEqual(Object.fromEntries(accounts.map((account, index) => [account.id, `https://example.test/${100 + index}.png`])));
    for (const [id, avatarUrl] of Object.entries(updates)) {
      expect(sqlite.saveResource).toHaveBeenCalledWith(`account-avatar:${id}`, 1, expect.any(String), { avatarUrl }, expect.any(Function));
    }
  });
});
