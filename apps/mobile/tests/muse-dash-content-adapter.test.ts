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
  museDashCharacterName,
  museDashDiffdiffMap,
  museDashElfinName,
  museDashSongAuthor,
  museDashSongTitle,
  museDashSongsByUid,
  type MuseDashRawScore,
  type MuseDashSong,
} from '@/domain/muse-dash';
import {
  formatMuseDashAcc,
  formatMuseDashScore,
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
    expect(song.charts[0]).toMatchObject({ label: '简单', level: '2', order: 0 });
    expect(song.charts[4]).toMatchObject({ label: '隐藏', level: '12' });
    expect(song.extension.song).toBe(fullSong.song);
  });

  it('skips missing difficulty slots and reports no library key', () => {
    const sparse = museDashContentAdapter.normalizeSong({
      song: songsByUid.get('0-48')!.song, albumTitle: 'Default Music',
    });
    expect(sparse.charts).toHaveLength(2);
    expect(sparse.charts.map((chart) => chart.extension.difficultyIndex)).toEqual([0, 1]);
    expect(sparse.charts[0].libraryRef).toBeUndefined();
  });

  it('maps a chart with community constant and joined charter', () => {
    const chart = museDashContentAdapter.normalizeChart({
      song: fullSong.song, albumTitle: fullSong.albumTitle,
      difficultyIndex: 3, constant: constants.get('0-47:3')?.[4],
    });
    expect(chart).toMatchObject({
      chartId: '0-47:3', order: 3, label: '大师', level: '11',
      constant: 11.5, charter: 'Mapper A、Mapper B',
    });
    expect(chart.notes).toEqual([]);
    expect(chart.extension).toMatchObject({ difficultyIndex: 3, officialLevel: '11', constant: 11.5 });
  });

  it('maps scores with join result and character/elfin names into extensions', () => {
    const raw: MuseDashRawScore = {
      play: parsedPlayer.plays[0],
      song: songsByUid.get('1-1')?.song ?? null,
      albumTitle: songsByUid.get('1-1')?.albumTitle ?? '未知专辑',
      characterName: museDashCharacterName(parsedCe, parsedPlayer.plays[0].character_uid),
      elfinName: museDashElfinName(parsedCe, parsedPlayer.plays[0].elfin_uid),
    };
    const score = museDashContentAdapter.normalizeScore(raw);
    expect(score).toMatchObject({
      gameId: 'musedash', songId: '1-1', chartId: '1-1:2', order: 2, key: '1-1:2',
      title: 'Another Track', rating: 3950,
    });
    expect(score.extension).toMatchObject({
      acc: 94.16999816894531, currentRank: 1950, lastRank: 1949, sum: 3950,
      platform: 'mobile', characterName: '布若', elfinName: '厄普西隆',
    });
    expect(score.libraryRef).toBeUndefined();
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

  it('presents full and sparse score cards', () => {
    const raw = buildRawScore(parsedPlayer.plays[2]);
    const presented = presentMuseDashScore(raw);
    expect(presented.primaryMetric.text).toBe('290,510');
    expect(presented.secondaryMetrics).toEqual([
      { key: 'acc', label: 'ACC', text: '95.48%' },
      { key: 'rating', label: 'Rating', text: '3846', tone: 'accent' },
      { key: 'rank', label: '排名', text: '#1846' },
    ]);
    expect(presented.difficulty).toMatchObject({ label: '大师', value: '11' });
    const badges = presented.achievementRows.flat();
    expect(badges.map((badge) => badge.label)).toContain('凛·治愈者');
    expect(badges.map((badge) => badge.label)).toContain('PC 端');
    expect(presented.route).toEqual({ songId: '0-47', levelIndex: 3 });
  });

  it('presents song rows and chart cards with dynamic difficulty badges', () => {
    const row = presentMuseDashSong({ song: fullSong.song, albumTitle: fullSong.albumTitle }, [
      constants.get('0-47:0')?.[4], constants.get('0-47:1')?.[4],
      constants.get('0-47:2')?.[4], constants.get('0-47:3')?.[4], constants.get('0-47:4')?.[4],
    ]);
    expect(row.title).toBe('示例歌曲');
    expect(row.subtitle).toBe('示例作者 · Default Music');
    expect(row.chartBadges.map((badge) => badge.value)).toEqual(['2', '5', '8', '11.50', '12.50']);
    const chart = presentMuseDashChart({
      song: fullSong.song, albumTitle: fullSong.albumTitle,
      difficultyIndex: 4, constant: constants.get('0-47:4')?.[4],
    });
    expect(chart.difficulty).toMatchObject({ label: '隐藏', value: '12' });
    expect(chart.notes).toEqual([]);
    expect(chart.charter).toBe('Mapper A、Mapper B');
  });

  it('keeps helper formatting and name resolution contracts', () => {
    expect(formatMuseDashAcc(94.16999816894531)).toBe('94.17%');
    expect(formatMuseDashScore(302027)).toBe('302,027');
    expect(museDashSongTitle(fullSong.song)).toBe('示例歌曲');
    expect(museDashSongAuthor(fullSong.song)).toBe('示例作者');
    expect(museDashCharacterName(parsedCe, '11')).toBe('布若');
    expect(museDashCharacterName(parsedCe, '999')).toBeNull();
    expect(museDashCharacterName(parsedCe, undefined)).toBeNull();
    expect(museDashElfinName(parsedCe, '7')).toBe('厄普西隆');
    expect(museDashElfinName(parsedCe, 'x')).toBeNull();
  });

  function buildRawScore(play: (typeof parsedPlayer.plays)[number]): MuseDashRawScore {
    const joined = songsByUid.get(play.uid);
    return {
      play,
      song: joined?.song ?? null,
      albumTitle: joined?.albumTitle ?? '未知专辑',
      characterName: museDashCharacterName(parsedCe, play.character_uid),
      elfinName: museDashElfinName(parsedCe, play.elfin_uid),
    };
  }

  it('supports the full-max boundary: perfect accuracy and top sums render plainly', () => {
    const fullSongType: MuseDashSong = fullSong.song;
    const perfect = buildRawScore({
      ...parsedPlayer.plays[2],
      score: 1_000_000, acc: 100, i: 1, history: { lastRank: 1 }, sum: 10000, difficulty: 4,
    });
    const presented = presentMuseDashScore(perfect);
    expect(presented.primaryMetric.text).toBe('1,000,000');
    expect(presented.achievementRows.flat().map((badge) => badge.label)).not.toContain('历史 #1');
    expect(fullSongType.difficulty[4]).toBe('12');
  });
});
