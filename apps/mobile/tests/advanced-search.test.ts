import type { Song } from '@/domain/models';
import { buildSongSearchIndex, EMPTY_SONG_FILTERS, normalizeSearchText, searchSongs } from '@/utils/search';

const songs: Song[] = [{
  id: '1806', title: 'Ｆｒａｑ', artist: 'Team Grimoire', version: '2026', versionId: 25500,
  aliases: ['测试别名'], charts: [{ songId: '1806', type: 'DX', levelIndex: 3, difficulty: 'master', level: '13+', difficultyConstant: 13.7, charter: 'あま猫', versionId: 25500 }],
}];
describe('advanced song search', () => {
  it('normalizes NFKC and searches aliases and charter', () => {
    expect(normalizeSearchText(' ＦＲＡＱ ')).toBe('fraq');
    const index = buildSongSearchIndex(songs);
    expect(searchSongs(index, { ...EMPTY_SONG_FILTERS, keyword: '测试别名' })).toHaveLength(1);
    expect(searchSongs(index, { ...EMPTY_SONG_FILTERS, keyword: 'あま猫' })).toHaveLength(1);
  });
  it('combines type, difficulty, constant and both version filters', () => {
    const result = searchSongs(buildSongSearchIndex(songs), { ...EMPTY_SONG_FILTERS, keyword: 'fraq', types: ['DX'], difficulties: ['master'], constantMin: 13.7, constantMax: 13.7, songVersionIds: [25500], chartVersionIds: [25500] });
    expect(result.map((song) => song.id)).toEqual(['1806']);
    expect(searchSongs(buildSongSearchIndex(songs), { ...EMPTY_SONG_FILTERS, types: ['SD'] })).toHaveLength(0);
  });

  it('requires type, difficulty, constant and chart version to match the same chart', () => {
    const splitMatch: Song = {
      ...songs[0],
      charts: [
        { ...songs[0].charts[0], type: 'SD', difficultyConstant: 12.6, versionId: 25000 },
        { ...songs[0].charts[0], type: 'DX', difficulty: 'expert', difficultyConstant: 14.3, versionId: 25500 },
      ],
    };
    const result = searchSongs(buildSongSearchIndex([splitMatch]), {
      ...EMPTY_SONG_FILTERS,
      types: ['SD'],
      difficulties: ['expert'],
      constantMin: 14,
      chartVersionIds: [25500],
    });
    expect(result).toHaveLength(0);
  });
});
