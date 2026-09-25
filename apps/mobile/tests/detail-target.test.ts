import { describe, expect, it } from 'vitest';
import type { GameId } from '@/domain/game-bind-options';
import {
  decodeDetailTarget,
  detailTargetHref,
  encodeDetailTarget,
  type DetailTarget,
  type DetailTargetErrorCode,
} from '@/domain/detail-target';

function roundTrip(target: DetailTarget): DetailTarget {
  const resolution = decodeDetailTarget(target.game, detailTargetHref(encodeDetailTarget(target)).params);
  expect(resolution.ok).toBe(true);
  return (resolution as { ok: true; target: DetailTarget }).target;
}

function errorOf(gameId: GameId | undefined, params: Parameters<typeof decodeDetailTarget>[1]) {
  const resolution = decodeDetailTarget(gameId, params);
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
    expect(Object.keys(osu)).not.toContain('levelIndex');

    const encoded = detailTargetHref(encodeDetailTarget({
      game: 'osu-standard', beatmapsetId: '3720', beatmapId: 22423,
    })).params;
    expect(encoded).toEqual({ songId: '3720', beatmapId: '22423' });
    expect(encoded).not.toHaveProperty('levelIndex');

    // 既有 osu 成绩卡仍把 beatmap id 写在 levelIndex 槽位，解码后同样只产出 beatmapId。
    const legacy = decodeDetailTarget('osu-standard', { songId: '3720', levelIndex: '22423' });
    expect(legacy).toEqual({
      ok: true,
      target: { game: 'osu-standard', beatmapsetId: '3720', beatmapId: 22423 },
    });

    // 同一个 levelIndex 槽位在其它游戏解成难度索引，而不是 beatmap id。
    expect(decodeDetailTarget('phigros', { songId: '3720', levelIndex: '22423' })).toEqual({
      ok: true,
      target: { game: 'phigros', songId: '3720', levelIndex: 22423 },
    });
  });

  it('错误的游戏字段组合返回可判别的错误', () => {
    expect(errorOf('osu-standard', { songId: '3720', beatmapId: '1', levelIndex: '2' }))
      .toMatchObject({ code: 'conflicting_parameter', parameter: 'levelIndex' });
    expect(errorOf('phigros', { songId: 'Song.A', beatmapId: '22423' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'beatmapId' });
    expect(errorOf('phigros', { songId: 'Song.A', chartType: 'DX' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'chartType' });
    expect(errorOf('phigros', { songId: 'Song.A', scoreId: '9' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'scoreId' });
    expect(errorOf('maimai', { songId: '1', gameId: 'phigros' }))
      .toMatchObject({ code: 'invalid_parameter', parameter: 'gameId' });
    expect(errorOf('test', { songId: '1' })).toMatchObject({ code: 'unsupported_game' });
  });

  it('缺失或非法参数返回可判别的错误', () => {
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
    expect(decodeDetailTarget('phigros', { songId: 'Song.A', levelIndex: '' }))
      .toEqual({ ok: true, target: { game: 'phigros', songId: 'Song.A' } });
  });

  it('共享卡片的 href 保持既有 URL 形状', () => {
    expect(detailTargetHref({ songId: '352', chartType: 'SD', levelIndex: 3 })).toEqual({
      pathname: '/songs/[songId]',
      params: { songId: '352', chartType: 'SD', levelIndex: '3' },
    });
    expect(detailTargetHref({ songId: '3720', levelIndex: 22423, params: { scoreId: '9' } })).toEqual({
      pathname: '/songs/[songId]',
      params: { songId: '3720', levelIndex: '22423', scoreId: '9' },
    });
    expect(detailTargetHref({ songId: 'uuid-1', levelIndex: 5, params: { gameId: 'majdata-net' } })).toEqual({
      pathname: '/songs/[songId]',
      params: { songId: 'uuid-1', levelIndex: '5', gameId: 'majdata-net' },
    });
    expect(detailTargetHref({ songId: '1740' })).toEqual({
      pathname: '/songs/[songId]',
      params: { songId: '1740' },
    });
  });
});
