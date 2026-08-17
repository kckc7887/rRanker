import type { GameId } from './game-bind-options';

/** osu! 家族的四模式游戏 id（后台各注册为独立游戏，前台聚合为一个板块）。 */
export type OsuGameId = 'osu-standard' | 'osu-mania' | 'osu-catch' | 'osu-taiko';

export function isOsuGameId(gameId: GameId): gameId is OsuGameId {
  return gameId === 'osu-standard'
    || gameId === 'osu-mania'
    || gameId === 'osu-catch'
    || gameId === 'osu-taiko';
}

/**
 * 多模式游戏家族：同一游戏分多个模式，后台注册为多个游戏、共享同一个
 * OAuth 账号凭据；前台聚合为一个板块（osu/malody 类游戏通用语义）。
 */
export type GameModeFamily = {
  id: string;
  title: string;
  modeGameIds: readonly GameId[];
};

export const OSU_FAMILY: GameModeFamily = {
  id: 'osu',
  title: 'osu!',
  modeGameIds: ['osu-standard', 'osu-mania', 'osu-catch', 'osu-taiko'],
};

export const GAME_MODE_FAMILIES: readonly GameModeFamily[] = [OSU_FAMILY];

export function familyForId(familyId: string): GameModeFamily | null {
  return GAME_MODE_FAMILIES.find((family) => family.id === familyId) ?? null;
}

export function familyForGameId(gameId: GameId): GameModeFamily | null {
  return GAME_MODE_FAMILIES.find((family) => family.modeGameIds.includes(gameId)) ?? null;
}

/** 某凭据（credentialId）已绑定的家族模式集合（按绑定账号列表推导）。 */
export function boundModesOfCredential(
  accounts: readonly { id: string; gameId: GameId }[],
  credentialIdsByAccountId: Readonly<Record<string, string | undefined>>,
  credentialId: string,
): Set<GameId> {
  return new Set(
    accounts
      .filter((account) => credentialIdsByAccountId[account.id] === credentialId)
      .map((account) => account.gameId),
  );
}
