import { describe, expect, it, vi } from 'vitest';
import { OsuCache, makeOsuSnapshot } from '@/services/osu-cache';
import { normalizeOsuSnapshot } from '@/domain/osu';

vi.mock('@/storage/sqlite-snapshot-repository', () => ({
  SqliteSnapshotRepository: vi.fn(function SqliteSnapshotRepositoryMock() {
    return {};
  }),
}));

type ResourceUpdate<T> = { value: T; updatedAt: string; write?: true } | { value: T; write: false };

type StoredRow = { version: number; payload: unknown };

class FakeRepository {
  rows = new Map<string, StoredRow>();
  cleared: string[] = [];
  writeCount = 0;

  async getResource<T>(key: string, schemaVersion: number): Promise<T | null> {
    const row = this.rows.get(key);
    if (!row || row.version !== schemaVersion) return null;
    return row.payload as T;
  }

  async saveResource(key: string, schemaVersion: number, _updatedAt: string, value: unknown): Promise<void> {
    this.writeCount++;
    this.rows.set(key, { version: schemaVersion, payload: value });
  }

  private pending = Promise.resolve();
  updateResource<T>(key: string, schemaVersion: number, update: (value: T | null) => ResourceUpdate<T>): Promise<T> {
    const task = this.pending.then(async () => {
      const previous = await this.getResource<T>(key, schemaVersion);
      const next = update(previous);
      if (next.write !== false) await this.saveResource(key, schemaVersion, next.updatedAt, next.value);
      return next.value;
    });
    this.pending = task.then(() => undefined, () => undefined);
    return task;
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


it('并发更新不同谱面的已知成绩不会相互覆盖', async () => {
  const repository = new FakeRepository();
  const cache = new OsuCache(repository as never);
  const other = { ...knownScore, id: 11, beatmap: { ...knownScore.beatmap, id: 22424 } };
  await Promise.all([cache.mergeKnownScores('osu-standard', 2, [knownScore]), cache.mergeKnownScores('osu-standard', 2, [other])]);
  const saved = await cache.loadKnownScores('osu-standard', 2);
  expect(Object.keys(saved!.items).sort()).toEqual(['22423', '22424']);
});


it('重复、低分和空播种保持已有时间且不写入，等分元数据变化仍提交', async () => {
  const repository = new FakeRepository();
  const cache = new OsuCache(repository as never);
  const first = await cache.mergeKnownScores('osu-standard', 2, [knownScore]);
  await cache.mergeKnownScores('osu-standard', 2, [{ ...knownScore }]);
  await cache.mergeKnownScores('osu-standard', 2, [{ ...knownScore, score: knownScore.score - 1 }]);
  const empty = await cache.mergeKnownScores('osu-standard', 2, []);
  expect(repository.writeCount).toBe(1);
  expect(empty.source.updatedAt).toBe(first.source.updatedAt);
  await cache.mergeKnownScores('osu-standard', 2, [{ ...knownScore, rank: 'SS' }]);
  expect(repository.writeCount).toBe(2);
  expect((await cache.loadKnownScores('osu-standard', 2))?.items['22423'].rank).toBe('SS');
});

it('对象字段顺序不使相同成绩重复提交', async () => {
  const repository = new FakeRepository();
  const cache = new OsuCache(repository as never);
  await cache.mergeKnownScores('osu-standard', 2, [knownScore]);
  const reordered = Object.fromEntries(Object.entries(knownScore).reverse()) as typeof knownScore;
  await cache.mergeKnownScores('osu-standard', 2, [reordered]);
  expect(repository.writeCount).toBe(1);
});
