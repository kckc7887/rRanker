import { describe, expect, it } from 'vitest';
import albums from './fixtures/musedash/albums.sanitized.json';
import ce from './fixtures/musedash/ce.sanitized.json';
import diffdiff from './fixtures/musedash/diffdiff.sanitized.json';
import player from './fixtures/musedash/player.sanitized.json';
import {
  MuseDashAlbumsResponseSchema,
  MuseDashCeResponseSchema,
  MuseDashDiffdiffResponseSchema,
  MuseDashPlayerSchema,
  museDashAccTone,
  museDashCharacterName,
  museDashCoverUrl,
  museDashDiffdiffMap,
  museDashElfinName,
  museDashGrade,
  museDashRankBadge,
  museDashSongAuthor,
  museDashSongTitle,
  museDashSongsByUid,
  resolveMuseDashAchievement,
  type MuseDashRawScore,
  type MuseDashSong,
} from '@/domain/muse-dash';
import {
  formatMuseDashAcc,
  formatMuseDashScore,
  isNumericMuseDashLevel,
  museDashContentAdapter,
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

  it('maps every song with Chinese-first title and per-slot charts', () => {
    const song = museDashContentAdapter.normalizeSong({ song: fullSong.song, albumTitle: fullSong.albumTitle });
    expect(song).toMatchObject({
      gameId: 'musedash', songId: '0-47', title: '示例歌曲', artist: '示例作者',
    });
    expect(song.metadata.album).toBe('Default Music');
    expect(song.metadata.bpm).toBe(128);
    expect(song.charts.map((chart) => chart.chartId)).toEqual([
      '0-47:0', '0-47:1', '0-47:2', '0-47:3', '0-47:4',
    ]);
    expect(song.charts[0]).toMatchObject({ label: 'EASY', level: '2', order: 0, libraryRef: { type: 'SD', levelIndex: 0 } });
    expect(song.charts[4]).toMatchObject({ label: 'EX', level: '12', libraryRef: { type: 'SD', levelIndex: 4 } });
    expect(song.extension.song).toBe(fullSong.song);
  });

  it('skips missing difficulty slots and keeps SD library keys', () => {
    const sparse = museDashContentAdapter.normalizeSong({
      song: songsByUid.get('0-48')!.song, albumTitle: 'Default Music',
    });
    expect(sparse.charts).toHaveLength(2);
    expect(sparse.charts.map((chart) => chart.extension.difficultyIndex)).toEqual([0, 1]);
    expect(sparse.charts[0].libraryRef).toEqual({ type: 'SD', levelIndex: 0 });
  });

  it('maps a chart with community constant and joined charter', () => {
    const chart = museDashContentAdapter.normalizeChart({
      song: fullSong.song, albumTitle: fullSong.albumTitle,
      difficultyIndex: 3, constant: constants.get('0-47:3')?.[4],
    });
    expect(chart).toMatchObject({
      chartId: '0-47:3', order: 3, label: 'HIDDEN', level: '11',
      constant: 11.5, charter: 'Mapper A、Mapper B',
      libraryRef: { type: 'SD', levelIndex: 3 },
    });
    expect(chart.notes).toEqual([]);
    expect(chart.extension).toMatchObject({ difficultyIndex: 3, officialLevel: '11', constant: 11.5 });
  });

  it('resolves the charter per difficulty slot like the official site', () => {
    const easy = museDashContentAdapter.normalizeChart({
      song: fullSong.song, albumTitle: fullSong.albumTitle, difficultyIndex: 0,
    });
    expect(easy.charter).toBe('Mapper A');
    const hard = museDashContentAdapter.normalizeChart({
      song: fullSong.song, albumTitle: fullSong.albumTitle, difficultyIndex: 1,
    });
    expect(hard.charter).toBe('Mapper B');
    const missing = museDashContentAdapter.normalizeChart({
      song: fullSong.song, albumTitle: fullSong.albumTitle, difficultyIndex: 4,
    });
    expect(missing.charter).toBe('Mapper A、Mapper B');
    const single = museDashContentAdapter.normalizeChart({
      song: songsByUid.get('0-48')!.song, albumTitle: 'Default Music', difficultyIndex: 1,
    });
    expect(single.charter).toBe('Howard_Y');
  });

  it('maps scores with join result, character/elfin names and SD library reference', () => {
    const raw: MuseDashRawScore = {
      play: parsedPlayer.plays[0],
      song: songsByUid.get('1-1')?.song ?? null,
      albumTitle: songsByUid.get('1-1')?.albumTitle ?? '未知专辑',
      characterName: museDashCharacterName(parsedCe, parsedPlayer.plays[0].character_uid),
      elfinName: museDashElfinName(parsedCe, parsedPlayer.plays[0].elfin_uid),
      constant: constants.get('1-1:2')?.[4],
    };
    const score = museDashContentAdapter.normalizeScore(raw);
    expect(score).toMatchObject({
      gameId: 'musedash', songId: '1-1', chartId: '1-1:2', order: 2, key: '1-1:2',
      title: 'Another Track', rating: 3950, libraryRef: { type: 'SD', levelIndex: 2 },
    });
    expect(score.extension).toMatchObject({
      acc: 94.16999816894531, currentRank: 1950, lastRank: 1949, sum: 3950,
      platform: 'mobile', characterName: '布若', elfinName: '厄普西隆',
    });
  });

  it('falls back to uid titles when the catalog join is missing', () => {
    const raw: MuseDashRawScore = {
      play: { ...parsedPlayer.plays[0], uid: '99-99' },
      song: null, albumTitle: '未知专辑', characterName: null, elfinName: null,
    };
    const score = museDashContentAdapter.normalizeScore(raw);
    expect(score.title).toBe('99-99');
    expect(score.extension.characterName).toBeNull();
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
