import type {
  AliasSnapshot, CatalogSnapshot, CollectionSnapshot, PlateSnapshot, Player, ScoreRecord, Song,
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
  | {
    mode: 'osu-oauth';
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
/** 曲库驱动的查分器：各游戏保留自己的曲库模型（默认为统一 CatalogSnapshot），成绩统一产出 ScoreRecord[]。 */
export interface CatalogDrivenScoreProvider<TCatalog = CatalogSnapshot> {
  getPlayer(): Promise<Player>;
  getRecordsFromCatalog(catalog: TCatalog): Promise<ScoreRecord[]>;
}
export type AnyScoreProvider = ScoreProvider | CatalogDrivenScoreProvider;

export function isCatalogDrivenScoreProvider<TCatalog = CatalogSnapshot>(
  provider: ScoreProvider | CatalogDrivenScoreProvider<TCatalog>,
): provider is CatalogDrivenScoreProvider<TCatalog> {
  return 'getRecordsFromCatalog' in provider;
}
export interface CatalogProvider {
  getCatalog(): Promise<CatalogSnapshot>;
}
export interface DetailedCatalogProvider extends CatalogProvider {
  getDetailedCatalog(): Promise<CatalogSnapshot>;
  getSong(songId: string, catalog: CatalogSnapshot): Promise<Song>;
  getAliases(): Promise<AliasSnapshot>;
  getPlates(): Promise<PlateSnapshot>;
  getCollections(): Promise<CollectionSnapshot>;
}
