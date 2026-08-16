import type { ChunithmCatalogSnapshot, ChunithmSong } from '@/domain/chunithm';
import { isCatalogDrivenScoreProvider } from '@/providers/contracts';
import {
  buildMaxedChunithmSnapshot,
  MaxedChunithmTestProvider,
  maxChunithmChartOverPower,
  maxChunithmChartRating,
} from '@/providers/maxed-chunithm-test-provider';

const source = {
  kind: 'lxns' as const,
  label: '测试曲库',
  updatedAt: '2026-07-28T00:00:00.000Z',
  isStale: false,
};

function song(id: number, versionId: number, levelValue: number): ChunithmSong {
  return {
    id,
    title: `歌曲 ${id}`,
    genre: 'POPS',
    bpm: 180,
    versionId,
    versionTitle: versionId === 2 ? '当前版本' : '旧版本',
    locked: id === 1,
    disabled: false,
    difficulties: [{
      difficulty: 3,
      level: '14',
      levelValue,
      versionId,
      versionTitle: versionId === 2 ? '当前版本' : '旧版本',
    }],
  };
}

const catalog: ChunithmCatalogSnapshot = {
  currentVersion: { id: 2, title: '当前版本' },
  versions: [{ id: 1, title: '旧版本' }, { id: 2, title: '当前版本' }],
  genres: [],
  songs: [
    ...Array.from({ length: 40 }, (_, index) => song(index + 1, 1, 10 + index / 10)),
    ...Array.from({ length: 25 }, (_, index) => song(index + 101, 2, 12 + index / 10)),
    {
      ...song(500, 2, 0),
      title: 'WORLD’S END',
      difficulties: [{
        difficulty: 5,
        level: '狂★4',
        levelValue: 0,
        versionId: 2,
        versionTitle: '当前版本',
        originId: 1,
        kanji: '狂',
        star: 4,
      }],
    },
    { ...song(999, 2, 20), disabled: true },
  ],
  source,
};

describe('中二节奏全满示例账号', () => {
  it('单谱面满 Rating 为定数加 2.15', () => {
    expect(maxChunithmChartRating(14.8)).toBe(16.95);
  });

  it('单谱面满 OVER POWER 为定数加 3 后乘 5', () => {
    expect(maxChunithmChartOverPower(14.8)).toBe(89);
  });

  it('生成所有未禁用谱面满成绩，并保留 WORLD’S END', () => {
    const snapshot = buildMaxedChunithmSnapshot(catalog);
    expect(snapshot.scores).toHaveLength(66);
    expect(snapshot.scores.some((score) => score.id === 999)).toBe(false);
    expect(snapshot.scores.every((score) => score.score === 1_010_000)).toBe(true);
    expect(snapshot.scores.every((score) => score.rank === 'sssp')).toBe(true);
    expect(snapshot.scores.every((score) => score.full_combo === 'alljusticecritical')).toBe(true);
    expect(snapshot.scores.every((score) => score.full_chain === 'fullchain2')).toBe(true);
    expect(snapshot.scores.every((score) => score.clear === 'catastrophy')).toBe(true);
    expect(snapshot.scores
      .filter((score) => score.level_index !== 5)
      .every((score) => score.over_power !== undefined && score.over_power > 0)).toBe(true);
    const worldsEnd = snapshot.scores.find((score) => score.id === 500);
    expect(worldsEnd).toMatchObject({ level_index: 5 });
    expect(worldsEnd?.rating).toBeUndefined();
    expect(worldsEnd?.over_power).toBeUndefined();
  });

  it('构造唯一的 New20 与 Best30，并按 50 张计算玩家 Rating', () => {
    const snapshot = buildMaxedChunithmSnapshot(catalog);
    expect(snapshot.bests.new_bests).toHaveLength(20);
    expect(snapshot.bests.bests).toHaveLength(30);
    expect(snapshot.bests.selections).toHaveLength(10);
    const b50 = [...snapshot.bests.new_bests, ...snapshot.bests.bests];
    expect(new Set(b50.map((score) => `${score.id}-${score.level_index}`)).size).toBe(50);
    expect(snapshot.bests.new_bests.every((score) => Number(score.id) >= 101)).toBe(true);
    const expected = Math.floor((
      b50.reduce((sum, score) => sum + (score.rating ?? 0), 0) / 50
    ) * 100) / 100;
    expect(snapshot.player).toMatchObject({
      name: '示例账号',
      level: 99,
      rating: expected,
      rating_possession: 'rainbow',
      over_power_progress: 100,
    });
    const expectedOverPower = catalog.songs
      .filter((entry) => !entry.disabled)
      .map((entry) => Math.max(
        0,
        ...entry.difficulties
          .filter((difficulty) => difficulty.difficulty !== 5)
          .map((difficulty) => maxChunithmChartOverPower(difficulty.levelValue)),
      ))
      .reduce((sum, value) => sum + value, 0);
    expect(snapshot.player.over_power).toBe(expectedOverPower);
    expect(snapshot.source).toMatchObject({ kind: 'generated', isStale: false });
  });

  it('实现 CatalogDrivenScoreProvider，统一成绩覆盖全部启用谱面', async () => {
    const provider = new MaxedChunithmTestProvider();
    expect(isCatalogDrivenScoreProvider(provider)).toBe(true);
    const records = await provider.getRecordsFromCatalog(catalog);
    const enabledKeys = catalog.songs
      .filter((song) => !song.disabled)
      .flatMap((song) => song.difficulties.map((difficulty) => `${song.id}:${difficulty.difficulty}`));
    expect(records.map((record) => `${Number(record.songId)}:${record.levelIndex}`)).toEqual(enabledKeys);
  });
});
