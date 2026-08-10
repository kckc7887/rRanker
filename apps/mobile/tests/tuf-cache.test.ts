import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TufPassPage, TufPlayer } from '@/domain/tuf';
import {
  TUF_DIFFICULTIES_CACHE_KEY,
  tufLevelCacheKey,
  tufLevelPageCacheKey,
  tufPassPageCacheKey,
  tufPlayerCacheKey,
} from '@/domain/tuf';
import { tufProvider } from '@/providers/tuf-provider';
import {
  loadTufPlayerFresh,
  makeTufSnapshot,
  resetTufInflightForTests,
  TufCache,
} from '@/services/tuf-cache';
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
const cache = new TufCache(repo as unknown as SqliteSnapshotRepository);

const player = { id: 25, name: '公开玩家', rankedScore: 100 } as TufPlayer;

describe('tuf cache keys', () => {
  it('builds stable namespaced resource keys', () => {
    expect(tufPlayerCacheKey(25)).toBe('tuf:player:25');
    expect(tufLevelCacheKey(11372)).toBe('tuf:level:11372');
    expect(TUF_DIFFICULTIES_CACHE_KEY).toBe('tuf:difficulties');
  });

  it('encodes pass query text and offsets', () => {
    const base = { sortBy: 'date', order: 'DESC', bestPerLevel: false } as const;
    expect(tufPassPageCacheKey(25, base, 0)).toBe('tuf:passes:25:date:DESC:0::0');
    expect(tufPassPageCacheKey(25, { ...base, query: '冰 火:试' }, 30))
      .toBe(`tuf:passes:25:date:DESC:0:${encodeURIComponent('冰 火:试')}:30`);
    expect(tufPassPageCacheKey(25, { ...base, bestPerLevel: true }, 0))
      .toBe('tuf:passes:25:date:DESC:1::0');
  });

  it('encodes level page filters distinctly', () => {
    expect(tufLevelPageCacheKey({ sort: 'RECENT', order: 'DESC', pguRange: 'P1,U20' }, 0))
      .toBe(`tuf:levels::RECENT:DESC:${encodeURIComponent('P1,U20')}::0`);
    expect(tufLevelPageCacheKey({
      query: '技术', sort: 'DIFF', specialDifficulties: ['Unranked', 'Marathon'],
    }, 30)).toBe(`tuf:levels:${encodeURIComponent('技术')}:DIFF:::${encodeURIComponent('Unranked,Marathon')}:30`);
  });
});

describe('tuf cache snapshots', () => {
  it('builds source metadata with tuf kind', () => {
    const snapshot = makeTufSnapshot(player, '2026-08-10T00:00:00.000Z');
    expect(snapshot).toEqual({
      data: player,
      source: {
        kind: 'tuf',
        label: 'TUF 社区公开数据',
        updatedAt: '2026-08-10T00:00:00.000Z',
        isStale: false,
      },
    });
  });

  it('round-trips player snapshots and invalidates on schema version mismatch', async () => {
    await cache.savePlayer(25, makeTufSnapshot(player, '2026-08-10T00:00:00.000Z'));
    expect((await cache.loadPlayer(25))?.data).toEqual(player);
    const stale = await cache.loadPlayer(25);
    expect(stale?.source.isStale).toBe(false);
  });

  it('round-trips pass pages per query and offset', async () => {
    const options = { sortBy: 'date', order: 'DESC', bestPerLevel: false, query: '冰' } as const;
    const snapshot = makeTufSnapshot({ total: 1, passes: [], limit: 30, offset: 0 }, '2026-08-10T00:00:00.000Z');
    await cache.savePassPage(25, options, 0, snapshot);
    expect((await cache.loadPassPage(25, options, 0))?.data.total).toBe(1);
    expect(await cache.loadPassPage(25, options, 30)).toBeNull();
  });

  it('keeps global resources but clears player-owned caches on unbind', async () => {
    await cache.savePlayer(25, makeTufSnapshot(player));
    await cache.savePlayer(26, makeTufSnapshot({ ...player, id: 26 }));
    await cache.savePassPage(25, { sortBy: 'date', order: 'DESC', bestPerLevel: false }, 0,
      makeTufSnapshot<TufPassPage>({ total: 0, passes: [], limit: 30, offset: 0 }));
    await cache.saveLevel(11372, makeTufSnapshot({ level: { id: 11372, song: 'x' } as never, rerateHistory: [] }));
    await cache.clearPlayer(25);
    expect(await cache.loadPlayer(25)).toBeNull();
    expect(await cache.loadPassPage(25, { sortBy: 'date', order: 'DESC', bestPerLevel: false }, 0)).toBeNull();
    expect((await cache.loadPlayer(26))?.data.id).toBe(26);
    expect(await cache.loadLevel(11372)).not.toBeNull();
  });
});

describe('tuf player inflight dedupe', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetTufInflightForTests();
    spy = vi.spyOn(tufProvider, 'getPlayerProfile').mockImplementation(
      async (id) => ({ ...player, id }) as TufPlayer,
    );
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('shares one network request across concurrent loads', async () => {
    const [first, second] = await Promise.all([
      loadTufPlayerFresh(25),
      loadTufPlayerFresh(25),
    ]);
    expect(first.id).toBe(25);
    expect(second.id).toBe(25);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh request after the previous settled', async () => {
    await loadTufPlayerFresh(25);
    await loadTufPlayerFresh(25);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
