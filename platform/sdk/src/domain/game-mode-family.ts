import { getGameFamilies, getGameFamily, type GameId, type GameModeFamily } from '@rranker/sdk';

export type { GameModeFamily } from '@rranker/sdk';

export function familyForId(familyId: string): GameModeFamily | null {
  return getGameFamily(familyId) ?? null;
}

export function familyForGameId(gameId: GameId): GameModeFamily | null {
  return getGameFamilies().find(family => family.modeGameIds.includes(gameId)) ?? null;
}

export function boundModesOfCredential(
  accounts: readonly { id: string; gameId: GameId }[],
  credentialIdsByAccountId: Readonly<Record<string, string | undefined>>,
  credentialId: string,
): Set<GameId> {
  return new Set(accounts.filter(account => credentialIdsByAccountId[account.id] === credentialId)
    .map(account => account.gameId));
}
