import {
  buildDxRatingChartTagIndex,
  dxRatingChartHasAllTags,
  dxRatingTagsForChart,
  type DxRatingChartTagsSnapshot,
} from '@/domain/dxrating-chart-tags';
import type { Chart, Song } from '@/domain/models';
import {
  DxRatingChartTagsProvider,
  mapDxRatingChartTags,
} from '@/providers/dxrating-chart-tags-provider';
import { ProviderError } from '@/providers/errors';

const responsePayload = {
  tagGroups: [
    { id: 1, localized_name: { en: 'Patterns', 'zh-Hans': '配置' }, color: '#7dd3fc' },
    { id: 2, localized_name: { en: 'Difficulty', 'zh-Hans': '难度' }, color: '#a5b4fc' },
    { id: 3, localized_name: { en: 'Evaluation', 'zh-Hans': '评价' }, color: '#f0abfc' },
  ],
  tags: [
    {
      id: 3,
      localized_name: { en: 'Spinning', 'zh-Hans': '转圈' },
      localized_description: { en: 'Spin', 'zh-Hans': '完成转圈\n\n~~注意安全~~' },
      group_id: 1,
    },
    {
      id: 1,
      localized_name: { en: 'Umiyuri' },
      localized_description: { en: '[Offset](https://example.com)' },
      group_id: 1,
    },
    {
      id: 99,
      localized_name: { 'zh-Hans': '高难' },
      localized_description: { 'zh-Hans': '难度标签' },
      group_id: 2,
    },
    {
      id: 100,
      localized_name: { en: 'Easy SSS+', 'zh-Hans': '易鸟加' },
      localized_description: { en: 'Easy to score', 'zh-Hans': '容易取得 SSS+' },
      group_id: 3,
    },
  ],
  tagSongs: [
    { song_id: '测试曲', sheet_type: 'dx', sheet_difficulty: 'master', tag_id: 3 },
    { song_id: '测试曲', sheet_type: 'dx', sheet_difficulty: 'master', tag_id: 1 },
    { song_id: '测试曲', sheet_type: 'dx', sheet_difficulty: 'master', tag_id: 3 },
    { song_id: '测试曲', sheet_type: 'std', sheet_difficulty: 'master', tag_id: 1 },
    { song_id: '测试曲', sheet_type: 'dx', sheet_difficulty: 'expert', tag_id: 1 },
    { song_id: '测试曲', sheet_type: 'dx', sheet_difficulty: 'master', tag_id: 99 },
    { song_id: '测试曲', sheet_type: 'dx', sheet_difficulty: 'master', tag_id: 100 },
  ],
};

function chart(overrides: Partial<Chart> = {}): Chart {
  return {
    songId: '1',
    type: 'DX',
    levelIndex: 3,
    level: '13+',
    difficulty: 'master',
    difficultyConstant: 13.7,
    ...overrides,
  };
}

function song(title = '测试曲', charts = [chart()]): Song {
  return { id: '1', title, version: '测试版本', charts };
}

describe('DXRating chart tags', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps every tag group, applies each group color, and localizes text', () => {
    const snapshot = mapDxRatingChartTags(responsePayload);

    expect(snapshot.tags).toEqual([
      {
        id: 3, name: '转圈', description: '完成转圈\n\n注意安全', color: '#7dd3fc', groupId: 1, groupName: '配置',
        descriptionSegments: [
          { text: '完成转圈\n\n', strikethrough: false },
          { text: '注意安全', strikethrough: true },
        ],
      },
      {
        id: 1, name: 'Umiyuri', description: 'Offset', color: '#7dd3fc', groupId: 1, groupName: '配置',
        descriptionSegments: [{ text: 'Offset', strikethrough: false }],
      },
      {
        id: 99, name: '高难', description: '难度标签', color: '#a5b4fc', groupId: 2, groupName: '难度',
        descriptionSegments: [{ text: '难度标签', strikethrough: false }],
      },
      {
        id: 100, name: '易鸟加', description: '容易取得 SSS+', color: '#f0abfc', groupId: 3, groupName: '评价',
        descriptionSegments: [{ text: '容易取得 SSS+', strikethrough: false }],
      },
    ]);
    expect(snapshot.relations).toHaveLength(7);
    expect(snapshot.source).toMatchObject({ kind: 'dxrating', label: 'DXRating 谱面标签', isStale: false });
  });

  it('matches normal charts by exact title, type and difficulty and deduplicates in relation order', () => {
    const snapshot = mapDxRatingChartTags(responsePayload);

    expect(dxRatingTagsForChart(snapshot, song(), chart()).map((tag) => tag.name))
      .toEqual(['转圈', 'Umiyuri', '高难', '易鸟加']);
    expect(dxRatingTagsForChart(snapshot, song(), chart({ type: 'SD' })).map((tag) => tag.name))
      .toEqual(['Umiyuri']);
    expect(dxRatingTagsForChart(snapshot, song(), chart({ difficulty: 'expert', levelIndex: 2 })).map((tag) => tag.name))
      .toEqual(['Umiyuri']);
    expect(dxRatingTagsForChart(snapshot, song('测试曲 '), chart())).toEqual([]);
  });

  it('builds an exact chart index, normalizes maimai song ids, and requires every selected tag', () => {
    const snapshot = mapDxRatingChartTags(responsePayload);
    const indexedSong = song('测试曲', [
      chart(),
      chart({ type: 'SD' }),
      chart({ difficulty: 'expert', levelIndex: 2 }),
    ]);
    const index = buildDxRatingChartTagIndex(snapshot, [indexedSong]);

    expect(dxRatingChartHasAllTags(index, '10001', 'DX', 3, [3, 1, 99, 100])).toBe(true);
    expect(dxRatingChartHasAllTags(index, '10001', 'DX', 3, [3, 404])).toBe(false);
    expect(dxRatingChartHasAllTags(index, '1', 'SD', 3, [1])).toBe(true);
    expect(dxRatingChartHasAllTags(index, '1', 'SD', 3, [3])).toBe(false);
    expect(dxRatingChartHasAllTags(index, '1', 'DX', 2, [1])).toBe(true);
    expect(dxRatingChartHasAllTags(index, '1', 'DX', 2, [])).toBe(true);
  });

  it('matches U·TA·GE by attribute and type, then uses only an unambiguous stripped-title fallback', () => {
    const snapshot: DxRatingChartTagsSnapshot = {
      tags: [
        {
          id: 1, name: '错位', description: '说明1', descriptionSegments: [{ text: '说明1', strikethrough: false }],
          color: '#7dd3fc', groupId: 1, groupName: '配置',
        },
        {
          id: 2, name: '扫键', description: '说明2', descriptionSegments: [{ text: '说明2', strikethrough: false }],
          color: '#7dd3fc', groupId: 1, groupName: '配置',
        },
      ],
      relations: [
        { songTitle: '[玉]Garakuta Doll Play', sheetType: 'utage', sheetDifficulty: '【玉】', tagId: 1 },
        { songTitle: '[某]Garakuta Doll Play', sheetType: 'utage', sheetDifficulty: '【某】', tagId: 2 },
        { songTitle: '[宴]人マニア', sheetType: 'utage', sheetDifficulty: '【宴】', tagId: 1 },
        { songTitle: '[協]Buddy Song', sheetType: 'utage2p', sheetDifficulty: '【協】', tagId: 2 },
      ],
      source: { kind: 'dxrating', label: 'DXRating', updatedAt: new Date(0).toISOString(), isStale: false },
    };

    const exact = chart({ type: 'UTAGE', difficulty: 'utage', levelIndex: 0, utage: { kanji: '某', isBuddy: false } });
    expect(dxRatingTagsForChart(snapshot, song('Garakuta Doll Play', [exact]), exact).map((tag) => tag.name))
      .toEqual(['扫键']);

    const ambiguous = chart({ type: 'UTAGE', difficulty: 'utage', levelIndex: 0, utage: { isBuddy: false } });
    expect(dxRatingTagsForChart(snapshot, song('Garakuta Doll Play', [ambiguous]), ambiguous)).toEqual([]);

    const fallback = chart({ type: 'UTAGE', difficulty: 'utage', levelIndex: 0, utage: { kanji: 'X', isBuddy: false } });
    expect(dxRatingTagsForChart(snapshot, song('人マニア', [fallback]), fallback).map((tag) => tag.name))
      .toEqual(['错位']);

    const buddy = chart({ type: 'UTAGE', difficulty: 'utage', levelIndex: 0, utage: { kanji: '協', isBuddy: true } });
    expect(dxRatingTagsForChart(snapshot, song('Buddy Song', [buddy]), buddy).map((tag) => tag.name))
      .toEqual(['扫键']);

    const exactSong = { ...song('Garakuta Doll Play', [exact]), id: '100001' };
    const ambiguousSong = { ...song('Garakuta Doll Play', [ambiguous]), id: '100002' };
    const fallbackSong = { ...song('人マニア', [fallback]), id: '100003' };
    const buddySong = { ...song('Buddy Song', [buddy]), id: '100004' };
    const index = buildDxRatingChartTagIndex(snapshot, [exactSong, ambiguousSong, fallbackSong, buddySong]);
    expect(dxRatingChartHasAllTags(index, exactSong.id, 'UTAGE', 0, [2])).toBe(true);
    expect(dxRatingChartHasAllTags(index, ambiguousSong.id, 'UTAGE', 0, [1])).toBe(false);
    expect(dxRatingChartHasAllTags(index, fallbackSong.id, 'UTAGE', 0, [1])).toBe(true);
    expect(dxRatingChartHasAllTags(index, buddySong.id, 'UTAGE', 0, [2])).toBe(true);
  });

  it('rejects malformed responses and missing tag groups', () => {
    expect(() => mapDxRatingChartTags({ tags: [] })).toThrow(ProviderError);
    expect(() => mapDxRatingChartTags({ ...responsePayload, tagGroups: [] }))
      .toThrow('DXRating 标签响应缺少标签分组');
  });

  it('maps upstream HTTP and invalid JSON failures without returning partial data', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('{', { status: 200 })));
    const provider = new DxRatingChartTagsProvider();

    await expect(provider.getChartTags()).rejects.toMatchObject({ code: 'network' });
    await expect(provider.getChartTags()).rejects.toMatchObject({ code: 'upstream_schema' });
  });
});
