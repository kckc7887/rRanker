import type { DataSource } from '@/domain/models';
import type {
  TufDifficultiesSnapshot,
  TufLevelDetailSnapshot,
  TufLevelPageSnapshot,
  TufLevelQuery,
  TufPassPageSnapshot,
  TufPassQuery,
  TufPlayer,
  TufPlayerSnapshot,
} from '@/domain/tuf';
import {
  TUF_DIFFICULTIES_CACHE_KEY,
  TUF_DIFFICULTIES_SCHEMA_VERSION,
  TUF_LEVEL_PAGE_SCHEMA_VERSION,
  TUF_LEVEL_SCHEMA_VERSION,
  TUF_PASS_PAGE_SCHEMA_VERSION,
  TUF_PLAYER_SCHEMA_VERSION,
  tufLevelCacheKey,
  tufLevelPageCacheKey,
  tufPassPageCacheKey,
  tufPlayerCacheKey,
} from '@/domain/tuf';
import { tufProvider } from '@/providers/tuf-provider';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

/** 构造 TUF 缓存快照；source 的 updatedAt 记录本次拉取时间，供缓存命中时展示来源与过期标。 */
export function makeTufSnapshot<T>(data: T, updatedAt = new Date().toISOString()): { data: T; source: DataSource } {
  return {
    data,
    source: { kind: 'tuf', label: 'TUF 社区公开数据', updatedAt, isStale: false },
  };
}

/** 同一 TUF 玩家资料并发读取共享一次网络请求（总览与最佳页可能并发）。 */
const inflightPlayerLoads = new Map<number, Promise<TufPlayer>>();

export function loadTufPlayerFresh(playerId: number): Promise<TufPlayer> {
  const inflight = inflightPlayerLoads.get(playerId);
  if (inflight) return inflight;
  const fresh = tufProvider.getPlayerProfile(playerId);
  inflightPlayerLoads.set(playerId, fresh);
  const cleanup = () => {
    if (inflightPlayerLoads.get(playerId) === fresh) inflightPlayerLoads.delete(playerId);
  };
  void fresh.then(cleanup, cleanup);
  return fresh;
}

/**
 * TUF 公开数据的本地持久化快照（缓存优先渲染）。
 * 曲库分页、关卡详情与难度列表是账号无关的全局资源；玩家资料与成绩页按 playerId 归属。
 */
export class TufCache {
  constructor(private readonly repository = new SqliteSnapshotRepository()) {}

  async loadPlayer(playerId: number): Promise<TufPlayerSnapshot | null> {
    return this.repository.getResource<TufPlayerSnapshot>(tufPlayerCacheKey(playerId), TUF_PLAYER_SCHEMA_VERSION);
  }
  async savePlayer(playerId: number, snapshot: TufPlayerSnapshot): Promise<void> {
    await this.repository.saveResource(tufPlayerCacheKey(playerId), TUF_PLAYER_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot);
  }

  async loadPassPage(
    playerId: number,
    options: Omit<TufPassQuery, 'offset' | 'limit'>,
    offset: number,
  ): Promise<TufPassPageSnapshot | null> {
    return this.repository.getResource<TufPassPageSnapshot>(
      tufPassPageCacheKey(playerId, options, offset),
      TUF_PASS_PAGE_SCHEMA_VERSION,
    );
  }
  async savePassPage(
    playerId: number,
    options: Omit<TufPassQuery, 'offset' | 'limit'>,
    offset: number,
    snapshot: TufPassPageSnapshot,
  ): Promise<void> {
    await this.repository.saveResource(
      tufPassPageCacheKey(playerId, options, offset),
      TUF_PASS_PAGE_SCHEMA_VERSION,
      snapshot.source.updatedAt,
      snapshot,
    );
  }

  async loadLevelPage(
    options: Omit<TufLevelQuery, 'offset' | 'limit'>,
    offset: number,
  ): Promise<TufLevelPageSnapshot | null> {
    return this.repository.getResource<TufLevelPageSnapshot>(
      tufLevelPageCacheKey(options, offset),
      TUF_LEVEL_PAGE_SCHEMA_VERSION,
    );
  }
  async saveLevelPage(
    options: Omit<TufLevelQuery, 'offset' | 'limit'>,
    offset: number,
    snapshot: TufLevelPageSnapshot,
  ): Promise<void> {
    await this.repository.saveResource(
      tufLevelPageCacheKey(options, offset),
      TUF_LEVEL_PAGE_SCHEMA_VERSION,
      snapshot.source.updatedAt,
      snapshot,
    );
  }

  async loadLevel(levelId: number): Promise<TufLevelDetailSnapshot | null> {
    return this.repository.getResource<TufLevelDetailSnapshot>(tufLevelCacheKey(levelId), TUF_LEVEL_SCHEMA_VERSION);
  }
  async saveLevel(levelId: number, snapshot: TufLevelDetailSnapshot): Promise<void> {
    await this.repository.saveResource(tufLevelCacheKey(levelId), TUF_LEVEL_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot);
  }

  async loadDifficulties(): Promise<TufDifficultiesSnapshot | null> {
    return this.repository.getResource<TufDifficultiesSnapshot>(
      TUF_DIFFICULTIES_CACHE_KEY,
      TUF_DIFFICULTIES_SCHEMA_VERSION,
    );
  }
  async saveDifficulties(snapshot: TufDifficultiesSnapshot): Promise<void> {
    await this.repository.saveResource(
      TUF_DIFFICULTIES_CACHE_KEY,
      TUF_DIFFICULTIES_SCHEMA_VERSION,
      snapshot.source.updatedAt,
      snapshot,
    );
  }

  /** 解绑玩家时清理其资料与成绩页缓存；曲库等全局公开资源保留。 */
  async clearPlayer(playerId: number): Promise<void> {
    const rows = await this.repository.listResourceSizes();
    const keys = rows
      .map((row) => row.key)
      .filter((key) => key === tufPlayerCacheKey(playerId) || key.startsWith(`tuf:passes:${playerId}:`));
    if (keys.length > 0) await this.repository.clearResources(keys);
  }
}

/** 测试用：清除 in-flight 去重表。 */
export function resetTufInflightForTests(): void {
  inflightPlayerLoads.clear();
}
