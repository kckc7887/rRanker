import type { GameId } from './game-bind-options';
import { getGameToolbox } from './game-toolbox';

/** BestN 分区定义：舞萌是 B35+B15；其他音游通常是一组 BestN。 */
export type BestSectionSpec = {
  id: string;
  title: string;
  size: number;
};

export type GameCapabilities = {
  /** 是否有已注册的游戏工具箱；总览据此决定是否展示工具箱入口。 */
  hasTools: boolean;
};

/**
 * 游戏展示口径。导航上的最佳/成绩/查找是音游共性；差异在各游戏的 payload 与筛选维度。
 */
export type GameProfile = {
  id: GameId;
  title: string;
  ratingLabel: string;
  ratingDigits: number;
  bestSections: BestSectionSpec[];
  capabilities: GameCapabilities;
};

const capabilitiesFor = (id: GameId): GameCapabilities => ({
  hasTools: getGameToolbox(id).tools.length > 0,
});

export const GAME_PROFILES: Record<GameId, GameProfile> = {
  rizline: { id: 'rizline', title: 'Rizline', ratingLabel: 'Ranking Score', ratingDigits: 4,
    bestSections: [{ id: 'ah5', title: 'AH5（推定）', size: 5 }, { id: 'b35', title: 'Best35（推定）', size: 35 }],
    capabilities: capabilitiesFor('rizline') },
  'majdata-net': { id: 'majdata-net', title: 'Majdata Net', ratingLabel: 'DX · Classic', ratingDigits: 4,
    bestSections: [{ id: 'recent', title: 'Recent', size: 0 }], capabilities: capabilitiesFor('majdata-net') },
  maimai: {
    id: 'maimai',
    title: '舞萌 DX',
    ratingLabel: 'DX RATING',
    ratingDigits: 5,
    bestSections: [
      { id: 'b35', title: '过往版本 Best35', size: 35 },
      { id: 'b15', title: '当前版本 Best15', size: 15 },
    ],
    capabilities: capabilitiesFor('maimai'),
  },
  chunithm: {
    id: 'chunithm',
    title: '中二节奏',
    ratingLabel: 'RATING',
    ratingDigits: 0,
    bestSections: [],
    capabilities: capabilitiesFor('chunithm'),
  },
  test: {
    id: 'test',
    title: '测试游戏',
    ratingLabel: 'Rating',
    ratingDigits: 0,
    bestSections: [{ id: 'best', title: 'Best', size: 0 }],
    capabilities: capabilitiesFor('test'),
  },
  phigros: {
    id: 'phigros',
    title: 'Phigros',
    ratingLabel: 'RKS',
    ratingDigits: 4,
    bestSections: [
      { id: 'phi3', title: 'Phi3', size: 3 },
      { id: 'b27', title: 'Best27', size: 27 },
    ],
    capabilities: capabilitiesFor('phigros'),
  },
  phira: {
    id: 'phira',
    title: 'Phira',
    ratingLabel: 'Ranking Score',
    ratingDigits: 2,
    bestSections: [{ id: 'best20', title: 'Best20', size: 20 }],
    capabilities: capabilitiesFor('phira'),
  },
  adofai: {
    id: 'adofai',
    title: '冰与火之舞',
    ratingLabel: 'RANKED SCORE',
    ratingDigits: 0,
    bestSections: [{ id: 'top20', title: 'Top 20 Impact', size: 20 }],
    capabilities: capabilitiesFor('adofai'),
  },
  musedash: {
    id: 'musedash',
    title: '喵斯快跑',
    ratingLabel: 'Rating',
    ratingDigits: 0,
    bestSections: [{ id: 'best30', title: 'Best 30', size: 30 }],
    capabilities: capabilitiesFor('musedash'),
  },
  'osu-standard': {
    id: 'osu-standard',
    title: 'osu!standard',
    ratingLabel: 'PP',
    ratingDigits: 0,
    bestSections: [{ id: 'top100', title: 'Top 100', size: 100 }],
    capabilities: capabilitiesFor('osu-standard'),
  },
  'osu-mania': {
    id: 'osu-mania',
    title: 'osu!mania',
    ratingLabel: 'PP',
    ratingDigits: 0,
    bestSections: [{ id: 'top100', title: 'Top 100', size: 100 }],
    capabilities: capabilitiesFor('osu-mania'),
  },
  'osu-catch': {
    id: 'osu-catch',
    title: 'osu!catch',
    ratingLabel: 'PP',
    ratingDigits: 0,
    bestSections: [{ id: 'top100', title: 'Top 100', size: 100 }],
    capabilities: capabilitiesFor('osu-catch'),
  },
  'osu-taiko': {
    id: 'osu-taiko',
    title: 'osu!taiko',
    ratingLabel: 'PP',
    ratingDigits: 0,
    bestSections: [{ id: 'top100', title: 'Top 100', size: 100 }],
    capabilities: capabilitiesFor('osu-taiko'),
  },
};

export function getGameProfile(id: GameId): GameProfile {
  return GAME_PROFILES[id];
}
