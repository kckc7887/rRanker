import { describe, expect, it } from 'vitest';
import albums from './fixtures/musedash/albums.sanitized.json';
import ce from './fixtures/musedash/ce.sanitized.json';
import diffdiff from './fixtures/musedash/diffdiff.sanitized.json';
import player from './fixtures/musedash/player.sanitized.json';
import {
  MUSE_DASH_MISS_DETAIL_FAILED,
  MuseDashAlbumsResponseSchema,
  MuseDashCeResponseSchema,
  MuseDashDiffdiffResponseSchema,
  MuseDashPlayerSchema,
  buildMuseDashRandomCharts,
  buildMuseDashRawScores,
  filterMuseDashRandomCharts,
  museDashAccTone,
  museDashAchievementDetailsPending,
  museDashCharacterName,
  museDashCoverUrl,
  museDashDiffdiffMap,
  museDashElfinName,
  museDashGrade,
  museDashMissDetail,
  museDashRankBadge,
  matchesMuseDashAccRange,
  matchesMuseDashAchievementFilter,
  matchesMuseDashConstantRange,
  matchesMuseDashDifficultySlotFilter,
  matchesMuseDashDlcFilter,
  museDashAchievementFilterLabel,
  museDashSongAuthor,
  museDashSongTitle,
  museDashSongsByUid,
  resolveMuseDashAchievement,
  type MuseDashMissDetailValue,
  type MuseDashRandomChartFilters,
  type MuseDashRawScore,
  type MuseDashSong,
} from '@/domain/muse-dash';
import {
  formatMuseDashAcc,
  formatMuseDashScore,
  isNumericMuseDashLevel,
  presentMuseDashChart,
  presentMuseDashScore,
  presentMuseDashSong,
} from '@/features/game-content/adapters';

describe('Muse Dash content adapter', () => {
  const parsedAlbums = MuseDashAlbumsResponseSchema.parse(albums);
  const parsedCe = MuseDashCeResponseSchema.parse(ce);
  const parsedDiffdiff = MuseDashDiffdiffResponseSchema.parse(diffdiff);
  const parsedPlayer = MuseDashPlayerSchema.parse(player);
  const songsByUid = museDashSongsByUid(parsedAlbums);
  const fullSong = songsByUid.get('0-47')!;
  const constants = museDashDiffdiffMap(parsedDiffdiff);

  it('builds a full-catalog random pool and only requires scores for score conditions', () => {
    const rawScores = buildMuseDashRawScores(parsedPlayer, parsedAlbums, parsedCe, parsedDiffdiff);
    const charts = buildMuseDashRandomCharts(parsedAlbums, parsedDiffdiff, rawScores);
    expect(charts.length).toBeGreaterThan(rawScores.length);
    expect(charts.some((chart) => !chart.score)).toBe(true);
    const defaults = filterMuseDashRandomCharts(charts, {
      difficultySlot: 'all', dlc: 'all', constantMin: '', constantMax: '',
      accMin: '', accMax: '', achievement: 'all',
    }, new Map());
    expect(defaults.some((chart) => !chart.score)).toBe(true);
    const accFiltered = filterMuseDashRandomCharts(charts, {
      difficultySlot: 'all', dlc: 'all', constantMin: '', constantMax: '',
      accMin: '95', accMax: '', achievement: 'all',
    }, new Map());
    expect(accFiltered.every((chart) => chart.score && chart.score.play.acc >= 95)).toBe(true);
    const playedChart = charts.find((chart) => chart.score)!;
    const first = playedChart.score!;
    const missMap = new Map([[playedChart.key, 0]]);
    const fc = filterMuseDashRandomCharts(charts, {
      difficultySlot: first.play.difficulty as 0 | 1 | 2 | 3 | 4,
      dlc: first.albumTitle, constantMin: '', constantMax: '', accMin: '', accMax: '', achievement: 'fc',
    }, missMap);
    expect(fc.every((chart) => !!chart.score)).toBe(true);
    expect(fc.map((chart) => chart.key)).toContain(playedChart.key);
  });

  it('maps a chart with community constant and joined charter', () => {
    const chart = presentMuseDashChart({
      song: fullSong.song, albumTitle: fullSong.albumTitle,
      difficultyIndex: 3, constant: constants.get('0-47:3')?.[4],
    });
    expect(chart.difficulty).toMatchObject({ label: 'HIDDEN', value: '11.50' });
    expect(chart.charter).toBe('Mapper A、Mapper B');
    expect(chart.notes).toEqual([]);
  });

  it('resolves the charter per difficulty slot like the official site', () => {
    const charterAt = (difficultyIndex: number, song = fullSong.song) => presentMuseDashChart({
      song, albumTitle: 'Default Music', difficultyIndex,
    }).charter;
    expect(charterAt(0)).toBe('Mapper A');
    expect(charterAt(1)).toBe('Mapper B');
    expect(charterAt(4)).toBe('Mapper A、Mapper B');
    expect(charterAt(1, songsByUid.get('0-48')!.song)).toBe('Howard_Y');
  });

  it('falls back to uid titles when the catalog join is missing', () => {
    const raw: MuseDashRawScore = {
      play: { ...parsedPlayer.plays[0], uid: '99-99' },
      song: null, albumTitle: '未知专辑', characterName: null, elfinName: null,
    };
    const presented = presentMuseDashScore(raw);
    expect(presented.title).toBe('99-99');
    expect(presented.achievementRows.flat().map((badge) => badge.key)).not.toContain('character');
  });

  it('presents ACC-led score cards with difficulty constant and grade tone', () => {
    const raw = buildRawScore(parsedPlayer.plays[2]);
    const presented = presentMuseDashScore(raw);
    expect(presented.primaryMetric).toEqual({ key: 'acc', label: 'ACC', text: '95.48%', tone: 'acc-silver' });
    expect(presented.secondaryMetrics).toEqual([
      { key: 'rating', label: 'Rating', text: '3846', tone: 'accent' },
      { key: 'rank', label: '排名', text: '#1846' },
    ]);
    expect(presented.difficulty).toMatchObject({ label: 'HIDDEN', value: '11.50' });
    expect(presented.grade).toEqual({ key: 'grade', label: 'S', tone: 'acc-silver' });
    const badges = presented.achievementRows.flat();
    expect(badges.map((badge) => badge.key)).not.toContain('achievement');
    expect(badges.map((badge) => badge.key)).not.toContain('rank-badge');
    expect(badges.map((badge) => badge.key)).not.toContain('platform');
    expect(badges.map((badge) => badge.label)).toContain('凛·治愈者');
    expect(badges.map((badge) => badge.label)).toContain('未命名');
    expect(presented.route).toEqual({ songId: '0-47', levelIndex: 3 });
  });

  it('resolves AP/FC achievements from the requested miss count', () => {
    const ap = presentMuseDashScore(buildRawScore({ ...parsedPlayer.plays[2], acc: 100 }), { detail: { play: { miss: 0 } } });
    expect(ap.achievementRows.flat().map((badge) => badge.label)).toContain('AP');
    expect(ap.achievementRows.flat().find((badge) => badge.key === 'achievement')?.tone).toBe('achievement-ap');
    const fc = presentMuseDashScore(buildRawScore(parsedPlayer.plays[2]), { detail: { play: { miss: 0 } } });
    expect(fc.achievementRows.flat().map((badge) => badge.label)).toContain('FC');
    expect(fc.achievementRows.flat().find((badge) => badge.key === 'achievement')?.tone).toBe('achievement-fc');
    const withMiss = presentMuseDashScore(buildRawScore(parsedPlayer.plays[2]), { detail: { play: { miss: 2 } } });
    expect(withMiss.achievementRows.flat().map((badge) => badge.key)).not.toContain('achievement');
    const pending = presentMuseDashScore(buildRawScore(parsedPlayer.plays[2]));
    expect(pending.achievementRows.flat().map((badge) => badge.key)).not.toContain('achievement');
  });

  it('presents song rows with constant-only badges and non-numeric level prefixes', () => {
    const row = presentMuseDashSong({ song: fullSong.song, albumTitle: fullSong.albumTitle }, [
      constants.get('0-47:0')?.[4], constants.get('0-47:1')?.[4],
      constants.get('0-47:2')?.[4], constants.get('0-47:3')?.[4], constants.get('0-47:4')?.[4],
    ]);
    expect(row.title).toBe('示例歌曲');
    expect(row.subtitle).toBe('示例作者 · Default Music');
    expect(row.chartBadges.map((badge) => badge.value)).toEqual(['2', '5', '8', '11.50', '12.50']);
    const special: MuseDashSong = {
      ...fullSong.song,
      uid: '9-9', name: 'Special', author: 'A', difficulty: ['2', '5', '8', '0', 'L'],
    };
    const specialRow = presentMuseDashSong({ song: special, albumTitle: 'Pack' },
      [undefined, undefined, undefined, undefined, 7.56]);
    expect(specialRow.chartBadges.map((badge) => badge.value)).toEqual(['2', '5', '8', 'L 7.56']);
    const noConstant = presentMuseDashSong({ song: special, albumTitle: 'Pack' });
    expect(noConstant.chartBadges.map((badge) => badge.value)).toEqual(['2', '5', '8', 'L']);
  });

  it('presents chart cards with ACC metric, grade, achievements and charter', () => {
    const chart = presentMuseDashChart({
      song: fullSong.song, albumTitle: fullSong.albumTitle,
      difficultyIndex: 4, constant: constants.get('0-47:4')?.[4],
    }, buildRawScore({ ...parsedPlayer.plays[2], difficulty: 4, acc: 100, sum: 10000 }),
    { play: { miss: 0 } });
    expect(chart.difficulty).toMatchObject({ label: 'EX', value: '12.50' });
    expect(chart.primaryMetric).toEqual({ key: 'acc', label: 'ACC', text: '100.00%', tone: 'acc-gold' });
    expect(chart.grade).toEqual({ key: 'grade', label: 'S', tone: 'acc-gold' });
    expect(chart.achievementRows.flat().map((badge) => badge.label)).toContain('AP');
    expect(chart.charter).toBe('Mapper A、Mapper B');
    expect(chart.notes).toEqual([]);
    const unplayed = presentMuseDashChart({
      song: fullSong.song, albumTitle: fullSong.albumTitle,
      difficultyIndex: 4, constant: constants.get('0-47:4')?.[4],
    });
    expect(unplayed.primaryMetric.text).toBe('—');
    expect(unplayed.grade).toBeUndefined();
  });

  it('keeps helper formatting, tone, grade, rank, achievement and cover contracts', () => {
    expect(formatMuseDashAcc(94.16999816894531)).toBe('94.17%');
    expect(formatMuseDashScore(302027)).toBe('302,027');
    expect(museDashSongTitle(fullSong.song)).toBe('示例歌曲');
    expect(museDashSongAuthor(fullSong.song)).toBe('示例作者');
    expect(museDashCharacterName(parsedCe, '11')).toBe('布若');
    expect(museDashCharacterName(parsedCe, '999')).toBeNull();
    expect(museDashCharacterName(parsedCe, undefined)).toBeNull();
    expect(museDashElfinName(parsedCe, '7')).toBe('厄普西隆');
    expect(museDashElfinName(parsedCe, 'x')).toBeNull();
    expect(museDashAccTone(100)).toBe('acc-gold');
    expect(museDashAccTone(97.31)).toBe('acc-silver');
    expect(museDashAccTone(94.17)).toBe('acc-red');
    expect(museDashAccTone(85)).toBe('acc-blue');
    expect(museDashAccTone(75)).toBe('acc-green');
    expect(museDashAccTone(65)).toBe('acc-gray');
    expect(museDashAccTone(55)).toBe('acc-purple');
    expect(museDashGrade(95)).toBe('S');
    expect(museDashGrade(89.99)).toBe('A');
    expect(museDashGrade(79.99)).toBe('B');
    expect(museDashGrade(69.99)).toBe('C');
    expect(museDashGrade(59.99)).toBe('D');
    expect(museDashRankBadge(0)).toBeNull();
    expect(museDashRankBadge(1)).toEqual({ label: '#1', tone: 'rank-rainbow' });
    expect(museDashRankBadge(9)).toEqual({ label: '#9', tone: 'rank-gold' });
    expect(museDashRankBadge(49)).toEqual({ label: '#49', tone: 'rank-blue' });
    expect(museDashRankBadge(99)).toEqual({ label: '#99', tone: 'rank-green' });
    expect(museDashRankBadge(100)).toBeNull();
    expect(resolveMuseDashAchievement(100, 0)).toBe('AP');
    expect(resolveMuseDashAchievement(99.99, 0)).toBe('FC');
    expect(resolveMuseDashAchievement(100, 1)).toBeNull();
    expect(resolveMuseDashAchievement(100, undefined)).toBeNull();
    expect(matchesMuseDashAchievementFilter(94.17, 0, 'all')).toBe(true);
    expect(matchesMuseDashAchievementFilter(94.17, 2, 'all')).toBe(true);
    expect(matchesMuseDashAchievementFilter(94.17, 0, 'fc')).toBe(true);
    expect(matchesMuseDashAchievementFilter(100, 0, 'fc')).toBe(true);
    expect(matchesMuseDashAchievementFilter(94.17, 2, 'fc')).toBe(false);
    expect(matchesMuseDashAchievementFilter(94.17, undefined, 'fc')).toBe(false);
    expect(matchesMuseDashAchievementFilter(100, 0, 'ap')).toBe(true);
    expect(matchesMuseDashAchievementFilter(99.99, 0, 'ap')).toBe(false);
    expect(matchesMuseDashAchievementFilter(100, 1, 'ap')).toBe(false);
    expect(matchesMuseDashConstantRange(8.2, '', '')).toBe(true);
    expect(matchesMuseDashConstantRange(8.2, '9', '')).toBe(false);
    expect(matchesMuseDashConstantRange(8.2, '', '8')).toBe(false);
    expect(matchesMuseDashConstantRange(11.5, '9', '12')).toBe(true);
    expect(matchesMuseDashAccRange(97.31, '90', '')).toBe(true);
    expect(matchesMuseDashAccRange(94.17, '95', '')).toBe(false);
    expect(matchesMuseDashAccRange(94.17, '94', '94.5')).toBe(true);
    expect(matchesMuseDashDifficultySlotFilter([true, false, true], 0, 'all')).toBe(true);
    expect(matchesMuseDashDifficultySlotFilter([true, false, true], 2, 2)).toBe(true);
    expect(matchesMuseDashDifficultySlotFilter([true, false, true], 1, 1)).toBe(false);
    expect(matchesMuseDashDlcFilter('Default Music', 'all')).toBe(true);
    expect(matchesMuseDashDlcFilter('Default Music', 'Second Album')).toBe(false);
    expect(matchesMuseDashDlcFilter('Second Album', 'Second Album')).toBe(true);
    expect(museDashAchievementFilterLabel('all')).toBe('全部');
    expect(museDashAchievementFilterLabel('fc')).toBe('FC');
    expect(museDashAchievementFilterLabel('ap')).toBe('AP');
    expect(museDashCoverUrl('magical_wonderland_cover'))
      .toBe('https://musedash.moe/covers/magical_wonderland_cover.webp');
    expect(museDashCoverUrl(undefined)).toBeNull();
    expect(isNumericMuseDashLevel('11')).toBe(true);
    expect(isNumericMuseDashLevel('L')).toBe(false);
    expect(isNumericMuseDashLevel('?')).toBe(false);
  });

  it('supports the full-max boundary: perfect accuracy with zero miss is AP', () => {
    const fullSongType: MuseDashSong = fullSong.song;
    const perfect = buildRawScore({
      ...parsedPlayer.plays[2],
      score: 1_000_000, acc: 100, i: 1, history: { lastRank: 1 }, sum: 10000, difficulty: 4,
    });
    const presented = presentMuseDashScore(perfect, { detail: { play: { miss: 0 } } });
    expect(presented.primaryMetric.text).toBe('100.00%');
    expect(presented.primaryMetric.tone).toBe('acc-gold');
    expect(presented.grade?.label).toBe('S');
    expect(presented.achievementRows.flat().find((badge) => badge.key === 'achievement')?.label).toBe('AP');
    expect(fullSongType.difficulty[4]).toBe('12');
  });

  it('未确认的 miss 明细不得当作已满足 AP/FC', () => {
    expect(museDashMissDetail(null)).toEqual({ status: 'pending' });
    expect(museDashMissDetail(undefined)).toEqual({ status: 'unknown' });
    expect(museDashMissDetail(0)).toEqual({ status: 'known', miss: 0 });
    expect(museDashMissDetail(3)).toEqual({ status: 'known', miss: 3 });
    expect(matchesMuseDashAchievementFilter(100, undefined, 'ap')).toBe(false);
    expect(resolveMuseDashAchievement(100, undefined)).toBeNull();
  });

  it('把请求最终失败与「上游没有 miss 字段」分开', () => {
    expect(museDashMissDetail(MUSE_DASH_MISS_DETAIL_FAILED)).toEqual({ status: 'failed' });
    expect(museDashMissDetail(MUSE_DASH_MISS_DETAIL_FAILED)).not.toEqual(museDashMissDetail(undefined));
  });

  it('成就筛选只保留已确认 miss 的候选，且只有 pending 才需要等待', () => {
    const rawScores = buildMuseDashRawScores(parsedPlayer, parsedAlbums, parsedCe, parsedDiffdiff);
    const played = buildMuseDashRandomCharts(parsedAlbums, parsedDiffdiff, rawScores)
      .find((chart) => chart.score)!;
    const pool = [{ ...played, score: { ...played.score!, play: { ...played.score!.play, acc: 100 } } }];
    const filters = {
      difficultySlot: 'all', dlc: 'all', constantMin: '', constantMax: '',
      accMin: '', accMax: '', achievement: 'ap',
    } satisfies MuseDashRandomChartFilters;
    const keysFor = (miss: MuseDashMissDetailValue) =>
      filterMuseDashRandomCharts(pool, filters, new Map([[played.key, miss]])).map((chart) => chart.key);

    expect(keysFor(0)).toEqual([played.key]);
    expect(keysFor(null)).toEqual([]);
    expect(keysFor(undefined)).toEqual([]);
    expect(keysFor(MUSE_DASH_MISS_DETAIL_FAILED)).toEqual([]);
    expect(museDashAchievementDetailsPending(pool, filters, new Map([[played.key, null]]))).toBe(true);
    expect(museDashAchievementDetailsPending(pool, filters, new Map([[played.key, undefined]]))).toBe(false);
    expect(museDashAchievementDetailsPending(pool, filters, new Map([[played.key, 0]]))).toBe(false);
    // 失败不会自行变成结果，等待它没有意义；重试成功后同一候选才回到已确认集合。
    expect(museDashAchievementDetailsPending(pool, filters, new Map([[played.key, MUSE_DASH_MISS_DETAIL_FAILED]])))
      .toBe(false);
    expect(keysFor(0)).toEqual([played.key]);
    expect(museDashAchievementDetailsPending(pool, { ...filters, achievement: 'all' }, new Map())).toBe(false);
  });

  function buildRawScore(play: (typeof parsedPlayer.plays)[number]): MuseDashRawScore {
    const joined = songsByUid.get(play.uid);
    return {
      play,
      song: joined?.song ?? null,
      albumTitle: joined?.albumTitle ?? '未知专辑',
      characterName: museDashCharacterName(parsedCe, play.character_uid),
      elfinName: museDashElfinName(parsedCe, play.elfin_uid),
      constant: constants.get(`${play.uid}:${play.difficulty}`)?.[4],
    };
  }
});
