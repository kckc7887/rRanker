import type { GameId } from './game-bind-options';

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

const commonNav: GameCapabilities = {
  hasCatalog: true,
  hasRecords: true,
  hasBestList: true,
  hasTools: true,
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
    capabilities: commonNav,
  },
  test: {
    id: 'test',
    title: '测试游戏',
    ratingLabel: 'Rating',
    ratingDigits: 0,
    bestSections: [{ id: 'best', title: 'Best', size: 0 }],
    capabilities: commonNav,
  },
  phigros: {
    id: 'phigros',
    title: 'Phigros',
    ratingLabel: 'RKS',
    ratingDigits: 0,
    bestSections: [{ id: 'best', title: 'Best', size: 0 }],
    capabilities: commonNav,
  },
};

export function getGameProfile(id: GameId): GameProfile {
  return GAME_PROFILES[id];
}
