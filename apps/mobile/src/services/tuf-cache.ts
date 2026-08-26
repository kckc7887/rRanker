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
  TUF_LEVEL_HOME_CACHE_KEY,
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
import { clearResourcesByPrefix, createInflightGuard, makeSnapshot } from '@/services/snapshot-cache-utils';

/** 构造 TUF 缓存快照；source 的 updatedAt 记录本次拉取时间，供缓存命中时展示来源与过期标。 */
export function makeTufSnapshot<T>(data: T, updatedAt = new Date().toISOString()): { data: T; source: DataSource } {
  return makeSnapshot(data, { kind: 'tuf', label: 'TUF 社区公开数据' }, updatedAt);
}

/** 同一 TUF 玩家资料并发读取共享一次网络请求（总览与最佳页可能并发）。 */
const inflightPlayerLoads = createInflightGuard<number>();

export function loadTufPlayerFresh(playerId: number): Promise<TufPlayer> {
  return inflightPlayerLoads.dedupe(playerId, () => tufProvider.getPlayerProfile(playerId));
}

/**
 * TUF 公开数据的本地持久化快照（缓存优先渲染）。
 * 默认曲库首页、关卡详情与难度列表是账号无关的全局资源；玩家资料与成绩页按 playerId 归属。
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

  async loadLevelHome(): Promise<TufLevelPageSnapshot | null> {
    return this.repository.getResource<TufLevelPageSnapshot>(
      TUF_LEVEL_HOME_CACHE_KEY,
      TUF_LEVEL_PAGE_SCHEMA_VERSION,
    );
  }
  async saveLevelHome(snapshot: TufLevelPageSnapshot): Promise<void> {
    await this.repository.saveResource(
      TUF_LEVEL_HOME_CACHE_KEY,
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
    await clearResourcesByPrefix(this.repository, {
      keys: [tufPlayerCacheKey(playerId)],
      prefixes: [`tuf:passes:${playerId}:`],
    });
  }
}

/** 测试用：清除 in-flight 去重表。 */
export function resetTufInflightForTests(): void {
  inflightPlayerLoads.resetForTests();
}
