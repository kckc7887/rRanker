import {
  backupPreview, buildTagHistory, chartLibraryKey, createUserDataBackup, inferGameIdFromKey, mergeLibraryItems,
  normalizeLibraryItem, normalizeTagName, normalizeTags, parseUserDataBackup, songLibraryKey,
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

  it('keeps adofai level ids intact instead of applying maimai id truncation', () => {
    expect(songLibraryKey('adofai', 11372)).toBe('song:adofai:11372');
    expect(songLibraryKey('adofai', '11372')).toBe('song:adofai:11372');
    expect(chartLibraryKey('adofai', 11372, 'SD', 0)).toBe('chart:adofai:11372:SD:0');
    expect(normalizeLibraryItem({ ...song, gameId: 'adofai', songId: '11372' }).key).toBe('song:adofai:11372');
    expect(inferGameIdFromKey('song:adofai:11372')).toBe('adofai');
  });

  it('keeps musedash uid song ids intact instead of applying maimai id truncation', () => {
    expect(songLibraryKey('musedash', '0-47')).toBe('song:musedash:0-47');
    expect(songLibraryKey('musedash', 0)).toBe('song:musedash:0');
    expect(normalizeLibraryItem({ ...song, gameId: 'musedash', songId: '0-47' }).key).toBe('song:musedash:0-47');
    expect(inferGameIdFromKey('song:musedash:0-47')).toBe('musedash');
  });

  it('keeps phira chart ids intact instead of applying maimai id truncation', () => {
    expect(songLibraryKey('phira', 66661)).toBe('song:phira:66661');
    expect(songLibraryKey('phira', '66661')).toBe('song:phira:66661');
    expect(normalizeLibraryItem({ ...song, gameId: 'phira', songId: '66661' }).key).toBe('song:phira:66661');
    expect(normalizeLibraryItem({ ...song, gameId: 'phira', songId: '38294' }).key).toBe('song:phira:38294');
    expect(inferGameIdFromKey('song:phira:66661')).toBe('phira');
  });

  it('round-trips phira song items through backups without truncation', () => {
    const phiraSong: SongLibraryItem = {
      ...song, gameId: 'phira', songId: '66661', key: songLibraryKey('phira', 66661),
    };
    const backup = createUserDataBackup([phiraSong], updatedAt);
    const parsed = parseUserDataBackup(backup);
    expect(parsed.items).toEqual([
      expect.objectContaining({ key: 'song:phira:66661', gameId: 'phira', songId: '66661' }),
    ]);
  });

  it('round-trips adofai song items through backups', () => {
    const adofaiSong: SongLibraryItem = {
      ...song, gameId: 'adofai', songId: '11372', key: songLibraryKey('adofai', 11372),
    };
    const backup = createUserDataBackup([adofaiSong], updatedAt);
    const parsed = parseUserDataBackup(backup);
    expect(parsed.items).toEqual([
      expect.objectContaining({ key: 'song:adofai:11372', gameId: 'adofai', songId: '11372' }),
    ]);
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

  it('preserves U·TA·GE chart items in backup data without changing its version', () => {
    const utageChart: ChartLibraryItem = {
      ...chart,
      songId: '100123',
      type: 'UTAGE',
      levelIndex: 0,
      key: chartLibraryKey('maimai', '100123', 'UTAGE', 0),
    };
    const backup = createUserDataBackup([utageChart], updatedAt);
    const parsed = parseUserDataBackup(backup);

    expect(backup.version).toBe(3);
    expect(parsed.items).toEqual([
      expect.objectContaining({
        key: 'chart:maimai:100123:UTAGE:0',
        type: 'UTAGE',
        levelIndex: 0,
        practice: true,
      }),
    ]);
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
