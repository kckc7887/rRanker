import type { GameId } from '@/domain/game-bind-options';
import { isOsuGameId, type OsuGameId } from '@/domain/game-mode-family';
import type { ChartType } from '@/domain/models';

export type DetailTargetRoute = {
  songId: string;
  chartType?: string;
  levelIndex?: number;
  beatmapId?: number;
  params: Readonly<Record<string, string>> & { gameId: GameId };
};

export type DetailTargetParams = {
  songId?: string | string[];
  chartType?: string | string[];
  levelIndex?: string | string[];
  beatmapId?: string | string[];
  scoreId?: string | string[];
  gameId?: string | string[];
};

export type MaimaiDetailTarget = {
  game: 'maimai';
  songId: string;
  chartType?: ChartType;
  levelIndex?: number;
};

export type ChartIndexDetailTarget = {
  game: 'phigros' | 'chunithm' | 'majdata-net' | 'rizline' | 'musedash';
  songId: string;
  levelIndex?: number;
};

export type PhiraDetailTarget = { game: 'phira'; chartId: string };
export type TufDetailTarget = { game: 'adofai'; levelId: string };
export type OsuDetailTarget = {
  game: OsuGameId;
  beatmapsetId: string;
  beatmapId?: number;
  scoreId?: number;
};

export type DetailTarget =
  | MaimaiDetailTarget
  | ChartIndexDetailTarget
  | PhiraDetailTarget
  | TufDetailTarget
  | OsuDetailTarget;

export type DetailTargetErrorCode =
  | 'unsupported_game'
  | 'missing_parameter'
  | 'invalid_parameter';

export type DetailTargetError = {
  ok: false;
  code: DetailTargetErrorCode;
  game: GameId | undefined;
  parameter: string;
  message: string;
};

export type DetailTargetResolution = { ok: true; target: DetailTarget } | DetailTargetError;

const CHART_TYPES: readonly ChartType[] = ['SD', 'DX', 'UTAGE'];

const INDEX_GAMES: readonly GameId[] = ['phigros', 'chunithm', 'majdata-net', 'rizline', 'musedash'];

export function encodeDetailTarget(target: DetailTarget): DetailTargetRoute {
  const params = { gameId: target.game };
  switch (target.game) {
    case 'phira':
      return { songId: target.chartId, params };
    case 'adofai':
      return { songId: target.levelId, params };
    case 'osu-standard':
    case 'osu-mania':
    case 'osu-catch':
    case 'osu-taiko':
      return {
        songId: target.beatmapsetId,
        ...(target.beatmapId === undefined ? {} : { beatmapId: target.beatmapId }),
        params: { ...params, ...(target.scoreId === undefined ? {} : { scoreId: String(target.scoreId) }) },
      };
    case 'maimai':
      return {
        songId: target.songId,
        params,
        ...(target.chartType === undefined ? {} : { chartType: target.chartType }),
        ...(target.levelIndex === undefined ? {} : { levelIndex: target.levelIndex }),
      };
    default:
      return {
        songId: target.songId,
        params,
        ...(target.levelIndex === undefined ? {} : { levelIndex: target.levelIndex }),
      };
  }
}

export function detailTargetHref(route: DetailTargetRoute): {
  pathname: '/songs/[songId]';
  params: Record<string, string> & { songId: string };
} {
  return {
    pathname: '/songs/[songId]',
    params: {
      songId: route.songId,
      ...(route.chartType ? { chartType: route.chartType } : {}),
      ...(route.levelIndex === undefined ? {} : { levelIndex: String(route.levelIndex) }),
      ...(route.beatmapId === undefined ? {} : { beatmapId: String(route.beatmapId) }),
      ...route.params,
    },
  };
}

type TextSlot = { ok: true; value?: string } | DetailTargetError;
type IndexSlot = { ok: true; value?: number } | DetailTargetError;

type SlotReaders = {
  fail: (code: DetailTargetErrorCode, parameter: string, message: string) => DetailTargetError;
  raw: (params: DetailTargetParams, name: keyof DetailTargetParams) => TextSlot;
};

function createSlotReaders(gameId: GameId | undefined): SlotReaders {
  return {
    fail: (code, parameter, message) => ({ ok: false, code, game: gameId, parameter, message }),
    raw: (params, name) => {
      const value = params[name];
      if (value === undefined || value === null) return { ok: true };
      if (Array.isArray(value)) {
        return value.length === 1
          ? { ok: true, value: value[0] }
          : { ok: false, game: gameId, code: 'invalid_parameter', parameter: name, message: `参数 ${name} 重复出现，无法定位唯一谱面` };
      }
      return { ok: true, value };
    },
  };
}

function readText(
  params: DetailTargetParams,
  name: keyof DetailTargetParams,
  readers: SlotReaders,
): TextSlot {
  const slot = readers.raw(params, name);
  if (!slot.ok) return slot;
  const value = slot.value?.trim();
  return { ok: true, value: value ? value : undefined };
}

function readIndex(
  params: DetailTargetParams,
  name: keyof DetailTargetParams,
  readers: SlotReaders,
): IndexSlot {
  const slot = readText(params, name, readers);
  if (!slot.ok) return slot;
  if (slot.value === undefined) return { ok: true };
  if (!/^\d+$/u.test(slot.value)) {
    return readers.fail('invalid_parameter', name, `参数 ${name} 必须是非负整数字符串`);
  }
  const value = Number(slot.value);
  if (!Number.isSafeInteger(value)) {
    return readers.fail('invalid_parameter', name, `参数 ${name} 超出可安全表示的范围`);
  }
  return { ok: true, value };
}

function firstUnexpectedParameter(
  params: DetailTargetParams,
  allowed: readonly (keyof DetailTargetParams)[],
): keyof DetailTargetParams | undefined {
  return (Object.keys(params) as (keyof DetailTargetParams)[])
    .find((name) => params[name] !== undefined && params[name] !== null && !allowed.includes(name));
}

function decodeOsuTarget(
  game: OsuGameId,
  beatmapsetId: string,
  params: DetailTargetParams,
  readers: SlotReaders,
): DetailTargetResolution {
  const beatmapId = readIndex(params, 'beatmapId', readers);
  if (!beatmapId.ok) return beatmapId;
  const scoreId = readIndex(params, 'scoreId', readers);
  if (!scoreId.ok) return scoreId;
  return {
    ok: true,
    target: {
      game,
      beatmapsetId,
      ...(beatmapId.value === undefined ? {} : { beatmapId: beatmapId.value }),
      ...(scoreId.value === undefined ? {} : { scoreId: scoreId.value }),
    },
  };
}

function decodeMaimaiTarget(
  songId: string,
  params: DetailTargetParams,
  readers: SlotReaders,
): DetailTargetResolution {
  const chartType = readText(params, 'chartType', readers);
  if (!chartType.ok) return chartType;
  if (chartType.value !== undefined && !CHART_TYPES.includes(chartType.value as ChartType)) {
    return readers.fail('invalid_parameter', 'chartType', `参数 chartType 只能是 ${CHART_TYPES.join(' / ')}`);
  }
  const levelIndex = readIndex(params, 'levelIndex', readers);
  if (!levelIndex.ok) return levelIndex;
  return {
    ok: true,
    target: {
      game: 'maimai',
      songId,
      ...(chartType.value === undefined ? {} : { chartType: chartType.value as ChartType }),
      ...(levelIndex.value === undefined ? {} : { levelIndex: levelIndex.value }),
    },
  };
}

function decodeChartIndexTarget(
  game: ChartIndexDetailTarget['game'],
  songId: string,
  params: DetailTargetParams,
  readers: SlotReaders,
): DetailTargetResolution {
  const levelIndex = readIndex(params, 'levelIndex', readers);
  if (!levelIndex.ok) return levelIndex;
  return {
    ok: true,
    target: {
      game,
      songId,
      ...(levelIndex.value === undefined ? {} : { levelIndex: levelIndex.value }),
    },
  };
}

export function decodeDetailTarget(params: DetailTargetParams): DetailTargetResolution {
  const initial = createSlotReaders(undefined);
  const gameParameter = readText(params, 'gameId', initial);
  if (!gameParameter.ok) return gameParameter;
  if (!gameParameter.value) return initial.fail('missing_parameter', 'gameId', 'URL 缺少定位详情所需的 gameId');
  const game = gameParameter.value as GameId;
  const readers = createSlotReaders(game);
  const allowed: readonly (keyof DetailTargetParams)[] | undefined = game === 'maimai'
    ? ['songId', 'gameId', 'chartType', 'levelIndex']
    : isOsuGameId(game)
      ? ['songId', 'gameId', 'beatmapId', 'scoreId']
      : INDEX_GAMES.includes(game)
        ? ['songId', 'gameId', 'levelIndex']
        : game === 'phira' || game === 'adofai' ? ['songId', 'gameId'] : undefined;
  if (!allowed) return readers.fail('unsupported_game', 'gameId', `${game} 还没有详情页`);
  const unexpected = firstUnexpectedParameter(params, allowed);
  if (unexpected) {
    return readers.fail('invalid_parameter', unexpected, `参数 ${unexpected} 不属于 ${game} 的详情定位参数`);
  }

  const songId = readText(params, 'songId', readers);
  if (!songId.ok) return songId;
  if (songId.value === undefined) {
    return readers.fail('missing_parameter', 'songId', 'URL 缺少定位详情所需的 songId');
  }

  if (game === 'phira') return { ok: true, target: { game: 'phira', chartId: songId.value } };
  if (game === 'adofai') return { ok: true, target: { game: 'adofai', levelId: songId.value } };
  if (isOsuGameId(game)) return decodeOsuTarget(game, songId.value, params, readers);
  if (game === 'maimai') return decodeMaimaiTarget(songId.value, params, readers);
  return decodeChartIndexTarget(game as ChartIndexDetailTarget['game'], songId.value, params, readers);
}
