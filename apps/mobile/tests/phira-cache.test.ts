import { describe, expect, it, vi } from 'vitest';
import { isPhiraCatalogHomeRequest } from '@/domain/phira';
import { PhiraCache } from '@/services/phira-cache';
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {} }));

class MemoryRepo {
  values = new Map<string, unknown>();
  getResource<T>(key: string) { return Promise.resolve((this.values.get(key) as T) ?? null); }
  saveResource<T>(key: string, _version: number, _updatedAt: string, value: T) { this.values.set(key, value); return Promise.resolve(); }
  clearResources(keys: readonly string[]) { keys.forEach((key) => this.values.delete(key)); return Promise.resolve(); }
}

const source = { kind: 'phira' as const, label: 'Phira', updatedAt: '2026-08-13T00:00:00.000Z', isStale: false };
const chart = { id: 38294, name: 'Song', level: 'IN', difficulty: 15, charter: '', composer: '', illustrator: null, ranked: true, stable: true, uploader: 1, tags: [], ratingCount: 0 };

describe('PhiraCache', () => {
  it('仅将 ranked 空搜索第一页识别为曲库首页', () => {
    expect(isPhiraCatalogHomeRequest('ranked', 0, '')).toBe(true);
    expect(isPhiraCatalogHomeRequest('ranked', 0, 'song')).toBe(false);
    expect(isPhiraCatalogHomeRequest('ranked', 2, '')).toBe(false);
    expect(isPhiraCatalogHomeRequest('special', 0, '')).toBe(false);
  });

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
});
