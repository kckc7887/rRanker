import type { DataSource } from '@/domain/models';
import { z } from 'zod';
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
  TufPlayerSchema, TufPassPageSchema, TufLevelPageSchema, TufLevelDetailResponseSchema, TufDifficultyListSchema,
} from '@/domain/tuf';
import { tufProvider } from '@/providers/tuf-provider';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import type { ResourceRepository, ResourceMaintenanceRepository } from '@/repositories/resource-repository';
import { clearResourcesByPrefix, createInflightGuard, resourceWriteGeneration, makeSnapshot, parseCachedSnapshot } from '@/services/snapshot-cache-utils';
import { assertFreshSnapshotSource } from '@/domain/refresh-result';

export function makeTufSnapshot<T>(data: T, updatedAt = new Date().toISOString()): { data: T; source: DataSource } {
  return makeSnapshot(data, { kind: 'tuf', label: 'TUF 社区公开数据' }, updatedAt);
}

const inflightPlayerLoads = createInflightGuard<string>();

export function loadTufPlayerFresh(playerId: number, signal?: AbortSignal): Promise<TufPlayer> {
  return inflightPlayerLoads.share(resourceWriteGeneration('adofai') + ':' + resourceWriteGeneration(`account:adofai:tuf:${playerId}`) + ':' + playerId, requestSignal => tufProvider.getPlayerProfile(playerId, requestSignal), signal);
}

export class TufCache {
  constructor(private readonly repository: ResourceRepository & ResourceMaintenanceRepository = new SqliteSnapshotRepository()) {}

  private async readSnapshot<T>(key: string, version: number, dataSchema: z.ZodType<T>): Promise<{ data: T; source: DataSource } | null> {
    const stored = await this.repository.getResource<unknown>(key, version);
    return parseCachedSnapshot(stored, 'tuf', dataSchema);
  }

  async loadPlayer(playerId: number): Promise<TufPlayerSnapshot | null> {
    return this.readSnapshot(tufPlayerCacheKey(playerId), TUF_PLAYER_SCHEMA_VERSION, TufPlayerSchema);
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
    return this.readSnapshot(tufPassPageCacheKey(playerId, options, offset), TUF_PASS_PAGE_SCHEMA_VERSION, TufPassPageSchema);
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
    return this.readSnapshot(tufLevelPageCacheKey(options, offset), TUF_LEVEL_PAGE_SCHEMA_VERSION, TufLevelPageSchema);
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
    return this.readSnapshot(tufLevelCacheKey(levelId), TUF_LEVEL_SCHEMA_VERSION, TufLevelDetailResponseSchema);
  }
  async saveLevel(levelId: number, snapshot: TufLevelDetailSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(tufLevelCacheKey(levelId), TUF_LEVEL_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent);
  }

  async loadDifficulties(): Promise<TufDifficultiesSnapshot | null> {
    return this.readSnapshot(TUF_DIFFICULTIES_CACHE_KEY, TUF_DIFFICULTIES_SCHEMA_VERSION, TufDifficultyListSchema);
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

  async clearPlayer(playerId: number): Promise<void> {
    await clearResourcesByPrefix(this.repository, {
      keys: [tufPlayerCacheKey(playerId)],
      prefixes: [`tuf:passes:${playerId}:`],
    });
  }
}
