import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  files: new Set<string>(),
  clearDirectoryContentsStrict: vi.fn(),
}));

vi.mock('@/features/best-image/maimai-font-cache', () => ({ MAIMAI_FONT_CACHE_VERSION: 'v1' }));
vi.mock('@/features/best-image/maimai-ui-cache', () => ({ MAIMAI_UI_CACHE_VERSION: 'v1' }));
vi.mock('@/features/phigros-best-image/phigros-font-cache', () => ({ PHIGROS_FONT_CACHE_VERSION: 'v1' }));
vi.mock('@/features/storage-management/fs-storage', () => ({
  APP_CACHE_ROOT: () => ({ exists: true }),
  MAIMAI_ASSETS_ROOT: () => ({ exists: false }),
  PHIGROS_FONT_ROOT: () => ({ exists: false }),
  PHIGROS_ILLUSTRATION_ROOT: () => ({ exists: false }),
  clearDirectoryContentsStrict: mocks.clearDirectoryContentsStrict,
  pruneVersionedAssetRoot: vi.fn(),
}));
vi.mock('@/features/storage-management/expo-system-cache', () => ({ isExpoSystemCacheEntry: (name: string) => name.startsWith('ExponentAsset-') }));
vi.mock('@/services/remote-image-cache', () => ({ pruneRemoteImageCache: vi.fn(async () => undefined) }));

// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import { cleanupOrphanedTemporaryStorage } from '@/features/storage-management/storage-cache-maintenance';

describe('startup cache cleanup', () => {
  it('removes temporary files and retains current image cache, system files and other applications', () => {
    mocks.files = new Set([
      'rranker-chart-preview-session-1', 'rRanker-backup-session.json',
      'rranker-remote-image-cache-v1', 'rranker-remote-image-cache-v2',
      'rranker-runtime-diagnostics.json', 'rranker-runtime-log-31-1.txt',
      'ExponentAsset-Ionicons.ttf', 'Image', 'another-app.json',
    ]);
    mocks.clearDirectoryContentsStrict.mockImplementation((_root, options: { skip: (name: string) => boolean }) => {
      for (const name of mocks.files) if (!options.skip(name)) mocks.files.delete(name);
    });
    cleanupOrphanedTemporaryStorage();
    expect([...mocks.files]).toEqual(['rranker-remote-image-cache-v2', 'ExponentAsset-Ionicons.ttf', 'Image', 'another-app.json']);
  });
});
