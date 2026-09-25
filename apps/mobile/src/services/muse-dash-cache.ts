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
import { clearResourcesByPrefix, createInflightGuard, resourceWriteGeneration, makeSnapshot } from '@/services/snapshot-cache-utils';
import { assertFreshSnapshotSource, cachedSnapshotSource } from '@/domain/refresh-result';

/** 构造 Muse Dash 缓存快照；source 的 updatedAt 记录本次拉取时间，供缓存命中时展示来源与过期标。 */
export function makeMuseDashSnapshot<T>(data: T, updatedAt = new Date().toISOString()): { data: T; source: DataSource } {
  return makeSnapshot(data, { kind: 'musedash', label: 'MuseDash.moe' }, updatedAt);
}

/** 并发读取共享一次网络请求（总览、成绩、曲库可能并发）。 */
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

/**
 * 全局公开资源（曲库/定数表）的请求入口：只请求新数据并包装为快照，
 * 不读本地持久化缓存；网络请求由 inflightLoads 去重，多路并发只发一次。
 */
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

/**
 * Muse Dash 公开数据的本地持久化快照（缓存优先渲染）。
 * 曲库、定数表与名称表是账号无关的全局资源；玩家资料与成绩明细按 userId 归属。
 * 读取一律是缓存读取：保留原提供方与抓取时间并标记过期；写入只接受抓取结果，缓存回退不得落盘。
 */
export class MuseDashCache {
  constructor(private readonly repository = new SqliteSnapshotRepository()) {}

  private async readSnapshot<S extends { source: DataSource }>(key: string, version: number): Promise<S | null> {
    const stored = await this.repository.getResource<S>(key, version);
    return stored ? { ...stored, source: cachedSnapshotSource(stored.source) } : null;
  }

  async loadPlayer(userId: string): Promise<MuseDashPlayerSnapshot | null> {
    return this.readSnapshot<MuseDashPlayerSnapshot>(museDashPlayerCacheKey(userId), MUSE_DASH_PLAYER_SCHEMA_VERSION);
  }
  async savePlayer(userId: string, snapshot: MuseDashPlayerSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(museDashPlayerCacheKey(userId), MUSE_DASH_PLAYER_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent);
  }

  async loadPlayDetail(userId: string, uid: string, difficulty: number, platform: string): Promise<MuseDashPlayDetailSnapshot | null> {
    return this.readSnapshot<MuseDashPlayDetailSnapshot>(
      museDashPlayDetailCacheKey(userId, uid, difficulty, platform), MUSE_DASH_PLAY_DETAIL_SCHEMA_VERSION,
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
    return this.readSnapshot<MuseDashAlbumsSnapshot>(MUSE_DASH_ALBUMS_CACHE_KEY, MUSE_DASH_ALBUMS_SCHEMA_VERSION);
  }
  async saveAlbums(snapshot: MuseDashAlbumsSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(MUSE_DASH_ALBUMS_CACHE_KEY, MUSE_DASH_ALBUMS_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent);
  }

  async loadCe(): Promise<MuseDashCeSnapshot | null> {
    return this.readSnapshot<MuseDashCeSnapshot>(MUSE_DASH_CE_CACHE_KEY, MUSE_DASH_CE_SCHEMA_VERSION);
  }
  async saveCe(snapshot: MuseDashCeSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(MUSE_DASH_CE_CACHE_KEY, MUSE_DASH_CE_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent);
  }

  async loadDiffdiff(): Promise<MuseDashDiffdiffSnapshot | null> {
    return this.readSnapshot<MuseDashDiffdiffSnapshot>(MUSE_DASH_DIFFDIFF_CACHE_KEY, MUSE_DASH_DIFFDIFF_SCHEMA_VERSION);
  }
  async saveDiffdiff(snapshot: MuseDashDiffdiffSnapshot, assertCurrent?: () => void): Promise<void> {
    assertFreshSnapshotSource(snapshot.source);
    await this.repository.saveResource(MUSE_DASH_DIFFDIFF_CACHE_KEY, MUSE_DASH_DIFFDIFF_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot, assertCurrent);
  }

  /** 解绑玩家时清理其资料、成绩明细缓存；曲库、定数表、名称表等全局公开资源保留。 */
  async clearPlayer(userId: string): Promise<void> {
    await clearResourcesByPrefix(this.repository, {
      keys: [museDashPlayerCacheKey(userId)],
      prefixes: [`musedash:detail:${userId}:`],
    });
  }
}

/** 测试用：清除 in-flight 去重表。 */
export function resetMuseDashInflightForTests(): void {
  inflightLoads.resetForTests();
}
