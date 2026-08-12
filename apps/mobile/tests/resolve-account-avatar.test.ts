import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sqlite = vi.hoisted(() => ({
  getLatest: vi.fn(),
  getResource: vi.fn(),
}));

vi.mock('@/state/session-store', () => ({
  applyLxnsTokenRotation: vi.fn(),
}));

vi.mock('@/storage/sqlite-snapshot-repository', () => ({
  SqliteSnapshotRepository: class {
    getLatest = sqlite.getLatest;
    getResource = sqlite.getResource;
    saveResource = vi.fn().mockResolvedValue(undefined);
    deleteResource = vi.fn().mockResolvedValue(undefined);
  },
}));

import { createMaimaiBoundAccount, createTufBoundAccount } from '@/domain/bound-account';
import { resolveAccountAvatarUrl } from '@/services/resolve-account-avatar';
import { tufProvider } from '@/providers/tuf-provider';

const lxnsAccount = createMaimaiBoundAccount({
  providerId: 'lxns',
  displayName: '落雪玩家',
  rating: 15000,
  playerId: '123456789',
});
const tufAccount = createTufBoundAccount({ playerId: 25, displayName: 'TUF 玩家' });

describe('resolveAccountAvatarUrl', () => {
  beforeEach(() => {
    sqlite.getLatest.mockReset();
    sqlite.getLatest.mockResolvedValue(null);
    sqlite.getResource.mockReset();
    sqlite.getResource.mockResolvedValue(null);
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

  it('fills an old TUF account avatar from the cached public profile', async () => {
    sqlite.getResource.mockResolvedValueOnce(null).mockResolvedValueOnce({
      data: { id: 25, name: 'TUF 玩家', pfp: 'https://example.test/tuf-cache.png' },
      source: { kind: 'tuf', label: 'TUF', updatedAt: '', isStale: false },
    });
    await expect(resolveAccountAvatarUrl(tufAccount, undefined))
      .resolves.toBe('https://example.test/tuf-cache.png');
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
});
