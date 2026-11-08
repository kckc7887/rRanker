import {
  buildTagHistory, createUserDataBackup, libraryDetailTarget, libraryTargetKey, mergeLibraryItems,
  normalizeLibraryItem, normalizeTagName, normalizeTags, parseUserDataBackup,
} from '@rranker/sdk/domain/user-library';
import type { ChartLibraryItem, SongLibraryItem } from '@rranker/sdk/domain/user-library';

const createdAt = '2026-07-13T00:00:00.000Z';
const updatedAt = '2026-07-13T01:00:00.000Z';
const song: SongLibraryItem = {
  key: 'ignored', gameId: 'custom-game', kind: 'song', id: '0001', target: { songId: '0001' },
  favorite: true, tags: ['  上 分  ', 'ＡＢＣ'], createdAt, updatedAt,
};
const chart: ChartLibraryItem = {
  key: 'ignored', gameId: 'custom-game', kind: 'chart', id: 'custom-chart',
  target: { songId: '0001', difficulty: 'special', variant: '004' },
  practice: true, tags: ['abc'], createdAt, updatedAt,
};

describe('user library domain', () => {
  it('round-trips third-party identifiers and opaque route parameters without interpreting them', () => {
    const backup = createUserDataBackup('custom-game', [song, chart], updatedAt, ['自定义']);
    const restored = parseUserDataBackup(JSON.parse(JSON.stringify(backup)), 'custom-game');
    expect(restored.items).toEqual(expect.arrayContaining([normalizeLibraryItem(song), normalizeLibraryItem(chart)]));
    expect(restored.tagPresets).toEqual(['自定义']);
    expect(libraryDetailTarget(chart)).toEqual({ gameId: 'custom-game', params: chart.target });
    expect(restored.items.find(item => item.kind === 'song')?.target.songId).toBe('0001');
  });

  it('rejects old, mixed-game and wrong-game backups before restoration', () => {
    const backup = createUserDataBackup('custom-game', [song], updatedAt);
    for (const version of [1, 2, 4]) expect(() => parseUserDataBackup({ ...backup, version })).toThrow();
    const { gameId: _gameId, ...withoutGameId } = backup;
    expect(() => parseUserDataBackup(withoutGameId)).toThrow();
    expect(() => parseUserDataBackup(backup, 'other-game')).toThrow();
    expect(() => parseUserDataBackup({ ...backup, items: [{ ...song, gameId: 'other-game' }] })).toThrow();
    expect(() => createUserDataBackup('custom-game', [{ ...song, gameId: 'other-game' }])).toThrow();
    expect(() => parseUserDataBackup({ ...backup, items: [{ ...song, target: { songId: 1 } }] })).toThrow();
    expect(() => parseUserDataBackup({ ...backup, token: 'secret' })).toThrow();
  });

  it('isolates keys by game, kind and complete adapter identity', () => {
    const targets = [song, chart, { ...song, gameId: 'other-game' }, { ...song, id: '1' },
      { ...song, gameId: 'a:b', id: 'c' }, { ...song, gameId: 'a', id: 'b:c' }];
    expect(new Set(targets.map(libraryTargetKey)).size).toBe(targets.length);
    const changedRoute = { ...song, target: { songId: 'different' } };
    expect(libraryTargetKey(changedRoute)).toBe(libraryTargetKey(song));
  });

  it('normalizes tags with NFKC, whitespace and case-insensitive deduplication', () => {
    expect(normalizeTagName('  ＡＢＣ  ')).toEqual({ displayName: 'ABC', key: 'abc' });
    expect(normalizeTags(['ＡＢＣ', 'abc', '上   分'])).toEqual(['ABC', '上 分']);
    expect(() => normalizeTagName('')).toThrow('标签不能为空');
    expect(() => normalizeTagName('a'.repeat(25))).toThrow('24');
  });

  it('builds recent history excluding the current item and presets', () => {
    expect(buildTagHistory([
      { ...song, key: 'current', tags: ['爆发', '耐力'], updatedAt: createdAt },
      { ...chart, key: 'other', tags: ['耐力', '交互', '星星谱'], updatedAt },
    ], 'current', ['爆发', '交互'])).toEqual(['耐力', '星星谱']);
  });

  it('merges flags and tags while keeping local spelling and earliest creation', () => {
    const local = normalizeLibraryItem({ ...song, favorite: false, tags: ['ABC'], updatedAt: createdAt });
    const imported = { ...local, favorite: true, tags: ['abc', '耐力'], createdAt: updatedAt, updatedAt };
    expect(mergeLibraryItems([local], [imported])).toEqual([{ ...local, favorite: true, tags: ['ABC', '耐力'], updatedAt }]);
    expect(mergeLibraryItems([song], [{ ...song, gameId: 'other-game' }])).toHaveLength(2);
  });
});
