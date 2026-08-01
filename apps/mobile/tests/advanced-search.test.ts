import type { Song } from '@/domain/models';
import { buildSongSearchIndex, EMPTY_SONG_FILTERS, normalizeSearchText, searchSongs } from '@/utils/search';

const songs: Song[] = [{
  id: '1806', title: 'Ｆｒａｑ', artist: 'Team Grimoire', version: '2026', versionId: 25500,
  aliases: ['测试别名'], charts: [{ songId: '1806', type: 'DX', levelIndex: 3, difficulty: 'master', level: '13+', difficultyConstant: 13.7, charter: 'あま猫', versionId: 25500 }],
}, {
  id: '100123', title: '協 U·TA·GE', artist: '测试曲师', version: '2026', versionId: 25500,
  charts: [{
    songId: '100123', type: 'UTAGE', levelIndex: 0, difficulty: 'utage', level: '宴',
    difficultyConstant: 0, versionId: 25500,
  }],
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

  it('evaluates an optional chart predicate on the same chart as every built-in chart filter', () => {
    const splitMatch: Song = {
      ...songs[0],
      charts: [
        { ...songs[0].charts[0], type: 'SD', difficulty: 'master', difficultyConstant: 13.7, versionId: 25000 },
        { ...songs[0].charts[0], type: 'DX', difficulty: 'expert', difficultyConstant: 14.3, versionId: 25500 },
      ],
    };
    const predicate = (_song: Song, chart: Song['charts'][number]) => chart.type === 'DX';

    expect(searchSongs(buildSongSearchIndex([splitMatch]), {
      ...EMPTY_SONG_FILTERS,
      types: ['SD'],
      difficulties: ['master'],
      constantMin: 13.7,
      chartVersionIds: [25000],
    }, predicate)).toHaveLength(0);
    expect(searchSongs(buildSongSearchIndex([splitMatch]), {
      ...EMPTY_SONG_FILTERS,
      types: ['DX'],
      difficulties: ['expert'],
      constantMin: 14,
      chartVersionIds: [25500],
    }, predicate).map((song) => song.id)).toEqual(['1806']);
  });

  it('includes U·TA·GE by default and keeps it independent from DX and constant filters', () => {
    const index = buildSongSearchIndex(songs);
    expect(searchSongs(index, { ...EMPTY_SONG_FILTERS, difficulties: ['utage'] })
      .map((song) => song.id)).toEqual(['100123']);
    expect(searchSongs(index, { ...EMPTY_SONG_FILTERS, types: ['DX'] })
      .map((song) => song.id)).toEqual(['1806']);
    expect(searchSongs(index, { ...EMPTY_SONG_FILTERS, constantMax: 1 })
      .some((song) => song.id === '100123')).toBe(false);
  });
});
