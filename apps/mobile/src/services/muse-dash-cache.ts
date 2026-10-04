import { z } from 'zod';
import type { DataSource } from '@/domain/models';
import type {
  MuseDashAlbumsResponse,
  MuseDashAlbumsSnapshot,
  MuseDashCeResponse,
  MuseDashCeSnapshot,
  MuseDashDiffdiffSnapshot,
  MuseDashPlayDetail,
  MuseDashPlayDetailSnapshot,
  MuseDashPlayer,
  MuseDashPlayerSnapshot,
} from '@/domain/muse-dash';
import {
  MuseDashPlayerSchema, MuseDashPlayDetailSchema, MuseDashAlbumsResponseSchema, MuseDashCeResponseSchema, MuseDashDiffdiffResponseSchema,
  MUSE_DASH_ALBUMS_CACHE_KEY,
  MUSE_DASH_ALBUMS_SCHEMA_VERSION,
  MUSE_DASH_CE_CACHE_KEY,
  MUSE_DASH_CE_SCHEMA_VERSION,
  MUSE_DASH_DIFFDIFF_CACHE_KEY,
  MUSE_DASH_DIFFDIFF_SCHEMA_VERSION,
  MUSE_DASH_PLAY_DETAIL_SCHEMA_VERSION,
  MUSE_DASH_PLAYER_SCHEMA_VERSION,
  museDashPlayDetailCacheKey,
  museDashPlayerCacheKey,
} from '@/domain/muse-dash';
import { museDashProvider } from '@/providers/muse-dash-provider';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import type { ResourceRepository, ResourceMaintenanceRepository } from '@/repositories/resource-repository';
import { clearResourcesByPrefix, createInflightGuard, resourceWriteGeneration, makeSnapshot, parseCachedSnapshot } from '@/services/snapshot-cache-utils';
import { assertFreshSnapshotSource } from '@/domain/refresh-result';

export function makeMuseDashSnapshot<T>(data: T, updatedAt = new Date().toISOString()): { data: T; source: DataSource } {
  return makeSnapshot(data, { kind: 'musedash', label: 'MuseDash.moe' }, updatedAt);
}

const inflightLoads = createInflightGuard<string>();

export function loadMuseDashPlayerFresh(userId: string, signal?: AbortSignal): Promise<MuseDashPlayer> {
  return inflightLoads.share(resourceWriteGeneration('musedash') + ':' + resourceWriteGeneration(`account:musedash:musedash-moe:${userId}`) + ':' + `player:${userId}`, requestSignal => museDashProvider.getPlayer(userId, requestSignal), signal);
}

export function loadMuseDashPlayDetailFresh(
  uid: string, difficulty: number, platform: string, userId: string,
  signal?: AbortSignal,
): Promise<MuseDashPlayDetail> {
  return inflightLoads.share(resourceWriteGeneration('musedash') + ':' + resourceWriteGeneration(`account:musedash:musedash-moe:${userId}`) + ':' + `detail:${userId}:${uid}:${difficulty}:${platform}`,
    requestSignal => museDashProvider.getPlayDetail(uid, difficulty, platform, userId, requestSignal),
    signal,
  );
}

export function loadMuseDashAlbumsFresh(signal?: AbortSignal): Promise<MuseDashAlbumsResponse> {
  return inflightLoads.share(resourceWriteGeneration('musedash') + ':' + 'albums', requestSignal => museDashProvider.getAlbums(requestSignal), signal);
}

export function loadMuseDashCeFresh(signal?: AbortSignal): Promise<MuseDashCeResponse> {
  return inflightLoads.share(resourceWriteGeneration('musedash') + ':' + 'ce', requestSignal => museDashProvider.getCe(requestSignal), signal);
}

export function loadMuseDashDiffdiffFresh(signal?: AbortSignal): Promise<MuseDashDiffdiffSnapshot['data']> {
  return inflightLoads.share(resourceWriteGeneration('musedash') + ':' + 'diffdiff', requestSignal => museDashProvider.getDiffdiff(requestSignal), signal);
}

export function loadMuseDashAlbumsFreshSnapshot(
  signal?: AbortSignal,
): Promise<MuseDashAlbumsSnapshot> {
  return loadMuseDashAlbumsFresh(signal).then((albums) => makeMuseDashSnapshot(albums));
}

export function loadMuseDashDiffdiffFreshSnapshot(
  signal?: AbortSignal,
): Promise<MuseDashDiffdiffSnapshot> {
  return loadMuseDashDiffdiffFresh(signal).then((entries) => makeMuseDashSnapshot(entries));
}

export class MuseDashCache {
  constructor(private readonly repository: ResourceRepository & ResourceMaintenanceRepository = new SqliteSnapshotRepository()) {}

  private async readSnapshot<T>(key: string, version: number, dataSchema: z.ZodType<T>): Promise<{ data: T; source: DataSource } | null> {
    const stored = await this.repository.getResource<unknown>(key, version);
    return parseCachedSnapshot(stored, 'musedash', dataSchema);
  }

  async loadPlayer(userId: string): Promise<MuseDashPlayerSnapshot | null> {
    return this.readSnapshot(museDashPlayerCacheKey(userId), MUSE_DASH_PLAYER_SCHEMA_VERSION, MuseDashPlayerSchema);
  }
  async savePlayer(userId: string, snapshot: MuseDashPlayerSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(museDashPlayerCacheKey(userId), MUSE_DASH_PLAYER_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent);
  }

  async loadPlayDetail(userId: string, uid: string, difficulty: number, platform: string): Promise<MuseDashPlayDetailSnapshot | null> {
    return this.readSnapshot(
      museDashPlayDetailCacheKey(userId, uid, difficulty, platform), MUSE_DASH_PLAY_DETAIL_SCHEMA_VERSION, MuseDashPlayDetailSchema,
    );
  }
  async savePlayDetail(userId: string, uid: string, difficulty: number, platform: string, snapshot: MuseDashPlayDetailSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(
      museDashPlayDetailCacheKey(userId, uid, difficulty, platform),
      MUSE_DASH_PLAY_DETAIL_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent,
    );
  }

  async loadAlbums(): Promise<MuseDashAlbumsSnapshot | null> {
    return this.readSnapshot(MUSE_DASH_ALBUMS_CACHE_KEY, MUSE_DASH_ALBUMS_SCHEMA_VERSION, MuseDashAlbumsResponseSchema);
  }
  async saveAlbums(snapshot: MuseDashAlbumsSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(MUSE_DASH_ALBUMS_CACHE_KEY, MUSE_DASH_ALBUMS_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent);
  }

  async loadCe(): Promise<MuseDashCeSnapshot | null> {
    return this.readSnapshot(MUSE_DASH_CE_CACHE_KEY, MUSE_DASH_CE_SCHEMA_VERSION, MuseDashCeResponseSchema);
  }
  async saveCe(snapshot: MuseDashCeSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(MUSE_DASH_CE_CACHE_KEY, MUSE_DASH_CE_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent);
  }

  async loadDiffdiff(): Promise<MuseDashDiffdiffSnapshot | null> {
    return this.readSnapshot(MUSE_DASH_DIFFDIFF_CACHE_KEY, MUSE_DASH_DIFFDIFF_SCHEMA_VERSION, MuseDashDiffdiffResponseSchema);
  }
  async saveDiffdiff(snapshot: MuseDashDiffdiffSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(MUSE_DASH_DIFFDIFF_CACHE_KEY, MUSE_DASH_DIFFDIFF_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent);
  }

  async clearPlayer(userId: string): Promise<void> {
    await clearResourcesByPrefix(this.repository, {
      keys: [museDashPlayerCacheKey(userId)],
      prefixes: [`musedash:detail:${userId}:`],
    });
  }
}
