import { describe, expect, it, vi } from 'vitest';
import { OsuCache, makeOsuSnapshot } from '@/services/osu-cache';
import {
  isOsuCatalogHomeRequest,
  normalizeOsuSnapshot,
  osuCatalogHomeCacheKey,
} from '@/domain/osu';

// 避免加载真实 SQLite 仓库（其依赖链进入 react-native，node 环境不可解析）；
// 测试注入 FakeRepository 代替。
vi.mock('@/storage/sqlite-snapshot-repository', () => ({
  SqliteSnapshotRepository: vi.fn(function SqliteSnapshotRepositoryMock() {
    return {};
  }),
}));

type StoredRow = { version: number; payload: unknown };

/** 模拟 SqliteSnapshotRepository 的版本化资源存取（与真实实现同语义）。 */
class FakeRepository {
  rows = new Map<string, StoredRow>();
  cleared: string[] = [];

  async getResource<T>(key: string, schemaVersion: number): Promise<T | null> {
    const row = this.rows.get(key);
    if (!row || row.version !== schemaVersion) return null;
    return row.payload as T;
  }

  async saveResource(key: string, schemaVersion: number, _updatedAt: string, value: unknown): Promise<void> {
    this.rows.set(key, { version: schemaVersion, payload: value });
  }

  async listResourceSizes(): Promise<{ key: string; bytes: number }[]> {
    return [...this.rows.keys()].map((key) => ({ key, bytes: 0 }));
  }

  async clearResources(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      this.rows.delete(key);
      this.cleared.push(key);
    }
  }
}

const user = {
  id: 2,
  username: 'peppy',
  avatar_url: null,
  statistics: { pp: 100, accuracy: 0.9, play_time: 60, play_count: 5, global_rank: null },
};
const snapshot = makeOsuSnapshot(normalizeOsuSnapshot(user, []));
const knownScore = normalizeOsuSnapshot(user, [{
  id: 9,
  accuracy: 0.98,
  total_score: 123456,
  rank: 'S',
  beatmap: {
    id: 22423,
    beatmapset_id: 3720,
    difficulty_rating: 5.5,
    version: 'Hard',
    mode: 'osu',
  },
  beatmapset: {
    id: 3720,
    title: 'Tori no Uta',
    artist: 'Lix',
    creator: 'James',
    covers: {},
  },
}]).bestScores[0];

describe('osu! 分模式快照缓存', () => {
  it('仅将空搜索与默认筛选识别为曲库首页', () => {
    const defaults = {
      general: [], status: 'any' as const, genre: 0, language: 0, nsfw: false, extras: [],
    };
    expect(isOsuCatalogHomeRequest(defaults)).toBe(true);
    expect(isOsuCatalogHomeRequest({ ...defaults, q: 'test' })).toBe(false);
    expect(isOsuCatalogHomeRequest({ ...defaults, status: 'ranked' })).toBe(false);
    expect(isOsuCatalogHomeRequest({ ...defaults, general: ['recommended'] })).toBe(false);
  });

  it('按模式保存默认曲库首页并用版本号隔离失配数据', async () => {
    const repository = new FakeRepository();
    const cache = new OsuCache(repository as never);
    const home = {
      data: { songs: [], total: 10, recommendedDifficulty: null, cursor: 'next' },
      source: {
        kind: 'osu' as const,
        label: 'osu.ppy.sh',
        updatedAt: '2026-08-26T00:00:00.000Z',
        isStale: false,
      },
    };
    await cache.saveCatalogHome('osu-standard', home);
    expect((await cache.loadCatalogHome('osu-standard'))?.data.total).toBe(10);
    expect(await cache.loadCatalogHome('osu-mania')).toBeNull();
    repository.rows.set(osuCatalogHomeCacheKey('osu-mania'), { version: 999, payload: home });
    expect(await cache.loadCatalogHome('osu-mania')).toBeNull();
  });

  it('保存后可加载，缺版本号返回 null', async () => {
    const repository = new FakeRepository();
    const cache = new OsuCache(repository as never);
    await cache.save('osu-standard', 2, snapshot);
    const loaded = await cache.load('osu-standard', 2);
    expect(loaded?.data.player.username).toBe('peppy');
    expect(loaded?.source.label).toBe('osu.ppy.sh');
    expect(await cache.load('osu-standard', 3)).toBeNull();
  });

  it('载荷结构不符合契约时返回 null（防坏缓存）', async () => {
    const repository = new FakeRepository();
    repository.rows.set('osu:osu-mania:2', {
      version: 1,
      payload: { data: { player: { userId: 'bad' }, bestScores: 'bad' }, source: { kind: 'osu' } },
    });
    const cache = new OsuCache(repository as never);
    expect(await cache.load('osu-mania', 2)).toBeNull();
  });

  it('clear 清理对应模式缓存', async () => {
    const repository = new FakeRepository();
    const cache = new OsuCache(repository as never);
    await cache.save('osu-standard', 2, snapshot);
    await cache.save('osu-mania', 2, snapshot);
    await cache.clear('osu-standard', 2);
    expect(await cache.load('osu-standard', 2)).toBeNull();
    expect(await cache.load('osu-mania', 2)).not.toBeNull();
  });

  it('已知成绩按谱面持久化合并，同谱面保留更高总分', async () => {
    const repository = new FakeRepository();
    const cache = new OsuCache(repository as never);
    await cache.mergeKnownScores('osu-standard', 2, [knownScore]);
    await cache.mergeKnownScores('osu-standard', 2, [{ ...knownScore, id: 10, score: 100 }]);

    const loaded = await cache.loadKnownScores('osu-standard', 2);
    expect(Object.keys(loaded?.items ?? {})).toEqual(['22423']);
    expect(loaded?.items['22423'].id).toBe(9);

    await cache.clear('osu-standard', 2);
    expect(await cache.loadKnownScores('osu-standard', 2)).toBeNull();
  });
});
