import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_POLICY_REGISTRY,
  isSessionOnlyResourceKey,
  isTemporaryCacheEntry,
  resourceCachePersistence,
} from '@/features/storage-management/cache-policy';

const mocks = vi.hoisted(() => ({
  marker: null as string | null,
  setMarker: vi.fn(),
  clearDisk: vi.fn(async () => true),
  clearMemory: vi.fn(async () => true),
  compact: vi.fn(async () => undefined),
  clearDirectoryContentsStrict: vi.fn(),
}));

vi.mock('expo-sqlite/kv-store', () => ({ default: {
  getItem: vi.fn(async () => mocks.marker),
  setItem: vi.fn(async (_key: string, value: string) => {
    mocks.marker = value;
    mocks.setMarker(value);
  }),
} }));
vi.mock('expo-image', () => ({ Image: {
  clearDiskCache: mocks.clearDisk,
  clearMemoryCache: mocks.clearMemory,
} }));
vi.mock('@/storage/rranker-database', () => ({ compactRrankerDatabase: mocks.compact }));
vi.mock('@/features/best-image/maimai-font-cache', () => ({ MAIMAI_FONT_CACHE_VERSION: 'v1' }));
vi.mock('@/features/best-image/maimai-ui-cache', () => ({ MAIMAI_UI_CACHE_VERSION: 'v1' }));
vi.mock('@/features/phigros-best-image/phigros-font-cache', () => ({ PHIGROS_FONT_CACHE_VERSION: 'v1' }));
vi.mock('@/features/storage-management/fs-storage', () => ({
  APP_CACHE_ROOT: () => ({ exists: false }),
  MAIMAI_ASSETS_ROOT: () => ({ exists: false }),
  OSU_MOD_ICONS_ROOT: () => ({ exists: false }),
  PHIGROS_FONT_ROOT: () => ({ exists: false }),
  PHIGROS_ILLUSTRATION_ROOT: () => ({ exists: false }),
  clearDirectoryContentsStrict: mocks.clearDirectoryContentsStrict,
  pruneVersionedAssetRoot: vi.fn(),
}));
vi.mock('@/features/storage-management/expo-system-cache', () => ({ isExpoSystemCacheEntry: () => false }));
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {} }));
vi.mock('@/services/remote-image-cache', () => ({ pruneRemoteImageCache: vi.fn(async () => undefined) }));

// 原生依赖 mock 完成后再导入迁移入口。
// eslint-disable-next-line import/first
import {
  cleanupOrphanedTemporaryStorage,
  migrateLegacyStorageCaches,
} from '@/features/storage-management/storage-cache-maintenance';

describe('cache policy registry', () => {
  it('contains all four persistence classes', () => {
    expect(new Set(CACHE_POLICY_REGISTRY.map((item) => item.persistence))).toEqual(new Set([
      'durable', 'session-only', 'temporary', 'bounded-cache', 'versioned-asset',
    ]));
  });

  it('classifies public derived rows without matching durable account snapshots', () => {
    expect(isSessionOnlyResourceKey('detailed-catalog')).toBe(true);
    expect(resourceCachePersistence('phira:notes:38294')).toBe('session-only');
    expect(resourceCachePersistence('phira:player:323528')).toBe('durable');
    expect(resourceCachePersistence('osu:osu-standard:2')).toBe('durable');
    expect(isTemporaryCacheEntry('rranker-chart-preview-session-1')).toBe(true);
    expect(isTemporaryCacheEntry('rranker-remote-image-cache-v1')).toBe(true);
    expect(isTemporaryCacheEntry('rranker-remote-image-cache-v2')).toBe(false);
    expect(isTemporaryCacheEntry('ExponentAsset-font.ttf')).toBe(false);
  });
});

describe('legacy cache migration', () => {
  beforeEach(() => {
    mocks.marker = null;
    mocks.setMarker.mockClear();
    mocks.clearDisk.mockReset().mockResolvedValue(true);
    mocks.clearMemory.mockReset().mockResolvedValue(true);
    mocks.compact.mockClear();
  });

  function repository() {
    return {
      listResourceSizes: vi.fn(async () => [
        { key: 'detailed-catalog', bytes: 100 },
        { key: 'phira:notes:1', bytes: 200 },
        { key: 'phira:player:1', bytes: 300 },
      ]),
      clearResources: vi.fn(async () => undefined),
      clearCatalog: vi.fn(async () => undefined),
    };
  }

  it('deletes only session rows, protects durable data and is idempotent', async () => {
    const snapshots = repository();
    await migrateLegacyStorageCaches(snapshots as never);
    expect(snapshots.clearResources).toHaveBeenCalledWith(['detailed-catalog', 'phira:notes:1']);
    expect(snapshots.clearCatalog).toHaveBeenCalledTimes(1);
    expect(mocks.setMarker).toHaveBeenCalledWith('done');

    await migrateLegacyStorageCaches(snapshots as never);
    expect(snapshots.clearResources).toHaveBeenCalledTimes(1);
  });

  it('does not write the marker on failure and retries on the next launch', async () => {
    const snapshots = repository();
    mocks.clearDisk.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(migrateLegacyStorageCaches(snapshots as never)).rejects.toThrow('原生图片磁盘缓存');
    expect(mocks.marker).toBeNull();

    await expect(migrateLegacyStorageCaches(snapshots as never)).resolves.toBeUndefined();
    expect(mocks.marker).toBe('done');
    expect(snapshots.clearResources).toHaveBeenCalledTimes(2);
  });
});

describe('startup orphan cleanup', () => {
  it('removes only rRanker temporary entries from the shared cache root', () => {
    mocks.clearDirectoryContentsStrict.mockClear();
    cleanupOrphanedTemporaryStorage();
    const options = mocks.clearDirectoryContentsStrict.mock.calls[0]?.[1] as {
      skip: (name: string) => boolean;
    };
    expect(options.skip('rranker-chart-preview-session-1')).toBe(false);
    expect(options.skip('rRanker-backup-session.json')).toBe(false);
    expect(options.skip('rranker-remote-image-cache-v1')).toBe(false);
    expect(options.skip('rranker-remote-image-cache-v2')).toBe(true);
    expect(options.skip('Image')).toBe(true);
    expect(options.skip('ExponentAsset-Ionicons.ttf')).toBe(true);
  });
});
