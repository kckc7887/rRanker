import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MuseDashPlayer } from '@/domain/muse-dash';
import {
  MUSE_DASH_ALBUMS_CACHE_KEY,
  MUSE_DASH_CE_CACHE_KEY,
  MUSE_DASH_DIFFDIFF_CACHE_KEY,
  museDashPlayerCacheKey,
} from '@/domain/muse-dash';
import { museDashProvider } from '@/providers/muse-dash-provider';
import {
  loadMuseDashPlayerFresh,
  makeMuseDashSnapshot,
  MuseDashCache,
  resetMuseDashInflightForTests,
} from '@/services/muse-dash-cache';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getFirstAsync: vi.fn(async () => null),
    getAllAsync: vi.fn(async () => []),
    runAsync: vi.fn(async () => undefined),
  })),
}));

class FakeResourceRepository {
  private store = new Map<string, { version: number; updatedAt: string; payload: unknown }>();

  async getResource<T>(key: string, schemaVersion: number): Promise<T | null> {
    const row = this.store.get(key);
    if (!row) return null;
    if (row.version !== schemaVersion) {
      this.store.delete(key);
      return null;
    }
    return row.payload as T;
  }
  async saveResource<T>(key: string, schemaVersion: number, updatedAt: string, value: T): Promise<void> {
    this.store.set(key, { version: schemaVersion, updatedAt, payload: value });
  }
  async deleteResource(key: string): Promise<void> {
    this.store.delete(key);
  }
  async clearResources(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.store.delete(key);
  }
  async listResourceSizes(): Promise<{ key: string; bytes: number }[]> {
    return [...this.store.keys()].map((key) => ({ key, bytes: 0 }));
  }
}

const repo = new FakeResourceRepository();
const cache = new MuseDashCache(repo as unknown as SqliteSnapshotRepository);

const player: MuseDashPlayer = {
  rl: 3.45,
  plays: [],
  user: { user_id: '6ea4f986ffd211e8aa980242ac110011', nickname: '公开玩家' },
};

describe('muse dash cache keys', () => {
  it('builds stable namespaced resource keys', () => {
    expect(museDashPlayerCacheKey('6ea4f986ffd211e8aa980242ac110011'))
      .toBe('musedash:player:6ea4f986ffd211e8aa980242ac110011');
    expect(MUSE_DASH_ALBUMS_CACHE_KEY).toBe('musedash:albums');
    expect(MUSE_DASH_CE_CACHE_KEY).toBe('musedash:ce');
    expect(MUSE_DASH_DIFFDIFF_CACHE_KEY).toBe('musedash:diffdiff');
  });
});

describe('muse dash cache snapshots', () => {
  it('builds source metadata with musedash kind', () => {
    const snapshot = makeMuseDashSnapshot(player, '2026-08-10T00:00:00.000Z');
    expect(snapshot).toEqual({
      data: player,
      source: {
        kind: 'musedash',
        label: 'MuseDash.moe',
        updatedAt: '2026-08-10T00:00:00.000Z',
        isStale: false,
      },
    });
  });

  it('round-trips player snapshots and invalidates on schema version mismatch', async () => {
    await cache.savePlayer('6ea4f986ffd211e8aa980242ac110011', makeMuseDashSnapshot(player));
    expect((await cache.loadPlayer('6ea4f986ffd211e8aa980242ac110011'))?.data).toEqual(player);
  });

  it('round-trips play detail snapshots and clears them with the player on unbind', async () => {
    const detail = { play: { miss: 0, judge: 'ss' }, user: { nickname: '公开玩家' } };
    await cache.savePlayDetail('a', '13-5', 2, 'mobile', makeMuseDashSnapshot(detail));
    expect((await cache.loadPlayDetail('a', '13-5', 2, 'mobile'))?.data).toEqual(detail);
    await cache.savePlayer('a', makeMuseDashSnapshot(player));
    await cache.clearPlayer('a');
    expect(await cache.loadPlayer('a')).toBeNull();
    expect(await cache.loadPlayDetail('a', '13-5', 2, 'mobile')).toBeNull();
  });

  it('keeps global resources but clears player-owned caches on unbind', async () => {
    await cache.savePlayer('a', makeMuseDashSnapshot(player));
    await cache.savePlayer('b', makeMuseDashSnapshot({ ...player, user: { ...player.user, user_id: 'b' } }));
    await cache.saveAlbums(makeMuseDashSnapshot({}));
    await cache.clearPlayer('a');
    expect(await cache.loadPlayer('a')).toBeNull();
    expect((await cache.loadPlayer('b'))?.data.user.user_id).toBe('b');
    expect(await cache.loadAlbums()).not.toBeNull();
  });
});

describe('muse dash player inflight dedupe', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetMuseDashInflightForTests();
    spy = vi.spyOn(museDashProvider, 'getPlayer').mockImplementation(
      async (userId) => ({ ...player, user: { ...player.user, user_id: userId } }),
    );
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('shares one network request across concurrent loads', async () => {
    const [first, second] = await Promise.all([
      loadMuseDashPlayerFresh('a'),
      loadMuseDashPlayerFresh('a'),
    ]);
    expect(first.user.user_id).toBe('a');
    expect(second.user.user_id).toBe('a');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh request after the previous settled', async () => {
    await loadMuseDashPlayerFresh('a');
    await loadMuseDashPlayerFresh('a');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
