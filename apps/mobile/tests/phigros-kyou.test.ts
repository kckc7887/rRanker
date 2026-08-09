import type { CatalogSnapshot, Chart, Song } from '@/domain/models';
import {
  buildPhigrosKyouChartTagIndex,
  buildPhigrosKyouSongMap,
  isPhigrosKyouResourceKey,
  mapPhigrosKyouAliases,
  phigrosKyouChartHasAllTags,
  phigrosKyouTagsForChart,
  presentPhigrosKyouChartTags,
  type PhigrosKyouChart,
  type PhigrosKyouChartTagsSnapshot,
} from '@/domain/phigros-kyou';
import {
  buildSearchDocument,
  buildSongSearchIndex,
  EMPTY_SONG_FILTERS,
  searchDocumentMatches,
  searchSongs,
} from '@/utils/search';

const source = { kind: 'kyou' as const, label: 'Kyou', updatedAt: '2026-08-09T00:00:00.000Z', isStale: false };

function chart(songId: string, levelIndex: number, constant: number): Chart {
  return {
    songId,
    type: 'SD',
    levelIndex,
    level: ['EZ', 'HD', 'IN', 'AT'][levelIndex]!,
    difficulty: ['basic', 'advanced', 'expert', 'master'][levelIndex] as Chart['difficulty'],
    difficultyConstant: constant,
  };
}

function catalog(songs: Song[]): CatalogSnapshot {
  return {
    currentVersion: { id: 0, title: 'current' },
    versions: [{ id: 0, title: 'current' }],
    songs,
    chartVersionIndex: {},
    source,
  };
}

function kyouChart(songId: string, songName: string, levelIndex: number, constant: number): PhigrosKyouChart {
  const difficulty = ['ez', 'hd', 'in', 'at'][levelIndex] as PhigrosKyouChart['difficulty'];
  return {
    chartId: `${songId}_${difficulty}`,
    songId,
    songName,
    difficulty,
    constant,
    mainLabel: '',
    mainLabelQuestion: false,
    mainTopVotes: 0,
    mainSecondVotes: 0,
    tagSource: 'Kyou',
  };
}

describe('Phigros Kyou mapping', () => {
  it('classifies both SQLite snapshots as Kyou-owned Phigros resources', () => {
    expect(isPhigrosKyouResourceKey('phigros-kyou-aliases')).toBe(true);
    expect(isPhigrosKyouResourceKey('phigros-kyou-chart-tags')).toBe(true);
    expect(isPhigrosKyouResourceKey('dxrating-chart-tags')).toBe(false);
  });

  it('normalizes punctuation, resolves duplicate Another Me, applies Mountain override, and skips extras', () => {
    const snapshot = catalog([
      { id: 'punct', title: 'DataError：Test', version: 'Chapter 1', charts: [chart('punct', 2, 13.4)] },
      { id: 'another-a', title: 'Another Me', version: 'Chapter 6', charts: [chart('another-a', 2, 13.1)] },
      { id: 'another-b', title: 'Another Me', version: 'Chapter 8', charts: [chart('another-b', 2, 14.6)] },
      { id: 'mountain', title: 'The Mountain Eater', version: 'Single', charts: [chart('mountain', 2, 14.2)] },
    ]);
    const songs = [
      { songId: 'k-punct', name: 'DataError Test', pack: 'Chapter 1' },
      { songId: 'k-a', name: 'Another Me', pack: 'Chapter 6' },
      { songId: 'k-b', name: 'Another Me', pack: 'unknown' },
      { songId: 'k-mountain', name: 'The Mountain Eater from MUSYNC', pack: 'Single' },
      { songId: 'Special_13', name: 'Oblivion: PHIN', pack: 'April Fool' },
      { songId: 'ambiguous', name: 'Another Me', pack: 'unknown' },
    ];
    const charts = [
      kyouChart('k-punct', 'DataError Test', 2, 13.4),
      kyouChart('k-a', 'Another Me', 2, 13.1),
      kyouChart('k-b', 'Another Me', 2, 14.6),
    ];
    const mapped = buildPhigrosKyouSongMap(snapshot, songs, charts);
    expect(mapped.get('k-punct')?.id).toBe('punct');
    expect(mapped.get('k-a')?.id).toBe('another-a');
    expect(mapped.get('k-b')?.id).toBe('another-b');
    expect(mapped.get('k-mountain')?.id).toBe('mountain');
    expect(mapped.has('Special_13')).toBe(false);
    expect(mapped.has('ambiguous')).toBe(false);
  });

  it('deduplicates aliases per song but preserves aliases shared by multiple songs', () => {
    const snapshot = catalog([
      { id: 'a', title: 'Alpha', version: 'One', charts: [chart('a', 0, 1)] },
      { id: 'b', title: 'Beta', version: 'Two', charts: [chart('b', 0, 2)] },
      { id: 'c', title: 'Gamma', version: 'Three', charts: [chart('c', 0, 3)] },
    ]);
    const aliases = mapPhigrosKyouAliases({
      songs: [
        { songId: 'ka', name: 'Alpha', pack: 'One' },
        { songId: 'kb', name: 'Beta', pack: 'Two' },
        { songId: 'kc', name: 'Gamma', pack: 'Three' },
      ],
      aliases: [
        { songId: 'ka', songName: 'Alpha', alias: 'ＡＢＣ' },
        { songId: 'ka', songName: 'Alpha', alias: 'abc' },
        { songId: 'ka', songName: 'Alpha', alias: '共同别名' },
        { songId: 'kb', songName: 'Beta', alias: '共同别名' },
        { songId: 'kc', songName: 'Gamma', alias: '共同别名' },
      ],
      source,
    }, snapshot);
    expect(aliases.aliases).toEqual([
      { songId: 'a', aliases: ['ABC', '共同别名'] },
      { songId: 'b', aliases: ['共同别名'] },
      { songId: 'c', aliases: ['共同别名'] },
    ]);
    const aliasBySong = new Map(aliases.aliases.map((item) => [item.songId, item.aliases]));
    const songsWithAliases = snapshot.songs.map((song) => ({ ...song, aliases: aliasBySong.get(song.id) ?? [] }));
    expect(searchSongs(buildSongSearchIndex(songsWithAliases), {
      ...EMPTY_SONG_FILTERS,
      keyword: '共同别名',
    }).map((song) => song.id)).toEqual(['a', 'b', 'c']);
    expect(searchDocumentMatches(
      buildSearchDocument(['a', 'Alpha', ...(songsWithAliases[0]?.aliases ?? [])]),
      'ＡＢＣ',
    )).toBe(true);
  });

  it('drops zero votes, sorts by group and votes, and applies AND on one chart', () => {
    const appCatalog = catalog([{
      id: 'song', title: 'Song', version: 'Pack', charts: [chart('song', 2, 14.0), chart('song', 3, 15.0)],
    }]);
    const charts = [kyouChart('ks', 'Song', 2, 14), kyouChart('ks', 'Song', 3, 15)];
    const tagSnapshot: PhigrosKyouChartTagsSnapshot = {
      songs: [{ songId: 'ks', name: 'Song', pack: 'Pack' }],
      charts,
      tags: [
        { id: 152, name: '读谱', type: 'primary', parentIds: [], description: '主标签' },
        { id: 156, name: '差速', type: 'secondary', parentIds: [152], description: '细分标签' },
        { id: 157, name: '脑裂', type: 'secondary', parentIds: [152], description: '零票标签' },
      ],
      votes: [
        { chartId: charts[0]!.chartId, songId: 'ks', songName: 'Song', difficulty: 'in', tagType: 'secondary', tagId: 156, tag: '差速', votes: 8, parentIds: [152], source: 'Kyou' },
        { chartId: charts[0]!.chartId, songId: 'ks', songName: 'Song', difficulty: 'in', tagType: 'primary', tagId: 152, tag: '读谱', votes: 2, parentIds: [], source: 'Kyou' },
        { chartId: charts[0]!.chartId, songId: 'ks', songName: 'Song', difficulty: 'in', tagType: 'secondary', tagId: 157, tag: '脑裂', votes: 0, parentIds: [152], source: 'Kyou' },
      ],
      source,
    };
    const index = buildPhigrosKyouChartTagIndex(tagSnapshot, appCatalog);
    expect(phigrosKyouTagsForChart(index, 'song', 2).map((tag) => [tag.id, tag.votes]))
      .toEqual([[152, 2], [156, 8]]);
    expect(phigrosKyouChartHasAllTags(index, 'song', 2, [152, 156])).toBe(true);
    expect(phigrosKyouChartHasAllTags(index, 'song', 2, [152, 157])).toBe(false);
    expect(phigrosKyouChartHasAllTags(index, 'song', 3, [])).toBe(true);
    expect(phigrosKyouChartHasAllTags(index, 'song', 3, [152])).toBe(false);
  });

  it('derives one primary presentation and keeps only the top five secondary tags above three votes', () => {
    const tag = (
      id: number,
      name: string,
      type: 'primary' | 'secondary',
      votes: number,
    ) => ({ id, name, type, votes, parentIds: [], description: `${name}说明` });

    const composite = presentPhigrosKyouChartTags([
      tag(1, '读谱', 'primary', 30),
      tag(2, '耐力', 'primary', 20),
      tag(3, '协调', 'primary', 20),
      tag(4, '手速', 'primary', 15),
      tag(5, '多指', 'primary', 15),
      tag(11, '细分一', 'secondary', 10),
      tag(12, '细分二', 'secondary', 9),
      tag(13, '细分三', 'secondary', 8),
      tag(14, '细分四', 'secondary', 7),
      tag(15, '细分五', 'secondary', 6),
      tag(16, '细分六', 'secondary', 5),
      tag(17, '恰好三票', 'secondary', 3),
    ]);
    expect(composite.map(({ name, votes }) => [name, votes])).toEqual([
      ['综合', 50],
      ['细分一', 10],
      ['细分二', 9],
      ['细分三', 8],
      ['细分四', 7],
      ['细分五', 6],
    ]);

    expect(presentPhigrosKyouChartTags([
      tag(1, '读谱', 'primary', 19),
      tag(2, '耐力', 'primary', 10),
      tag(3, '协调', 'primary', 5),
      tag(4, '手速', 'primary', 3),
      tag(5, '多指', 'primary', 3),
    ])[0]).toMatchObject({ name: '读谱?', votes: 19 });

    expect(presentPhigrosKyouChartTags([
      tag(1, '读谱', 'primary', 19),
      tag(2, '耐力', 'primary', 17),
      tag(3, '协调', 'primary', 8),
      tag(4, '手速', 'primary', 6),
    ])[0]).toMatchObject({ name: '综合?', votes: 36 });
  });

  it('maps a complete 982-chart catalog while ignoring the chartless April Fool entry', () => {
    const appSongs: Song[] = [];
    const sourceSongs: { songId: string; name: string; pack: string }[] = [];
    const sourceCharts: PhigrosKyouChart[] = [];
    for (let songIndex = 0; songIndex < 312; songIndex += 1) {
      const songId = `song-${songIndex}`;
      const title = `Title ${songIndex}`;
      const count = songIndex < 46 ? 4 : 3;
      const charts = Array.from({ length: count }, (_, levelIndex) => chart(songId, levelIndex, songIndex + levelIndex / 10));
      appSongs.push({ id: songId, title, version: `Pack ${songIndex}`, charts });
      sourceSongs.push({ songId: `k-${songIndex}`, name: title, pack: `Pack ${songIndex}` });
      sourceCharts.push(...charts.map((item) => kyouChart(`k-${songIndex}`, title, item.levelIndex, item.difficultyConstant)));
    }
    sourceSongs.push({ songId: 'Special_13', name: 'Oblivion: PHIN', pack: 'April Fool' });
    expect(sourceCharts).toHaveLength(982);
    const mapped = buildPhigrosKyouSongMap(catalog(appSongs), sourceSongs, sourceCharts);
    expect(mapped.size).toBe(312);
    expect(mapped.has('Special_13')).toBe(false);
  });
});
