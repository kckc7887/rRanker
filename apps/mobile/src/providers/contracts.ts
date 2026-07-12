import type { CatalogSnapshot, Player, ScoreRecord } from '@/domain/models';

export type ProviderSession =
  | { mode: 'jwt'; value: string; persistable: true }
  | { mode: 'import-token'; value: string; persistable: true }
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
export interface CatalogProvider {
  getCatalog(): Promise<CatalogSnapshot>;
}
