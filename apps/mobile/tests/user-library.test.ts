import {
  backupPreview, buildTagHistory, chartLibraryKey, createUserDataBackup, mergeLibraryItems, normalizeTagName,
  normalizeTags, parseUserDataBackup, songLibraryKey,
} from '@/domain/user-library';
import type { ChartLibraryItem, SongLibraryItem } from '@/domain/user-library';

const createdAt = '2026-07-13T00:00:00.000Z';
const updatedAt = '2026-07-13T01:00:00.000Z';
const song: SongLibraryItem = {
  key: 'ignored', gameId: 'maimai', kind: 'song', songId: '10001', favorite: true, tags: ['  上 分  ', 'ＡＢＣ'], createdAt, updatedAt,
};
const chart: ChartLibraryItem = {
  key: 'ignored', gameId: 'maimai', kind: 'chart', songId: '10001', type: 'DX', levelIndex: 3, practice: true, tags: ['abc'], createdAt, updatedAt,
};

describe('user library domain', () => {
  it('builds stable normalized song and chart keys per game', () => {
    expect(songLibraryKey('maimai', '10001')).toBe('song:maimai:1');
    expect(chartLibraryKey('maimai', '10001', 'DX', 3)).toBe('chart:maimai:1:DX:3');
    expect(songLibraryKey('phigros', 'Song.A')).toBe('song:phigros:Song.A');
    expect(chartLibraryKey('phigros', 'Song.A', 'SD', 2)).toBe('chart:phigros:Song.A:SD:2');
  });

  it('normalizes tags with NFKC, whitespace and case-insensitive deduplication', () => {
    expect(normalizeTagName('  ＡＢＣ  ')).toEqual({ displayName: 'ABC', key: 'abc' });
    expect(normalizeTags(['ＡＢＣ', 'abc', '上   分'])).toEqual(['ABC', '上 分']);
    expect(() => normalizeTagName('')).toThrow('标签不能为空');
    expect(() => normalizeTagName('a'.repeat(25))).toThrow('24');
  });

  it('creates a deterministic strict privacy backup', () => {
    const backup = createUserDataBackup([chart, song], updatedAt);
    expect(backup.items.map((item) => item.key)).toEqual(['chart:maimai:1:DX:3', 'song:maimai:1']);
    expect(backup.version).toBe(3);
    expect(backup.tagPresets).toEqual(['爆发', '交互', '星星', '鬼歌', '大歌']);
    expect(backupPreview(backup)).toEqual({ songs: 1, charts: 1, tags: 2 });
    expect(JSON.stringify(backup)).not.toMatch(/token|cookie|player|records/i);
    expect(() => parseUserDataBackup({ ...backup, token: 'secret' })).toThrow();
    expect(() => parseUserDataBackup({ ...backup, version: 4 })).toThrow();
  });

  it('imports legacy v2 backups as maimai library items', () => {
    const legacy = {
      format: 'rranker-user-data' as const,
      version: 2 as const,
      exportedAt: updatedAt,
      tagPresets: ['爆发'],
      items: [{
        key: 'song:1',
        kind: 'song' as const,
        songId: '1',
        favorite: true,
        tags: [],
        createdAt,
        updatedAt,
      }],
    };
    const parsed = parseUserDataBackup(legacy);
    expect(parsed.items[0]?.key).toBe('song:maimai:1');
    expect(parsed.items[0]?.gameId).toBe('maimai');
  });

  it('builds recent history excluding the current item and presets', () => {
    expect(buildTagHistory([
      { ...song, key: 'song:maimai:1', tags: ['爆发', '耐力'], updatedAt: createdAt },
      { ...chart, key: 'chart:maimai:2:DX:3', tags: ['耐力', '交互', '星星谱'], updatedAt },
    ], 'song:maimai:1', ['爆发', '交互'])).toEqual(['耐力', '星星谱']);
  });

  it('merges flags and tags while keeping the local display spelling', () => {
    const local: SongLibraryItem = { ...song, key: songLibraryKey('maimai', '1'), songId: '1', favorite: false, tags: ['ABC'], updatedAt: createdAt };
    const imported: SongLibraryItem = { ...local, favorite: true, tags: ['abc', '耐力'], updatedAt };
    const merged = mergeLibraryItems([local], [imported]);
    expect(merged).toEqual([{ ...local, favorite: true, tags: ['ABC', '耐力'], updatedAt }]);
  });

  it('keeps library items isolated by game id', () => {
    const maimaiSong: SongLibraryItem = { ...song, key: songLibraryKey('maimai', 'Song.A'), songId: 'Song.A', favorite: true };
    const phigrosSong: SongLibraryItem = { ...song, gameId: 'phigros', key: songLibraryKey('phigros', 'Song.A'), songId: 'Song.A', favorite: true };
    const merged = mergeLibraryItems([maimaiSong], [phigrosSong]);
    expect(merged.map((item) => item.key).sort()).toEqual(['song:maimai:Song.A', 'song:phigros:Song.A']);
  });
});
