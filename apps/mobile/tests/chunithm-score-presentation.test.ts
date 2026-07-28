import {
  averageChunithmRating,
  buildChunithmScoreCards,
  chunithmAchievementBadges,
  chunithmRankFromScore,
  chunithmRankUsesGradient,
  compareChunithmScores,
  formatChunithmRating,
  formatChunithmScore,
  formatChunithmWorldsEndLabel,
} from '@/domain/chunithm-score-presentation';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import type { ChunithmScore } from '@/domain/chunithm-personal';

const scoreBase: ChunithmScore = {
  id: 42,
  song_name: '接口曲名',
  level: '14+',
  level_index: 3,
  score: 1_000_000,
  rating: 15.25,
  clear: 'clear',
  full_combo: null,
  full_chain: null,
};

const catalog: ChunithmCatalogSnapshot = {
  currentVersion: { id: 23000, title: 'CHUNITHM VERSE' },
  versions: [{ id: 23000, title: 'CHUNITHM VERSE' }],
  genres: [{ id: 1, title: 'POPS & ANIME' }],
  songs: [
    {
      id: 42,
      title: '曲库曲名',
      artist: '艺术家',
      genre: 'POPS & ANIME',
      bpm: 180,
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      locked: false,
      disabled: false,
      difficulties: [{
        difficulty: 3,
        level: '14+',
        levelValue: 14.8,
        noteDesigner: '谱师',
        versionId: 23000,
        versionTitle: 'CHUNITHM VERSE',
      }],
    },
    {
      id: 44,
      title: 'WORLD END 曲名',
      artist: 'WE 艺术家',
      genre: 'WORLD END',
      bpm: 200,
      versionId: 23000,
      versionTitle: 'CHUNITHM VERSE',
      locked: false,
      disabled: false,
      difficulties: [{
        difficulty: 5,
        level: '14',
        levelValue: 14,
        noteDesigner: 'WE 谱师',
        versionId: 23000,
        versionTitle: 'CHUNITHM VERSE',
        originId: 42,
        kanji: '狂',
        star: 4,
      }],
    },
  ],
  source: {
    kind: 'lxns',
    label: '落雪咖啡屋',
    updatedAt: '2026-07-28T00:00:00.000Z',
    isStale: false,
  },
};

describe('chunithm score presentation', () => {
  it.each([
    [1_010_000, 'SSS+'], [1_009_000, 'SSS+'], [1_008_999, 'SSS'],
    [1_007_500, 'SSS'], [1_007_499, 'SS+'], [1_005_000, 'SS+'],
    [1_004_999, 'SS'], [1_000_000, 'SS'], [999_999, 'S+'],
    [990_000, 'S+'], [989_999, 'S'], [975_000, 'S'],
    [974_999, 'AAA'], [950_000, 'AAA'], [949_999, 'AA'],
    [925_000, 'AA'], [924_999, 'A'], [900_000, 'A'],
    [899_999, 'BBB'], [800_000, 'BBB'], [799_999, 'BB'],
    [700_000, 'BB'], [699_999, 'B'], [600_000, 'B'],
    [599_999, 'C'], [500_000, 'C'], [499_999, 'D'], [0, 'D'],
  ])('maps score %i to %s', (score, expected) => {
    expect(chunithmRankFromScore(score)).toBe(expected);
  });

  it('formats score/rating and limits the special gradient to S and above', () => {
    expect(formatChunithmScore(1_009_000)).toBe('1,009,000');
    expect(formatChunithmRating(15.256)).toBe('15.26');
    expect(formatChunithmRating(undefined)).toBe('—');
    expect(chunithmRankUsesGradient('S')).toBe(true);
    expect(chunithmRankUsesGradient('SSS+')).toBe(true);
    expect(chunithmRankUsesGradient('AAA')).toBe(false);
  });

  it('joins catalog metadata, derives rank, sorts by rating then score and keeps WORLD’S END', () => {
    const cards = buildChunithmScoreCards([
      scoreBase,
      { ...scoreBase, id: 43, song_name: '回退曲名', level_index: 4, score: 1_009_000, rating: 16 },
      { ...scoreBase, id: 44, level_index: 5, score: 1_010_000, rating: 17 },
    ], catalog).sort(compareChunithmScores);

    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({
      title: 'WORLD END 曲名',
      rank: 'SSS+',
      difficultyConstant: undefined,
      worldsEndLabel: '狂☆4',
    });
    expect(cards[1]).toMatchObject({ title: '回退曲名', rank: 'SSS+', difficultyConstant: undefined });
    expect(cards[2]).toMatchObject({
      title: '曲库曲名',
      artist: '艺术家',
      noteDesigner: '谱师',
      difficultyConstant: 14.8,
      rank: 'SS',
    });
  });

  it('formats WORLD’S END attributes without falling back to level_value', () => {
    expect(formatChunithmWorldsEndLabel({ kanji: '狂', star: 4, scoreLevel: 'ignored' }))
      .toBe('狂☆4');
    expect(formatChunithmWorldsEndLabel({ kanji: '狂', scoreLevel: 'ignored' })).toBe('狂');
    expect(formatChunithmWorldsEndLabel({ scoreLevel: '！' })).toBe('！');
    expect(formatChunithmWorldsEndLabel({})).toBe('—');
  });

  it.each([
    ['alljusticecritical', 'AJC', 'rainbow'],
    ['alljustice', 'AJ', 'platinum'],
    ['fullcombo', 'FC', 'gold'],
  ] as const)('maps full combo %s to %s', (fullCombo, label, tone) => {
    expect(chunithmAchievementBadges({
      fullCombo,
      fullChain: null,
      clear: 'clear',
    })[0]).toMatchObject({ id: 'full-combo', label, tone });
  });

  it.each([
    ['clear', 'CLEAR', 'gold'],
    ['hard', 'HARD', 'gold'],
    ['brave', 'BRAVE', 'gold'],
    ['absolute', 'ABSOLUTE', 'platinum'],
    ['catastrophy', 'CATASTROPHY', 'rainbow'],
    ['failed', 'FAILED', 'neutral'],
  ] as const)('maps clear state %s to %s', (clear, label, tone) => {
    expect(chunithmAchievementBadges({
      fullCombo: null,
      fullChain: null,
      clear,
    })).toEqual([{ id: 'clear', label, tone }]);
  });

  it('keeps achievement order and distinguishes both full chain tones', () => {
    expect(chunithmAchievementBadges({
      fullCombo: 'fullcombo',
      fullChain: 'fullchain',
      clear: 'absolute',
    })).toEqual([
      { id: 'full-combo', label: 'FC', tone: 'gold' },
      { id: 'full-chain', label: 'FULL CHAIN', tone: 'platinum' },
      { id: 'clear', label: 'ABSOLUTE', tone: 'platinum' },
    ]);
    expect(chunithmAchievementBadges({
      fullCombo: null,
      fullChain: 'fullchain2',
      clear: 'failed',
    })[0]).toEqual({
      id: 'full-chain',
      label: 'FULL CHAIN',
      tone: 'gold',
    });
  });

  it('averages only returned numeric ratings without padding empty sections', () => {
    expect(averageChunithmRating([
      scoreBase,
      { ...scoreBase, id: 43, rating: 14.75 },
      { ...scoreBase, id: 44, rating: undefined },
    ])).toBe('15.00');
    expect(averageChunithmRating([])).toBe('—');
  });
});
