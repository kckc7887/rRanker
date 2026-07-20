import type {
  AliasSnapshot, CatalogSnapshot, CollectionSnapshot, PlateSnapshot, Player, ScoreRecord,
} from '@/domain/models';

export type ProviderSession =
  | { mode: 'jwt'; value: string; persistable: true }
  | { mode: 'import-token'; value: string; persistable: true }
  | {
    mode: 'lxns-oauth';
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    persistable: true;
  }
  | { mode: 'phi-session'; sessionToken: string; playerId: string; persistable: true }
  | { mode: 'cookie-jar'; persistable: false };
export interface LoginCredentials { username: string; password: string }
export interface AuthProvider {
  loginWithPassword(credentials: LoginCredentials): Promise<ProviderSession>;
  useImportToken(token: string): ProviderSession;
}
export interface ScoreProvider {
  getPlayer(): Promise<Player>;
  getRecords(): Promise<ScoreRecord[]>;
}
export interface CatalogDrivenScoreProvider {
  getPlayer(): Promise<Player>;
  getRecordsFromCatalog(catalog: CatalogSnapshot): Promise<ScoreRecord[]>;
}
export type AnyScoreProvider = ScoreProvider | CatalogDrivenScoreProvider;

export function isCatalogDrivenScoreProvider(
  provider: AnyScoreProvider,
): provider is CatalogDrivenScoreProvider {
  return 'getRecordsFromCatalog' in provider;
}
export interface CatalogProvider {
  getCatalog(): Promise<CatalogSnapshot>;
}
export interface DetailedCatalogProvider extends CatalogProvider {
  getDetailedCatalog(): Promise<CatalogSnapshot>;
  getAliases(): Promise<AliasSnapshot>;
  getPlates(): Promise<PlateSnapshot>;
  getCollections(): Promise<CollectionSnapshot>;
}
