import { describe, expect, it, vi } from 'vitest';
import type { PhiraQueriedBest } from '@/domain/phira';
import { PhiraCache } from '@/services/phira-cache';
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {} }));

/**
 * 内存仓储复刻真实仓储的读改写边界：
 * 读在 await 之前取快照，只有 `updateResource` 是单次原子读改写。
 * 绕过 `updateResource` 的 load → merge → save 会在并发交错下丢更新。
 */
class MemoryRepo {
  values = new Map<string, unknown>();
  async getResource<T>(key: string) {
    const snapshot = this.values.get(key) as T | undefined;
    await Promise.resolve();
    return snapshot ?? null;
  }
  async saveResource<T>(key: string, _version: number, _updatedAt: string, value: T) {
    this.values.set(key, value);
    return Promise.resolve();
  }
  async updateResource<T>(key: string, _version: number,
    transform: (previous: T | null) => { value: T; updatedAt: string }) {
    const { value } = transform((this.values.get(key) as T | undefined) ?? null);
    this.values.set(key, value);
    return Promise.resolve(value);
  }
  clearResources(keys: readonly string[]) { keys.forEach((key) => this.values.delete(key)); return Promise.resolve(); }
}

const source = { kind: 'phira' as const, label: 'Phira', updatedAt: '2026-08-13T00:00:00.000Z', isStale: false };
const chart = { id: 38294, name: 'Song', level: 'IN', difficulty: 15, charter: '', composer: '', illustrator: null, ranked: true, stable: true, uploader: 1, tags: [], ratingCount: 0 };
const best = (chartId: number, score = 900_000): PhiraQueriedBest => ({
  chart: { ...chart, id: chartId },
  record: { id: chartId, chart: chartId, score, accuracy: .98, perfect: 0, good: 0, bad: 0, miss: 0, fullCombo: false, best: true, created: null },
  poolRks: null,
  queriedAt: source.updatedAt,
});

describe('PhiraCache', () => {
  it('isolates queried-best tombstones by player and expands only that account', async () => {
    const repo = new MemoryRepo(); const cache = new PhiraCache(repo as never);
    const tombstone = { chart, record: null, poolRks: null, queriedAt: source.updatedAt };
    await cache.mergeBests(1, [tombstone]);
    expect((await cache.loadBests(1))?.items['38294'].record).toBeNull();
    expect(await cache.loadBests(2)).toBeNull();
  });

  it('invalidates note counts when chartUpdated changes at the consumer boundary', async () => {
    const repo = new MemoryRepo(); const cache = new PhiraCache(repo as never);
    await cache.saveNotes(38294, { chartUpdated: 'old', counts: { click: 1, hold: 0, flick: 0, drag: 0 }, source });
    expect((await cache.loadNotes(38294))?.chartUpdated).not.toBe('new');
  });

  it('keeps both charts when two merges of one account overlap', async () => {
    const repo = new MemoryRepo(); const cache = new PhiraCache(repo as never);
    await Promise.all([cache.mergeBests(1, [best(101)]), cache.mergeBests(1, [best(102)])]);
    expect(Object.keys((await cache.loadBests(1))?.items ?? {}).sort()).toEqual(['101', '102']);
  });

  it('lets the later merge win on the same chart and keeps the other chart of the same batch', async () => {
    const repo = new MemoryRepo(); const cache = new PhiraCache(repo as never);
    const first = cache.mergeBests(1, [best(201, 900_000), best(202, 900_000)]);
    const second = cache.mergeBests(1, [best(201, 950_000)]);
    await Promise.all([first, second]);
    const items = (await cache.loadBests(1))?.items ?? {};
    expect(items['201'].record?.score).toBe(950_000);
    expect(items['202']).toBeDefined();
  });

  it('keeps the previous update time when merging no value', async () => {
    const repo = new MemoryRepo(); const cache = new PhiraCache(repo as never);
    const seeded = await cache.mergeBests(1, [best(301)]);
    const update = vi.spyOn(repo, 'updateResource');
    const result = await cache.mergeBests(1, []);
    expect(update).not.toHaveBeenCalled();
    expect(result?.source.updatedAt).toBe(seeded?.source.updatedAt);
    expect(Object.keys(result?.items ?? {})).toEqual(['301']);
  });
});
