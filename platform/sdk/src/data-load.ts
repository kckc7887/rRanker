import type { QueryClient } from '@tanstack/react-query';
import type { BoundAccount } from './account';
import type { GameDataBundle } from './data';
import type { GameId, GameProfile, ProviderId } from './plugins';
import type { RefreshFailure, RefreshResult } from './domain/refresh-result';
import type { Credential } from './credentials';

export type GameDataRefreshTarget = 'data' | 'catalog' | 'player' | 'scores' | 'bests';
export type GameDataRefreshResult = RefreshResult<GameDataBundle, GameDataRefreshTarget>;
export type GameDataStatus = { isStale: boolean; failure?: RefreshFailure<GameDataRefreshTarget> };
export type SourceSyncContext = {
  account: BoundAccount;
  credential: Credential | null;
  client: unknown;
  queryClient: QueryClient;
  signal: AbortSignal;
  assertCurrent: () => void;
};
export type SyncFailureNotice = { title: string; message: string; variant: 'warning' | 'error' };
export type GameDataLoadResult = { bundle: GameDataBundle; background?: Promise<GameDataRefreshResult> };
export type GameDataLoaderContext<Client = unknown, Session = unknown> = {
  activeGameId: GameId;
  activeProviderId: ProviderId | null;
  activeAccountId: string;
  activeAccount: BoundAccount | undefined;
  session: Session;
  client: Client;
  queryClient: QueryClient;
  profile: GameProfile;
  queryKey: readonly unknown[];
  hasSessionData: boolean;
  signal: AbortSignal;
  assertCurrent: () => void;
  publish: (bundle: GameDataBundle) => void | Promise<void>;
  readEntityValue: <T>(entityKey: readonly unknown[]) => T | undefined;
  publishEntityValue: <T>(entityKey: readonly unknown[], value: T) => void;
  invalidateEntityValue: (entityKey: readonly unknown[]) => void;
};
