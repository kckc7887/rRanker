import { describe, expect, it } from 'vitest';
import type { GameId } from '@/domain/game-bind-options';
import { GAME_IDS } from '@/domain/game-bind-options';
import { libraryDetailTarget } from '@/domain/user-library';
import {
  decodeDetailTarget,
  detailTargetHref,
  encodeDetailTarget,
  type DetailTarget,
  type DetailTargetErrorCode,
} from '@/domain/detail-target';

describe('个人曲库详情身份', () => {
  it.each(GAME_IDS)('%s 在缺少曲库元数据时仍可编码歌曲与谱面目标', gameId => {
    for (const kind of ['song', 'chart'] as const) {
      const target = libraryDetailTarget(kind === 'song'
        ? { gameId, kind, songId: '42' }
        : { gameId, kind, songId: '42', type: 'SD', levelIndex: 2 });
      expect(target).not.toBeNull();
      expect(decodeDetailTarget(detailTargetHref(encodeDetailTarget(target!)).params))
        .toEqual({ ok: true, target });
    }
  });
});

function roundTrip(target: DetailTarget): DetailTarget {
  expect(detailTargetHref(encodeDetailTarget(target)).params.gameId).toBe(target.game);
  const resolution = decodeDetailTarget(detailTargetHref(encodeDetailTarget(target)).params);
  expect(resolution.ok).toBe(true);
  return (resolution as { ok: true; target: DetailTarget }).target;
}

function errorOf(gameId: GameId, params: Parameters<typeof decodeDetailTarget>[0]) {
  const resolution = decodeDetailTarget({ ...params, gameId });
  expect(resolution.ok).toBe(false);
  return resolution as { ok: false; code: DetailTargetErrorCode; parameter: string; message: string };
}

describe('DetailTarget 编解码', () => {
  it('每种游戏的目标都能经详情路由参数往返', () => {
    expect(roundTrip({ game: 'maimai', songId: '152', chartType: 'DX', levelIndex: 4 }))
      .toEqual({ game: 'maimai', songId: '152', chartType: 'DX', levelIndex: 4 });
    expect(roundTrip({ game: 'maimai', songId: '1' })).toEqual({ game: 'maimai', songId: '1' });
    expect(roundTrip({ game: 'phigros', songId: 'Song.A', levelIndex: 3 }))
      .toEqual({ game: 'phigros', songId: 'Song.A', levelIndex: 3 });
    expect(roundTrip({ game: 'chunithm', songId: '3', levelIndex: 3 }))
      .toEqual({ game: 'chunithm', songId: '3', levelIndex: 3 });
    expect(roundTrip({ game: 'majdata-net', songId: 'uuid-1', levelIndex: 5 }))
      .toEqual({ game: 'majdata-net', songId: 'uuid-1', levelIndex: 5 });
    expect(roundTrip({ game: 'rizline', songId: 'song.a', levelIndex: 2 }))
      .toEqual({ game: 'rizline', songId: 'song.a', levelIndex: 2 });
    expect(roundTrip({ game: 'musedash', songId: '0-47', levelIndex: 3 }))
      .toEqual({ game: 'musedash', songId: '0-47', levelIndex: 3 });
    expect(roundTrip({ game: 'phira', chartId: '19365' })).toEqual({ game: 'phira', chartId: '19365' });
    expect(roundTrip({ game: 'adofai', levelId: '11372' })).toEqual({ game: 'adofai', levelId: '11372' });
    expect(roundTrip({ game: 'osu-standard', beatmapsetId: '3720', beatmapId: 22423, scoreId: 999 }))
      .toEqual({ game: 'osu-standard', beatmapsetId: '3720', beatmapId: 22423, scoreId: 999 });
  });

  it('osu 的 beatmap id 与难度索引不混淆', () => {
    const osu = roundTrip({ game: 'osu-mania', beatmapsetId: '3720', beatmapId: 22423 });
    expect(osu).toEqual({ game: 'osu-mania', beatmapsetId: '3720', beatmapId: 22423 });

    const encoded = detailTargetHref(encodeDetailTarget({
      game: 'osu-standard', beatmapsetId: '3720', beatmapId: 22423,
    })).params;
    expect(encoded).toEqual({ songId: '3720', beatmapId: '22423', gameId: 'osu-standard' });
    expect(encoded).not.toHaveProperty('levelIndex');

    expect(decodeDetailTarget({ gameId: 'phigros', songId: '3720', levelIndex: '22423' })).toEqual({
      ok: true,
      target: { game: 'phigros', songId: '3720', levelIndex: 22423 },
    });
  });

  it('错误的游戏字段组合返回可判别的错误', () => {
    expect(errorOf('osu-standard', { songId: '3720', beatmapId: '1', levelIndex: '2' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'levelIndex' });
    expect(errorOf('phigros', { songId: 'Song.A', beatmapId: '22423' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'beatmapId' });
    expect(errorOf('phigros', { songId: 'Song.A', chartType: 'DX' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'chartType' });
    expect(errorOf('phigros', { songId: 'Song.A', scoreId: '9' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'scoreId' });
    expect(decodeDetailTarget({ songId: '1', gameId: 'phigros' }))
      .toEqual({ ok: true, target: { game: 'phigros', songId: '1' } });
  });

  it('缺失或非法参数返回可判别的错误', () => {
    expect(decodeDetailTarget({ songId: '1' })).toMatchObject({ ok: false, code: 'missing_parameter', parameter: 'gameId' });
    for (const gameId of ['toString', '__proto__', 'constructor']) {
      expect(decodeDetailTarget({ songId: '1', gameId }))
        .toMatchObject({ ok: false, code: 'unsupported_game' });
    }
    expect(errorOf('maimai', {})).toMatchObject({ code: 'missing_parameter', parameter: 'songId' });
    expect(errorOf('phigros', { songId: '   ' }))
      .toMatchObject({ code: 'missing_parameter', parameter: 'songId' });
    expect(errorOf('phigros', { songId: 'Song.A', levelIndex: 'abc' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'levelIndex' });
    expect(errorOf('phigros', { songId: 'Song.A', levelIndex: '-1' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'levelIndex' });
    expect(errorOf('phigros', { songId: 'Song.A', levelIndex: '1.5' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'levelIndex' });
    expect(errorOf('maimai', { songId: '1', chartType: 'XX' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'chartType' });
    expect(errorOf('rizline', { songId: 'song.a', scoreId: '9' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'scoreId' });
  });

  it('空字符串槽位等价于未提供', () => {
    expect(decodeDetailTarget({ gameId: 'phigros', songId: 'Song.A', levelIndex: '' }))
      .toEqual({ ok: true, target: { game: 'phigros', songId: 'Song.A' } });
  });

  it('共享卡片的 href 携带游戏与谱面参数', () => {
    expect(detailTargetHref(encodeDetailTarget({ game: 'maimai', songId: '352', chartType: 'SD', levelIndex: 3 }))).toEqual({
      pathname: '/songs/[songId]',
      params: { songId: '352', chartType: 'SD', levelIndex: '3', gameId: 'maimai' },
    });
    expect(detailTargetHref(encodeDetailTarget({ game: 'osu-standard', beatmapsetId: '3720', beatmapId: 22423, scoreId: 9 }))).toEqual({
      pathname: '/songs/[songId]',
      params: { songId: '3720', beatmapId: '22423', scoreId: '9', gameId: 'osu-standard' },
    });
    expect(detailTargetHref({ songId: 'uuid-1', levelIndex: 5, params: { gameId: 'majdata-net' } })).toEqual({
      pathname: '/songs/[songId]',
      params: { songId: 'uuid-1', levelIndex: '5', gameId: 'majdata-net' },
    });
    expect(detailTargetHref(encodeDetailTarget({ game: 'maimai', songId: '1740' }))).toEqual({
      pathname: '/songs/[songId]',
      params: { songId: '1740', gameId: 'maimai' },
    });
  });
});
