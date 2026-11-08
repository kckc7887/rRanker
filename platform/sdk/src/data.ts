import type { GameId, GameProfile, ProviderId } from './plugins';
import { getGameAdapter } from './registry';
import type { AccountDisplayData } from './account';

export type DataSource = { kind: string; label: string; updatedAt: string; isStale: boolean };
export type PlayerScoreSummary = { label: string; value: number; display: string };
export type EmptyGamePayload = { kind: 'empty'; gameId: GameId; displayName: string; source: DataSource };

/** 各适配器通过模块扩充声明自己的载荷。 */
export interface GamePayloads { empty: EmptyGamePayload }
export type GamePayload = GamePayloads[keyof GamePayloads];
export type GameDataBundle = { gameId: GameId; providerId: ProviderId | null; profile: GameProfile; payload: GamePayload };
export type AccountSummary = {
  scoreDisplay: string;
  displayName?: string;
  avatarUrl?: string | null;
  displayData?: AccountDisplayData;
  storedDisplayName?: string;
};

export function formatPlayerScore(value: number, digits: number): string {
  if (digits <= 0) return String(value);
  return value.toString().padStart(digits, '0');
}

export function emptyGamePayload(gameId: GameId, displayName: string): EmptyGamePayload {
  return { kind: 'empty', gameId, displayName,
    source: { kind: 'fixture', label: displayName, updatedAt: new Date().toISOString(), isStale: false } };
}

export function gameAccountMetadata(bundle: GameDataBundle): AccountSummary | null {
  return getGameAdapter(bundle.gameId)?.summarizeData?.(bundle) ?? null;
}

export type GameVersion = { id: number; title: string };
