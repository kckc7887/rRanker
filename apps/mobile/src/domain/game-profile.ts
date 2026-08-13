import type { GameId } from './game-bind-options';
import { getGameToolbox } from './game-toolbox';

/** BestN 分区定义：舞萌是 B35+B15；其他音游通常是一组 BestN。 */
export type BestSectionSpec = {
  id: string;
  title: string;
  size: number;
};

export type GameCapabilities = {
  hasCatalog: boolean;
  hasRecords: boolean;
  hasBestList: boolean;
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

const commonNav = {
  hasCatalog: true,
  hasRecords: true,
  hasBestList: true,
};

export const GAME_PROFILES: Record<GameId, GameProfile> = {
  maimai: {
    id: 'maimai',
    title: '舞萌 DX',
    ratingLabel: 'DX RATING',
    ratingDigits: 5,
    bestSections: [
      { id: 'b35', title: '过往版本 Best35', size: 35 },
      { id: 'b15', title: '当前版本 Best15', size: 15 },
    ],
    capabilities: { ...commonNav, hasTools: getGameToolbox('maimai').tools.length > 0 },
  },
  chunithm: {
    id: 'chunithm',
    title: '中二节奏',
    ratingLabel: 'RATING',
    ratingDigits: 0,
    bestSections: [],
    capabilities: { ...commonNav, hasTools: getGameToolbox('chunithm').tools.length > 0 },
  },
  test: {
    id: 'test',
    title: '测试游戏',
    ratingLabel: 'Rating',
    ratingDigits: 0,
    bestSections: [{ id: 'best', title: 'Best', size: 0 }],
    capabilities: { ...commonNav, hasTools: getGameToolbox('test').tools.length > 0 },
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
    capabilities: { ...commonNav, hasTools: getGameToolbox('phigros').tools.length > 0 },
  },
  phira: {
    id: 'phira',
    title: 'Phira',
    ratingLabel: 'Ranking Score',
    ratingDigits: 2,
    bestSections: [{ id: 'best20', title: 'Best20', size: 20 }],
    capabilities: { ...commonNav, hasTools: getGameToolbox('phira').tools.length > 0 },
  },
  adofai: {
    id: 'adofai',
    title: '冰与火之舞',
    ratingLabel: 'RANKED SCORE',
    ratingDigits: 0,
    bestSections: [{ id: 'top20', title: 'Top 20 Impact', size: 20 }],
    capabilities: { ...commonNav, hasTools: getGameToolbox('adofai').tools.length > 0 },
  },
  musedash: {
    id: 'musedash',
    title: '喵斯快跑',
    ratingLabel: 'Rating',
    ratingDigits: 0,
    bestSections: [{ id: 'best30', title: 'Best 30', size: 30 }],
    capabilities: { ...commonNav, hasTools: getGameToolbox('musedash').tools.length > 0 },
  },
};

export function getGameProfile(id: GameId): GameProfile {
  return GAME_PROFILES[id];
}
