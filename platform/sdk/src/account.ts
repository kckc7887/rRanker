import type { GameId, ProviderId } from './plugins';

export type AccountDisplayData = Readonly<Record<string, string | number | null>>;

export function isAccountDisplayData(value: unknown): value is AccountDisplayData {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every(item => item === null || typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)));
}

export function sameDisplayData(left: AccountDisplayData | undefined, right: AccountDisplayData | undefined): boolean {
  return left === right || (left !== undefined && right !== undefined
    && Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([key, value]) => right[key] === value));
}

export type BoundAccount = {
  id: string;
  credentialId?: string;
  gameId: GameId;
  providerId: ProviderId | null;
  displayName: string;
  scoreLabel: string;
  scoreDisplay: string;
  providerTitle: string;
  avatarUrl?: string | null;
  displayData?: AccountDisplayData;
};
