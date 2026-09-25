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
import { clearResourcesByPrefix, createInflightGuard, resourceWriteGeneration, makeSnapshot } from '@/services/snapshot-cache-utils';
import { assertFreshSnapshotSource, cachedSnapshotSource } from '@/domain/refresh-result';

/** 构造 TUF 缓存快照；source 的 updatedAt 记录本次拉取时间，供缓存命中时展示来源与过期标。 */
export function makeTufSnapshot<T>(data: T, updatedAt = new Date().toISOString()): { data: T; source: DataSource } {
  return makeSnapshot(data, { kind: 'tuf', label: 'TUF 社区公开数据' }, updatedAt);
}

/** 同一 TUF 玩家资料并发读取共享一次网络请求（总览与最佳页可能并发）。 */
const inflightPlayerLoads = createInflightGuard<string>();

export function loadTufPlayerFresh(playerId: number, signal?: AbortSignal): Promise<TufPlayer> {
  return inflightPlayerLoads.share(resourceWriteGeneration('adofai') + ':' + resourceWriteGeneration(`account:adofai:tuf:${playerId}`) + ':' + playerId, requestSignal => tufProvider.getPlayerProfile(playerId, requestSignal), signal);
}

/**
 * TUF 公开数据的本地持久化快照（缓存优先渲染）。
 * 曲库分页、关卡详情与难度列表是账号无关的全局资源；玩家资料与成绩页按 playerId 归属。
 * 读取一律是缓存读取：保留原提供方与抓取时间并标记过期；写入只接受抓取结果，缓存回退不得落盘。
 */
export class TufCache {
  constructor(private readonly repository = new SqliteSnapshotRepository()) {}

  private async readSnapshot<S extends { source: DataSource }>(key: string, version: number): Promise<S | null> {
    const stored = await this.repository.getResource<S>(key, version);
    return stored ? { ...stored, source: cachedSnapshotSource(stored.source) } : null;
  }

  async loadPlayer(playerId: number): Promise<TufPlayerSnapshot | null> {
    return this.readSnapshot<TufPlayerSnapshot>(tufPlayerCacheKey(playerId), TUF_PLAYER_SCHEMA_VERSION);
  }
  async savePlayer(playerId: number, snapshot: TufPlayerSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(tufPlayerCacheKey(playerId), TUF_PLAYER_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent);
  }

  async loadPassPage(
    playerId: number,
    options: Omit<TufPassQuery, 'offset' | 'limit'>,
    offset: number,
  ): Promise<TufPassPageSnapshot | null> {
    return this.readSnapshot<TufPassPageSnapshot>(tufPassPageCacheKey(playerId, options, offset), TUF_PASS_PAGE_SCHEMA_VERSION);
  }
  async savePassPage(
    playerId: number,
    options: Omit<TufPassQuery, 'offset' | 'limit'>,
    offset: number,
    snapshot: TufPassPageSnapshot, assertCurrent?: () => void,
  ): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(
      tufPassPageCacheKey(playerId, options, offset),
      TUF_PASS_PAGE_SCHEMA_VERSION,
      snapshot.source.updatedAt,
      snapshot, assertCurrent,
    );
  }

  async loadLevelPage(
    options: Omit<TufLevelQuery, 'offset' | 'limit'>,
    offset: number,
  ): Promise<TufLevelPageSnapshot | null> {
    return this.readSnapshot<TufLevelPageSnapshot>(tufLevelPageCacheKey(options, offset), TUF_LEVEL_PAGE_SCHEMA_VERSION);
  }
  async saveLevelPage(
    options: Omit<TufLevelQuery, 'offset' | 'limit'>,
    offset: number,
    snapshot: TufLevelPageSnapshot, assertCurrent?: () => void,
  ): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(
      tufLevelPageCacheKey(options, offset),
      TUF_LEVEL_PAGE_SCHEMA_VERSION,
      snapshot.source.updatedAt,
      snapshot, assertCurrent,
    );
  }

  async loadLevel(levelId: number): Promise<TufLevelDetailSnapshot | null> {
    return this.readSnapshot<TufLevelDetailSnapshot>(tufLevelCacheKey(levelId), TUF_LEVEL_SCHEMA_VERSION);
  }
  async saveLevel(levelId: number, snapshot: TufLevelDetailSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(tufLevelCacheKey(levelId), TUF_LEVEL_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent);
  }

  async loadDifficulties(): Promise<TufDifficultiesSnapshot | null> {
    return this.readSnapshot<TufDifficultiesSnapshot>(TUF_DIFFICULTIES_CACHE_KEY, TUF_DIFFICULTIES_SCHEMA_VERSION);
  }
  async saveDifficulties(snapshot: TufDifficultiesSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(
      TUF_DIFFICULTIES_CACHE_KEY,
      TUF_DIFFICULTIES_SCHEMA_VERSION,
      snapshot.source.updatedAt,
      snapshot, assertCurrent,
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
