import { fixtureSongs } from '@/fixtures/sanitized';
import { filterSongs } from '@/utils/search';

describe('filterSongs', () => {
  it('returns all songs when the keyword is empty or whitespace', () => {
    expect(filterSongs(fixtureSongs, '')).toHaveLength(fixtureSongs.length);
    expect(filterSongs(fixtureSongs, '   ')).toHaveLength(fixtureSongs.length);
  });
  it('matches the title case-insensitively', () => {
    // fixture title '正常曲目 A' 应能被小写关键词 '正常曲目 a' 命中
    const matched = filterSongs(fixtureSongs, '正常曲目 a');
    expect(matched).toHaveLength(2);
    expect(matched.every((s) => s.title.toLowerCase().includes('正常曲目 a'))).toBe(true);
  });
  it('matches by song id', () => {
    const matched = filterSongs(fixtureSongs, '10038');
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe('10038');
  });
  it('returns an empty array when nothing matches', () => {
    expect(filterSongs(fixtureSongs, '不存在的关键词XYZ')).toHaveLength(0);
  });
  it('matches a japanese long title with a japanese keyword', () => {
    const matched = filterSongs(fixtureSongs, 'マスカレード');
    expect(matched).toHaveLength(1);
    expect(matched[0].title).toBe('マスカレイド・マスカレード');
  });
  it('matches kana titles by Hepburn romaji with compact punctuation', () => {
    const matched = filterSongs(fixtureSongs, 'masukareidomasukareedo');
    expect(matched).toHaveLength(1);
    expect(matched[0].title).toBe('マスカレイド・マスカレード');
  });
  it('matches partial Hepburn romaji against kana titles', () => {
    const matched = filterSongs(fixtureSongs, 'masukareido');
    expect(matched).toHaveLength(1);
    expect(matched[0].title).toBe('マスカレイド・マスカレード');
  });
  it('matches spaced romaji via compact and hiragana keyword conversion', () => {
    const compact = filterSongs(fixtureSongs, 'masukareido masukareedo');
    expect(compact).toHaveLength(1);
    expect(compact[0].title).toBe('マスカレイド・マスカレード');
  });
  it('matches romaji keywords after converting them to hiragana', () => {
    const matched = filterSongs(fixtureSongs, 'masukareedo');
    expect(matched).toHaveLength(1);
    expect(matched[0].title).toBe('マスカレイド・マスカレード');
  });
});
