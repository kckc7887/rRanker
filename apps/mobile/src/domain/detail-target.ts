import type { GameId } from '@/domain/game-bind-options';
import { isOsuGameId, type OsuGameId } from '@/domain/game-mode-family';
import type { ChartType } from '@/domain/models';

/**
 * 详情定位目标：`/songs/[songId]` 的唯一语义来源。
 *
 * 判别联合按游戏区分字段名：难度索引用 `levelIndex`，osu! 的谱面 ID 用 `beatmapId`
 * （同一个 URL 槽位在 osu! 分支承载 beatmap id，只有本模块负责这层换算），
 * Phira 用谱面 ID、TUF 用关卡 ID。页面与共享组件只消费已校验的 target，
 * 不再各自解释路由参数。
 */

/** 共享卡片/列表 presentation 携带的详情路由：`DetailTarget` 的编码形态。 */
export type DetailTargetRoute = {
  songId: string;
  chartType?: string;
  levelIndex?: number;
  /** osu! 谱面 ID 的规范槽位。 */
  beatmapId?: number;
  /** 游戏侧可选参数（如 `scoreId`、`gameId`）；共享卡片只透传。 */
  params?: Readonly<Record<string, string>>;
};

/** `/songs/[songId]` 的 URL 参数槽位。 */
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
  /** 难度索引；舞萌由 chartType + levelIndex 共同定位谱面。 */
  levelIndex?: number;
};

export type ChartIndexDetailTarget = {
  game: 'phigros' | 'chunithm' | 'majdata-net' | 'rizline' | 'musedash';
  songId: string;
  /** 该游戏详情页使用的难度索引。 */
  levelIndex?: number;
};

export type PhiraDetailTarget = { game: 'phira'; chartId: string };
export type TufDetailTarget = { game: 'adofai'; levelId: string };
export type OsuDetailTarget = {
  game: OsuGameId;
  beatmapsetId: string;
  /** 谱面（难度）ID，不是难度索引。 */
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
  | 'invalid_parameter'
  | 'conflicting_parameter';

export type DetailTargetError = {
  ok: false;
  code: DetailTargetErrorCode;
  game: GameId | undefined;
  parameter: string;
  /** 面向开发与日志的说明，不作为用户文案。 */
  message: string;
};

export type DetailTargetResolution = { ok: true; target: DetailTarget } | DetailTargetError;

const CHART_TYPES: readonly ChartType[] = ['SD', 'DX', 'UTAGE'];

const INDEX_GAMES: readonly GameId[] = ['phigros', 'chunithm', 'majdata-net', 'rizline', 'musedash'];

/** 每种游戏允许出现的 URL 槽位；其它游戏的槽位出现即为非法参数。 */
const ALLOWED_PARAMETERS: Readonly<Record<string, readonly (keyof DetailTargetParams)[]>> = {
  maimai: ['songId', 'chartType', 'levelIndex', 'gameId'],
  phigros: ['songId', 'levelIndex', 'gameId'],
  chunithm: ['songId', 'levelIndex', 'gameId'],
  'majdata-net': ['songId', 'levelIndex', 'gameId'],
  rizline: ['songId', 'levelIndex', 'gameId'],
  musedash: ['songId', 'levelIndex', 'gameId'],
  phira: ['songId', 'gameId'],
  adofai: ['songId', 'gameId'],
  'osu-standard': ['songId', 'levelIndex', 'beatmapId', 'scoreId', 'gameId'],
  'osu-mania': ['songId', 'levelIndex', 'beatmapId', 'scoreId', 'gameId'],
  'osu-catch': ['songId', 'levelIndex', 'beatmapId', 'scoreId', 'gameId'],
  'osu-taiko': ['songId', 'levelIndex', 'beatmapId', 'scoreId', 'gameId'],
};

/** 目标 → 共享详情路由。osu! 使用规范的 `beatmapId` 槽位。 */
export function encodeDetailTarget(target: DetailTarget): DetailTargetRoute {
  switch (target.game) {
    case 'phira':
      return { songId: target.chartId };
    case 'adofai':
      return { songId: target.levelId };
    case 'osu-standard':
    case 'osu-mania':
    case 'osu-catch':
    case 'osu-taiko':
      return {
        songId: target.beatmapsetId,
        ...(target.beatmapId === undefined ? {} : { beatmapId: target.beatmapId }),
        ...(target.scoreId === undefined ? {} : { params: { scoreId: String(target.scoreId) } }),
      };
    case 'maimai':
      return {
        songId: target.songId,
        ...(target.chartType === undefined ? {} : { chartType: target.chartType }),
        ...(target.levelIndex === undefined ? {} : { levelIndex: target.levelIndex }),
      };
    default:
      return {
        songId: target.songId,
        ...(target.levelIndex === undefined ? {} : { levelIndex: target.levelIndex }),
      };
  }
}

/** 共享详情路由 → `router.push` 的 href；所有游戏共用同一个 URL 文件。 */
export function detailTargetHref(route: DetailTargetRoute): {
  pathname: '/songs/[songId]';
  params: Record<string, string>;
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
  const levelIndex = readIndex(params, 'levelIndex', readers);
  if (!levelIndex.ok) return levelIndex;
  const beatmapId = readIndex(params, 'beatmapId', readers);
  if (!beatmapId.ok) return beatmapId;
  if (beatmapId.value !== undefined && levelIndex.value !== undefined && beatmapId.value !== levelIndex.value) {
    return readers.fail('conflicting_parameter', 'levelIndex', 'osu! 的 beatmapId 与 levelIndex 槽位给出了不同的谱面');
  }
  const scoreId = readIndex(params, 'scoreId', readers);
  if (!scoreId.ok) return scoreId;
  const resolvedBeatmapId = beatmapId.value ?? levelIndex.value;
  return {
    ok: true,
    target: {
      game,
      beatmapsetId,
      ...(resolvedBeatmapId === undefined ? {} : { beatmapId: resolvedBeatmapId }),
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

/** URL 参数 → 已校验 target；非法或缺失参数返回可判别的错误。 */
export function decodeDetailTarget(
  gameId: GameId | undefined,
  params: DetailTargetParams,
): DetailTargetResolution {
  const game = gameId ?? 'maimai';
  const readers = createSlotReaders(gameId);
  const allowed = ALLOWED_PARAMETERS[game];
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

  const gameParameter = readText(params, 'gameId', readers);
  if (!gameParameter.ok) return gameParameter;
  if (gameParameter.value !== undefined && gameParameter.value !== game) {
    return readers.fail('invalid_parameter', 'gameId', `参数 gameId=${gameParameter.value} 与当前游戏 ${game} 不一致`);
  }

  if (game === 'phira') return { ok: true, target: { game: 'phira', chartId: songId.value } };
  if (game === 'adofai') return { ok: true, target: { game: 'adofai', levelId: songId.value } };
  if (isOsuGameId(game)) return decodeOsuTarget(game, songId.value, params, readers);
  if (game === 'maimai') return decodeMaimaiTarget(songId.value, params, readers);
  if (!INDEX_GAMES.includes(game)) {
    return readers.fail('unsupported_game', 'gameId', `${game} 还没有详情页`);
  }
  return decodeChartIndexTarget(game as ChartIndexDetailTarget['game'], songId.value, params, readers);
}
