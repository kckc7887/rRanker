import type { BoundAccount } from './account';
import type { ChartPackageDownloadOptions } from './features/chart-download-shared/chart-download-shared';
import type { ComponentType } from 'react';
import type { DetailParams } from './navigation';
import type { AccountSummary, GameDataBundle } from './data';
import type { GameDataLoaderContext, GameDataLoadResult, GameDataStatus, GameDataRefreshResult, SourceSyncContext, SyncFailureNotice } from './data-load';
import type { LibraryTarget } from './library';
import type { Credential, SourceClientContext } from './credentials';
import type { CacheResource, GameStorageDefinition } from '@rranker/sdk/features/storage-management/storage-adapter-core';

export type PluginId = string;
export type GameId = string;
export type ProviderId = string;
export type PluginIcon = number | { uri: string };

export type RatingTheme = {
  id: string;
  label: string;
  fillColors: readonly [string, string, ...string[]];
  fillLocations: readonly [number, number, ...number[]];
  borderColors: readonly [string, string, ...string[]];
  borderLocations: readonly [number, number, ...number[]];
  overlayColor: string;
  textColor: string;
  starColor: string;
  starCount: number;
};

export type BestSectionSpec = { id: string; title: string; size: number };
export type GameProfile<G extends GameId = GameId> = {
  id: G;
  title: string;
  ratingLabel: string;
  ratingDigits: number;
  bestSections: readonly BestSectionSpec[];
};

export type GameDefinition = {
  id: GameId;
  title: string;
  icon: PluginIcon;
  profile: Omit<GameProfile, 'id' | 'title'>;
  accountOrder?: number;
  accountScoreTheme?: RatingTheme;
  familyId?: string;
  hiddenInPicker?: boolean;
  familyIcon?: PluginIcon;
  fixture?: boolean;
};

export type GameModeFamily = { id: string; title: string; modeGameIds: readonly GameId[] };
export type GamePage = 'overview' | 'best' | 'records' | 'catalog' | 'library' | 'detail';
export type GameAdapter = {
  kind: 'game';
  id: PluginId;
  title: string;
  games: readonly GameDefinition[];
  families?: readonly GameModeFamily[];
  capabilities?: readonly string[];
  storage?: (gameId: GameId) => GameStorageDefinition;
  summarizeData?: (bundle: GameDataBundle) => AccountSummary | null;
  loadData?: (context: GameDataLoaderContext) => Promise<GameDataLoadResult>;
  getDataStatus?: (bundle: GameDataBundle) => GameDataStatus;
  refreshResources?: (context: Pick<SourceSyncContext, 'queryClient' | 'signal'>) => Promise<{ catalogFailed?: boolean }>;
  pages?: Partial<Record<GamePage, ComponentType<PluginPageProps>>>;
  accountRating?: ComponentType<{ account: BoundAccount }>;
  scoreCardPreview?: ComponentType;
  parseDetailParams(gameId: GameId, params: DetailParams): DetailParams | null;
  parseLibraryTarget(value: LibraryTarget): LibraryTarget | null;
};

export type ProviderBindingKind = 'credentials' | 'sms-code' | 'oauth-code' | 'local' | 'fixture' | 'device-code' | 'public-player';
export type SourceLoginProps = {
  visible: boolean; gameId: GameId; gameTitle: string;
  onSuccess: () => void; onBusyChange: (busy: boolean) => void;
};
export type AccountCleanupAttempt = (label: string, action: () => Promise<unknown>) => Promise<void>;
export type AccountRemovalPlan = { submit: AccountCleanupAttempt; cleanup: AccountCleanupAttempt };
export type DataSourcePlugin = {
  kind: 'provider';
  id: PluginId;
  title: string;
  providerId: ProviderId;
  gameIds: readonly GameId[];
  detail: string;
  icon: PluginIcon;
  bindingKind: ProviderBindingKind;
  hiddenInPicker?: boolean;
  restoreAccounts?: (gameId: GameId, accounts: readonly Pick<BoundAccount, 'id' | 'gameId' | 'providerId'>[]) => Promise<BoundAccount[]>;
  createAccount?: (gameId: GameId, accounts: readonly BoundAccount[], assertCurrent?: () => void) => Promise<BoundAccount>;
  removeAccount?: (account: BoundAccount, plan: AccountRemovalPlan) => Promise<void>;
  cleanupAccount?: (account: BoundAccount, cleanup: AccountCleanupAttempt) => Promise<void>;
  cleanupCredential?: (accountId: string, cleanup: AccountCleanupAttempt) => Promise<void>;
  accountNameMaxLength?: number;
  renameAccount?: (account: BoundAccount, displayName: string) => Promise<void>;
  bindingSheet?: ComponentType<SourceLoginProps & { onClose: () => void }>;
  hydrateAccount?: (context: SourceSyncContext) => Promise<AccountSummary | undefined>;
  sync?: (context: SourceSyncContext) => Promise<void>;
  syncFailureNotice?: (gameId: GameId, result: GameDataRefreshResult) => SyncFailureNotice | undefined;
  parseCredential?: (value: unknown) => Credential | null;
  credentialMatches?: (current: Credential, expected: Credential) => boolean;
  createClient?: (context: SourceClientContext) => unknown;
  onCredentialsReleased?: () => void;
  createResources?: (gameId: GameId) => unknown;
  resourcePriority?: number;
  loginPanel?: ComponentType<SourceLoginProps>;
  oauthCallback?: ComponentType;
};

export type PluginPageProps = { gameId?: GameId; accountId?: string; params: DetailParams };
export type PluginOverviewProps = { bundle: GameDataBundle };
export type PluginDetailProps = { target: LibraryTarget; title?: string };
export type ToolDefinition = {
  id: string;
  gameId: GameId;
  pageId: string;
  title: string;
  detail: string;
  summaryLabel: string;
  order: number;
};
export type OverviewActionsProps = PluginOverviewProps & {
  syncBusy: boolean;
  onSync(): Promise<boolean>;
  operation: { begin(): boolean; finish(): void };
  registerRefresh(action: () => void): () => void;
};
export type ChartDownload = (params: DetailParams, options: ChartPackageDownloadOptions & { includeVideo: boolean }) => Promise<boolean>;

export type ToolPlugin = {
  kind: 'tool';
  requiredCapabilities?: Readonly<Record<GameId, readonly string[]>>;
  chartDownloads?: Readonly<Record<GameId, ChartDownload>>;
  id: PluginId;
  title: string;
  gameIds: readonly GameId[];
  tools: readonly ToolDefinition[];
  pages: Readonly<Record<string, ComponentType<PluginPageProps>>>;
  overviewActions?: ComponentType<OverviewActionsProps>;
  overviewCards?: ComponentType<PluginOverviewProps>;
  detailActions?: ComponentType<PluginDetailProps>;
  cache?: (gameId: GameId) => readonly CacheResource[];
};

export type Plugin = GameAdapter | DataSourcePlugin | ToolPlugin;
