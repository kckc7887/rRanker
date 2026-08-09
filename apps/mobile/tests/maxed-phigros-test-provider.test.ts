import type { CatalogSnapshot, Song } from '@/domain/models';
import {
  buildMaxedPhigrosRecords,
  buildMaxedPhigrosSnapshot,
} from '@/providers/maxed-phigros-test-provider';

const source = {
  kind: 'generated' as const,
  label: 'Phigros 测试曲库',
  updatedAt: '2026-08-09T00:00:00.000Z',
  isStale: false,
};

function song(id: number, base: number, disabled = false): Song {
  return {
    id: `song-${id}`,
    title: `歌曲 ${id}`,
    version: '测试章节',
    disabled,
    charts: [0, 1, 2, 3].map((levelIndex) => ({
      songId: `song-${id}`,
      type: 'SD' as const,
      levelIndex,
      level: ['EZ', 'HD', 'IN', 'AT'][levelIndex]!,
      difficulty: ['basic', 'advanced', 'expert', 'master'][levelIndex]! as 'basic' | 'advanced' | 'expert' | 'master',
      difficultyConstant: base + levelIndex,
      notes: { tap: 10, hold: 20, drag: 30, flick: 40, total: 100 },
    })),
  };
}

const catalog: CatalogSnapshot = {
  currentVersion: { id: 0, title: '测试章节' },
  versions: [{ id: 0, title: '测试章节' }],
  songs: [
    ...Array.from({ length: 8 }, (_, index) => song(index + 1, 8 + index)),
    song(999, 20, true),
  ],
  chartVersionIndex: {},
  source,
};

describe('Phigros 全满示例账号', () => {
  it('为所有未禁用谱面生成满分 Phi 成绩并保留谱面信息', () => {
    const records = buildMaxedPhigrosRecords(catalog);
    expect(records).toHaveLength(32);
    expect(records.some((record) => record.songId === 'song-999')).toBe(false);
    expect(records.every((record) => record.dxScore === 1_000_000)).toBe(true);
    expect(records.every((record) => record.achievements === 100)).toBe(true);
    expect(records.every((record) => record.fc === 'ap' && record.rate === 'phi')).toBe(true);
    expect(records.every((record) => record.notes?.total === 100)).toBe(true);
  });

  it('按 Phi3 与 Best27 公式计算玩家 RKS，并将四档进度全部置满', () => {
    const snapshot = buildMaxedPhigrosSnapshot(catalog);
    expect(snapshot.bestSections[0]).toMatchObject({ id: 'phi3', title: 'Phi3' });
    expect(snapshot.bestSections[0]?.records).toHaveLength(3);
    expect(snapshot.bestSections[1]).toMatchObject({ id: 'b27', title: 'Best27' });
    expect(snapshot.bestSections[1]?.records).toHaveLength(27);
    const best27 = snapshot.bestSections[1]!.records;
    const phi3 = snapshot.bestSections[0]!.records;
    const expectedRks = Math.round((
      best27.reduce((sum, record) => sum + record.rating, 0)
      + phi3.reduce((sum, record) => sum + record.difficultyConstant, 0)
    ) / 30 * 10_000) / 10_000;
    expect(snapshot.player).toMatchObject({
      id: 'phigros:test',
      displayName: '示例账号',
      rating: expectedRks,
    });
    expect(snapshot.challengeModeRank).toBe(599);
    expect(snapshot.progress).toEqual({
      cleared: [8, 8, 8, 8],
      fullCombo: [8, 8, 8, 8],
      phi: [8, 8, 8, 8],
    });
  });
});
