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
import { cacheFirstLoad } from '@/services/cache-first';
import { clearResourcesByPrefix, createInflightGuard, makeSnapshot } from '@/services/snapshot-cache-utils';

/** 构造 Muse Dash 缓存快照；source 的 updatedAt 记录本次拉取时间，供缓存命中时展示来源与过期标。 */
export function makeMuseDashSnapshot<T>(data: T, updatedAt = new Date().toISOString()): { data: T; source: DataSource } {
  return makeSnapshot(data, { kind: 'musedash', label: 'MuseDash.moe' }, updatedAt);
}

/** 并发读取共享一次网络请求（总览、成绩、曲库可能并发）。 */
const inflightLoads = createInflightGuard<string>();

export function loadMuseDashPlayerFresh(userId: string): Promise<MuseDashPlayer> {
  return inflightLoads.dedupe(`player:${userId}`, () => museDashProvider.getPlayer(userId));
}

export function loadMuseDashPlayDetailFresh(
  uid: string, difficulty: number, platform: string, userId: string,
): Promise<MuseDashPlayDetail> {
  return inflightLoads.dedupe(
    `detail:${userId}:${uid}:${difficulty}:${platform}`,
    () => museDashProvider.getPlayDetail(uid, difficulty, platform, userId),
  );
}

export function loadMuseDashAlbumsFresh(): Promise<MuseDashAlbumsResponse> {
  return inflightLoads.dedupe('albums', () => museDashProvider.getAlbums());
}

export function loadMuseDashCeFresh(): Promise<MuseDashCeResponse> {
  return inflightLoads.dedupe('ce', () => museDashProvider.getCe());
}

export function loadMuseDashDiffdiffFresh(): Promise<MuseDashDiffdiffSnapshot['data']> {
  return inflightLoads.dedupe('diffdiff', () => museDashProvider.getDiffdiff());
}

/**
 * 全局公开资源（曲库/定数表）的缓存优先读取：供示例账号生成与页面 hook 复用，
 * 网络请求由 inflightLoads 去重，多路并发只发一次。
 */
export function loadMuseDashAlbumsCacheFirst(
  cache: Pick<MuseDashCache, 'loadAlbums' | 'saveAlbums'>,
  onFresh: (fresh: MuseDashAlbumsSnapshot) => void = () => undefined,
): Promise<MuseDashAlbumsSnapshot> {
  return cacheFirstLoad({
    loadCached: () => cache.loadAlbums(),
    loadFresh: async () => {
      const fresh = makeMuseDashSnapshot(await loadMuseDashAlbumsFresh());
      await cache.saveAlbums(fresh);
      return fresh;
    },
    onFresh,
  });
}

export function loadMuseDashDiffdiffCacheFirst(
  cache: Pick<MuseDashCache, 'loadDiffdiff' | 'saveDiffdiff'>,
  onFresh: (fresh: MuseDashDiffdiffSnapshot) => void = () => undefined,
): Promise<MuseDashDiffdiffSnapshot> {
  return cacheFirstLoad({
    loadCached: () => cache.loadDiffdiff(),
    loadFresh: async () => {
      const fresh = makeMuseDashSnapshot(await loadMuseDashDiffdiffFresh());
      await cache.saveDiffdiff(fresh);
      return fresh;
    },
    onFresh,
  });
}

/**
 * Muse Dash 公开数据的本地持久化快照（缓存优先渲染）。
 * 曲库、定数表与名称表是账号无关的全局资源；玩家资料与成绩明细按 userId 归属。
 */
export class MuseDashCache {
  constructor(private readonly repository = new SqliteSnapshotRepository()) {}

  async loadPlayer(userId: string): Promise<MuseDashPlayerSnapshot | null> {
    return this.repository.getResource<MuseDashPlayerSnapshot>(museDashPlayerCacheKey(userId), MUSE_DASH_PLAYER_SCHEMA_VERSION);
  }
  async savePlayer(userId: string, snapshot: MuseDashPlayerSnapshot): Promise<void> {
    await this.repository.saveResource(museDashPlayerCacheKey(userId), MUSE_DASH_PLAYER_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot);
  }

  async loadPlayDetail(userId: string, uid: string, difficulty: number, platform: string): Promise<MuseDashPlayDetailSnapshot | null> {
    return this.repository.getResource<MuseDashPlayDetailSnapshot>(
      museDashPlayDetailCacheKey(userId, uid, difficulty, platform), MUSE_DASH_PLAY_DETAIL_SCHEMA_VERSION,
    );
  }
  async savePlayDetail(userId: string, uid: string, difficulty: number, platform: string, snapshot: MuseDashPlayDetailSnapshot): Promise<void> {
    await this.repository.saveResource(
      museDashPlayDetailCacheKey(userId, uid, difficulty, platform),
      MUSE_DASH_PLAY_DETAIL_SCHEMA_VERSION, snapshot.source.updatedAt, snapshot,
    );
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
