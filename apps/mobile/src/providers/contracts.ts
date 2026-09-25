import type {
  AliasSnapshot, CatalogSnapshot, CollectionSnapshot, PlateSnapshot, Player, ScoreRecord, Song,
} from '@/domain/models';

export type RizlineSession = {
  mode: 'rizline';
  token: string;
  phone: string;
  deviceId: string;
  channelId: string;
  persistable: true;
};

export type ProviderSession =
  | RizlineSession
  | import('./http-cookies').HttpCookieSession
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
/**
 * 成绩 Provider 产出统一 `ScoreRecord`。
 *
 * `ScoreRecord` 的 `type`（SD/DX/UTAGE）、`dxScore`、`fc` 与 `fs` 是舞萌语义字段：
 * 非舞萌游戏在自己的领域层用真实字段建模（如 Phigros 的 `PhigrosScoreRecord`），
 * 只在共享成绩卡边界做一次显式投影，不得把舞萌字段当成本游戏的领域事实。
 */
export interface ScoreProvider {
  getPlayer(signal?: AbortSignal): Promise<Player>;
  getRecords(signal?: AbortSignal): Promise<ScoreRecord[]>;
}
/** 曲库驱动的查分器：各游戏保留自己的曲库模型（默认为统一 CatalogSnapshot），成绩统一产出 ScoreRecord[]。 */
export interface CatalogDrivenScoreProvider<TCatalog = CatalogSnapshot> {
  getPlayer(signal?: AbortSignal): Promise<Player>;
  getRecordsFromCatalog(catalog: TCatalog, signal?: AbortSignal): Promise<ScoreRecord[]>;
}
export type AnyScoreProvider = ScoreProvider | CatalogDrivenScoreProvider;

export function isCatalogDrivenScoreProvider<TCatalog = CatalogSnapshot>(
  provider: ScoreProvider | CatalogDrivenScoreProvider<TCatalog>,
): provider is CatalogDrivenScoreProvider<TCatalog> {
  return 'getRecordsFromCatalog' in provider;
}
export interface CatalogProvider {
  getCatalog(signal?: AbortSignal): Promise<CatalogSnapshot>;
}
/**
 * 舞萌系列曲库（落雪/水鱼/本地/示例）的详细能力：歌曲详情、别名、姓名框与收藏品。
 *
 * 这是舞萌曲库独有的能力集合；Phigros 等游戏只实现 `CatalogProvider`，
 * 不得为了让调用方少写一个分支就伪造这些空实现，也不得用断言把普通曲库当作详细曲库。
 * 会话曲库槽位只登记调用方真实需要的能力，按游戏的曲库入口留在各自游戏模块。
 */
export interface DetailedCatalogProvider extends CatalogProvider {
  getDetailedCatalog(signal?: AbortSignal): Promise<CatalogSnapshot>;
  getSong(songId: string, catalog?: CatalogSnapshot, signal?: AbortSignal): Promise<Song>;
  getAliases(signal?: AbortSignal): Promise<AliasSnapshot>;
  getPlates(signal?: AbortSignal): Promise<PlateSnapshot>;
  getCollections(): Promise<CollectionSnapshot>;
}
