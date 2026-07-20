import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sqlite = vi.hoisted(() => ({
  getLatest: vi.fn(),
}));

vi.mock('@/state/session-store', () => ({
  applyLxnsTokenRotation: vi.fn(),
}));

vi.mock('@/storage/sqlite-snapshot-repository', () => ({
  SqliteSnapshotRepository: class {
    getLatest = sqlite.getLatest;
    getResource = vi.fn().mockResolvedValue(null);
    saveResource = vi.fn().mockResolvedValue(undefined);
    deleteResource = vi.fn().mockResolvedValue(undefined);
  },
}));

import { createMaimaiBoundAccount } from '@/domain/bound-account';
import { resolveAccountAvatarUrl } from '@/services/resolve-account-avatar';

const lxnsAccount = createMaimaiBoundAccount({
  providerId: 'lxns',
  displayName: '落雪玩家',
  rating: 15000,
  playerId: '123456789',
});

describe('resolveAccountAvatarUrl', () => {
  beforeEach(() => {
    sqlite.getLatest.mockReset();
    sqlite.getLatest.mockResolvedValue(null);
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
});
