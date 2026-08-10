import type { DataSource } from '@/domain/models';
import type {
  MuseDashAlbumsResponse,
  MuseDashAlbumsSnapshot,
  MuseDashCeResponse,
  MuseDashCeSnapshot,
  MuseDashDiffdiffSnapshot,
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
  MUSE_DASH_PLAYER_SCHEMA_VERSION,
  museDashPlayerCacheKey,
} from '@/domain/muse-dash';
import { museDashProvider } from '@/providers/muse-dash-provider';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

/** 构造 Muse Dash 缓存快照；source 的 updatedAt 记录本次拉取时间，供缓存命中时展示来源与过期标。 */
export function makeMuseDashSnapshot<T>(data: T, updatedAt = new Date().toISOString()): { data: T; source: DataSource } {
  return {
    data,
    source: { kind: 'musedash', label: '喵斯快跑社区公开数据', updatedAt, isStale: false },
  };
}

/** 并发读取共享一次网络请求（总览、成绩、曲库可能并发）。 */
const inflightLoads = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const inflight = inflightLoads.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;
  const fresh = loader();
  inflightLoads.set(key, fresh);
  const cleanup = () => {
    if (inflightLoads.get(key) === fresh) inflightLoads.delete(key);
  };
  void fresh.then(cleanup, cleanup);
  return fresh;
}

export function loadMuseDashPlayerFresh(userId: string): Promise<MuseDashPlayer> {
  return dedupe(`player:${userId}`, () => museDashProvider.getPlayer(userId));
}

export function loadMuseDashAlbumsFresh(): Promise<MuseDashAlbumsResponse> {
  return dedupe('albums', () => museDashProvider.getAlbums());
}

export function loadMuseDashCeFresh(): Promise<MuseDashCeResponse> {
  return dedupe('ce', () => museDashProvider.getCe());
}

export function loadMuseDashDiffdiffFresh(): Promise<MuseDashDiffdiffSnapshot['data']> {
  return dedupe('diffdiff', () => museDashProvider.getDiffdiff());
}

/**
 * Muse Dash 公开数据的本地持久化快照（缓存优先渲染）。
 * 曲库、定数表与名称表是账号无关的全局资源；玩家资料与成绩按 userId 归属。
 */
export class MuseDashCache {
  constructor(private readonly repository = new SqliteSnapshotRepository()) {}

  async loadPlayer(userId: string): Promise<MuseDashPlayerSnapshot | null> {
    return this.repository.getResource<MuseDashPlayerSnapshot>(museDashPlayerCacheKey(userId), MUSE_DASH_PLAYER_SCHEMA_VERSION);
  }
  async savePlayer(userId: string, snapshot: MuseDashPlayerSnapshot): Promise<void> {
    await this.repository.saveResource(museDashPlayerCacheKey(userId), MUSE_DASH_PLAYER_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot);
  }

  async loadAlbums(): Promise<MuseDashAlbumsSnapshot | null> {
    return this.repository.getResource<MuseDashAlbumsSnapshot>(MUSE_DASH_ALBUMS_CACHE_KEY, MUSE_DASH_ALBUMS_SCHEMA_VERSION);
  }
  async saveAlbums(snapshot: MuseDashAlbumsSnapshot): Promise<void> {
    await this.repository.saveResource(MUSE_DASH_ALBUMS_CACHE_KEY, MUSE_DASH_ALBUMS_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot);
  }

  async loadCe(): Promise<MuseDashCeSnapshot | null> {
    return this.repository.getResource<MuseDashCeSnapshot>(MUSE_DASH_CE_CACHE_KEY, MUSE_DASH_CE_SCHEMA_VERSION);
  }
  async saveCe(snapshot: MuseDashCeSnapshot): Promise<void> {
    await this.repository.saveResource(MUSE_DASH_CE_CACHE_KEY, MUSE_DASH_CE_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot);
  }

  async loadDiffdiff(): Promise<MuseDashDiffdiffSnapshot | null> {
    return this.repository.getResource<MuseDashDiffdiffSnapshot>(MUSE_DASH_DIFFDIFF_CACHE_KEY, MUSE_DASH_DIFFDIFF_SCHEMA_VERSION);
  }
  async saveDiffdiff(snapshot: MuseDashDiffdiffSnapshot): Promise<void> {
    await this.repository.saveResource(MUSE_DASH_DIFFDIFF_CACHE_KEY, MUSE_DASH_DIFFDIFF_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot);
  }

  /** 解绑玩家时清理其资料与成绩缓存；曲库、定数表、名称表等全局公开资源保留。 */
  async clearPlayer(userId: string): Promise<void> {
    await this.repository.deleteResource(museDashPlayerCacheKey(userId));
  }
}

/** 测试用：清除 in-flight 去重表。 */
export function resetMuseDashInflightForTests(): void {
  inflightLoads.clear();
}
