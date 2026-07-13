import {
  backupPreview, chartLibraryKey, createUserDataBackup, mergeLibraryItems, normalizeTagName,
  normalizeTags, parseUserDataBackup, songLibraryKey,
} from '@/domain/user-library';
import type { ChartLibraryItem, SongLibraryItem } from '@/domain/user-library';

const createdAt = '2026-07-13T00:00:00.000Z';
const updatedAt = '2026-07-13T01:00:00.000Z';
const song: SongLibraryItem = { key: 'ignored', kind: 'song', songId: '10001', favorite: true, tags: ['  上 分  ', 'ＡＢＣ'], createdAt, updatedAt };
const chart: ChartLibraryItem = { key: 'ignored', kind: 'chart', songId: '10001', type: 'DX', levelIndex: 3, practice: true, tags: ['abc'], createdAt, updatedAt };

describe('user library domain', () => {
  it('builds stable normalized song and chart keys', () => {
    expect(songLibraryKey('10001')).toBe('song:1');
    expect(chartLibraryKey('10001', 'DX', 3)).toBe('chart:1:DX:3');
  });

  it('normalizes tags with NFKC, whitespace and case-insensitive deduplication', () => {
    expect(normalizeTagName('  ＡＢＣ  ')).toEqual({ displayName: 'ABC', key: 'abc' });
    expect(normalizeTags(['ＡＢＣ', 'abc', '上   分'])).toEqual(['ABC', '上 分']);
    expect(() => normalizeTagName('')).toThrow('标签不能为空');
    expect(() => normalizeTagName('a'.repeat(25))).toThrow('24');
  });

  it('creates a deterministic strict privacy backup', () => {
    const backup = createUserDataBackup([chart, song], updatedAt);
    expect(backup.items.map((item) => item.key)).toEqual(['chart:1:DX:3', 'song:1']);
    expect(backupPreview(backup)).toEqual({ songs: 1, charts: 1, tags: 2 });
    expect(JSON.stringify(backup)).not.toMatch(/token|cookie|player|records/i);
    expect(() => parseUserDataBackup({ ...backup, token: 'secret' })).toThrow();
    expect(() => parseUserDataBackup({ ...backup, version: 2 })).toThrow();
  });

  it('merges flags and tags while keeping the local display spelling', () => {
    const local: SongLibraryItem = { ...song, key: songLibraryKey('1'), songId: '1', favorite: false, tags: ['ABC'], updatedAt: createdAt };
    const imported: SongLibraryItem = { ...local, favorite: true, tags: ['abc', '耐力'], updatedAt };
    const merged = mergeLibraryItems([local], [imported]);
    expect(merged).toEqual([{ ...local, favorite: true, tags: ['ABC', '耐力'], updatedAt }]);
  });
});
