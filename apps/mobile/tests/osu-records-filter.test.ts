import {
  OSU_MOD_FILTER_NONE,
  filterOsuBestScores,
  matchesOsuRange,
  type OsuRecordsFilters,
} from '@/domain/osu-filters';
import type { OsuBestScore } from '@/domain/osu';

const baseFilters: OsuRecordsFilters = {
  keyword: '',
  mods: [],
  accuracyMin: '',
  accuracyMax: '',
  starMin: '',
  starMax: '',
  ppMin: '',
  ppMax: '',
};

/** HD+DT 成绩：98.52% / 5.5★ / pp 72.98。 */
const hdDt: OsuBestScore = {
  id: 1,
  score: 985754,
  accuracy: 0.9852,
  maxCombo: 450,
  pp: 72.9787,
  rank: 'X',
  beatmap: { id: 11, beatmapSetId: 3720, difficultyRating: 5.5, version: 'Hard' },
  beatmapset: { id: 3720, title: 'Tori no Uta', artist: 'Lia', creator: 'James', listCover: null },
  statistics: null,
  mods: ['HD', 'DT'],
  achievedAt: null,
};

/** 无模组成绩：96.00% / 4.3★ / pp 55.4。 */
const noMod: OsuBestScore = {
  id: 2,
  score: 1111111,
  accuracy: 0.96,
  maxCombo: 300,
  pp: 55.4,
  rank: 'S',
  beatmap: { id: 12, beatmapSetId: 3721, difficultyRating: 4.3, version: 'Normal' },
  beatmapset: { id: 3721, title: '夜の歌', artist: 'Aya', creator: 'Momo', listCover: null },
  statistics: null,
  mods: [],
  achievedAt: null,
};

/** 仅 DT 成绩：99.00% / 6.9★ / pp 缺失。 */
const dtOnly: OsuBestScore = {
  id: 3,
  score: 1234567,
  accuracy: 0.99,
  maxCombo: 900,
  pp: null,
  rank: 'A',
  beatmap: { id: 13, beatmapSetId: 3722, difficultyRating: 6.9, version: 'Insane' },
  beatmapset: { id: 3722, title: 'SUN', artist: 'Bemi', creator: 'Nagi', listCover: null },
  statistics: null,
  mods: ['DT'],
  achievedAt: null,
};

const all = [hdDt, noMod, dtOnly];

describe('matchesOsuRange 区间匹配', () => {
  it('空为不限、闭区间比较', () => {
    expect(matchesOsuRange(5.5, '', '')).toBe(true);
    expect(matchesOsuRange(5.5, '5', '')).toBe(true);
    expect(matchesOsuRange(5.5, '', '6')).toBe(true);
    expect(matchesOsuRange(5.5, '5', '6.5')).toBe(true);
    expect(matchesOsuRange(5.5, '5.5', '5.5')).toBe(true);
    expect(matchesOsuRange(5.5, '5.51', '')).toBe(false);
    expect(matchesOsuRange(5.5, '', '5.49')).toBe(false);
  });

  it('min>max 恒 false；非法输入静默判 false', () => {
    expect(matchesOsuRange(5.5, '6', '5')).toBe(false);
    expect(matchesOsuRange(5.5, 'abc', '')).toBe(false);
    expect(matchesOsuRange(5.5, '', 'x')).toBe(false);
  });

  it('NFKC 归一化：全角数字与全角逗号小数可解析', () => {
    expect(matchesOsuRange(98.52, '９８', '98.6')).toBe(true);
    expect(matchesOsuRange(98.5, '98，5', '98.5')).toBe(true);
  });
});

describe('filterOsuBestScores 成绩筛选', () => {
  it('全默认时全部保留且保持上游顺序', () => {
    expect(filterOsuBestScores(all, baseFilters)).toEqual(all);
  });

  it('关键词命中标题/艺术家/谱面名，大小写不敏感、两侧空白裁剪', () => {
    expect(filterOsuBestScores(all, { ...baseFilters, keyword: 'tori' }).map((s) => s.id))
      .toEqual([1]);
    expect(filterOsuBestScores(all, { ...baseFilters, keyword: '  LIA ' }).map((s) => s.id))
      .toEqual([1]);
    expect(filterOsuBestScores(all, { ...baseFilters, keyword: 'insane' }).map((s) => s.id))
      .toEqual([3]);
    expect(filterOsuBestScores(all, { ...baseFilters, keyword: '不存在' })).toEqual([]);
  });

  it('模组 AND 语义：选中项全部包含才命中', () => {
    expect(filterOsuBestScores(all, { ...baseFilters, mods: ['HD'] }).map((s) => s.id))
      .toEqual([1]);
    expect(filterOsuBestScores(all, { ...baseFilters, mods: ['HD', 'DT'] }).map((s) => s.id))
      .toEqual([1]);
    expect(filterOsuBestScores(all, { ...baseFilters, mods: ['DT'] }).map((s) => s.id))
      .toEqual([1, 3]);
  });

  it('NM 无模组仅命中 mods 为空的成绩（与具体模组组合时同样只看无模组）', () => {
    expect(filterOsuBestScores(all, { ...baseFilters, mods: [OSU_MOD_FILTER_NONE] }).map((s) => s.id))
      .toEqual([2]);
    expect(filterOsuBestScores(all, { ...baseFilters, mods: [OSU_MOD_FILTER_NONE, 'DT'] }).map((s) => s.id))
      .toEqual([2]);
  });

  it('达成率为百分比口径：0.9852 ↔ 输入 98~99', () => {
    expect(filterOsuBestScores(all, { ...baseFilters, accuracyMin: '98', accuracyMax: '99' }).map((s) => s.id))
      .toEqual([1, 3]);
    expect(filterOsuBestScores(all, { ...baseFilters, accuracyMin: '99' }).map((s) => s.id))
      .toEqual([3]);
    expect(filterOsuBestScores(all, { ...baseFilters, accuracyMax: '97' }).map((s) => s.id))
      .toEqual([2]);
  });

  it('难度按星数区间筛选', () => {
    expect(filterOsuBestScores(all, { ...baseFilters, starMin: '5', starMax: '6.5' }).map((s) => s.id))
      .toEqual([1]);
    expect(filterOsuBestScores(all, { ...baseFilters, starMin: '6' }).map((s) => s.id))
      .toEqual([3]);
  });

  it('PP：区间内命中；pp 缺失仅在设置 pp 范围时排除', () => {
    expect(filterOsuBestScores(all, { ...baseFilters, ppMin: '60' }).map((s) => s.id))
      .toEqual([1]);
    expect(filterOsuBestScores(all, { ...baseFilters, ppMax: '60' }).map((s) => s.id))
      .toEqual([2]);
    // ppMax 设为 9999 仍属「已设置范围」：pp 缺失的 dtOnly 依旧被排除。
    expect(filterOsuBestScores(all, { ...baseFilters, ppMax: '9999' }).map((s) => s.id))
      .toEqual([1, 2]);
  });

  it('多条件叠加取交集', () => {
    expect(filterOsuBestScores(all, {
      ...baseFilters,
      mods: ['DT'],
      accuracyMin: '98',
      starMax: '6',
      ppMin: '50',
    }).map((s) => s.id)).toEqual([1]);
  });
});
