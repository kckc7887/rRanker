import { OSU_MODE_GAME_IDS, type GameId, type OsuModeGameId } from './game-bind-options';

export type OsuGameId = OsuModeGameId;

export function isOsuGameId(gameId: GameId): gameId is OsuGameId {
  return (OSU_MODE_GAME_IDS as readonly GameId[]).includes(gameId);
}

/** osu! 四模式共享 OAuth 凭据，前台合并展示。 */
export type GameModeFamily = {
  id: string;
  title: string;
  modeGameIds: readonly GameId[];
};

export const OSU_FAMILY: GameModeFamily = {
  id: 'osu',
  title: 'osu!',
  modeGameIds: OSU_MODE_GAME_IDS,
};

export const GAME_MODE_FAMILIES: readonly GameModeFamily[] = [OSU_FAMILY];

export function familyForId(familyId: string): GameModeFamily | null {
  return GAME_MODE_FAMILIES.find((family) => family.id === familyId) ?? null;
}

export function familyForGameId(gameId: GameId): GameModeFamily | null {
  return GAME_MODE_FAMILIES.find((family) => family.modeGameIds.includes(gameId)) ?? null;
}

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
