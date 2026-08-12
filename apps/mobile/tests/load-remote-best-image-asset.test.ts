import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachePathAsync: vi.fn(),
  prefetch: vi.fn(),
  base64: vi.fn(async () => 'YWJj'),
}));

vi.mock('expo-image', () => ({ Image: {
  getCachePathAsync: mocks.getCachePathAsync,
  prefetch: mocks.prefetch,
} }));
vi.mock('expo-file-system', () => ({ File: class {
  base64 = mocks.base64;
} }));
vi.mock('@/features/best-image/load-best-image-jackets', () => ({
  imageCachePathToFileUri: (path: string) => `file://${path}`,
}));

// Mocked native modules must be registered before the module under test is imported.
// eslint-disable-next-line import/first
import {
  loadRemoteBestImageAssetDataUri,
} from '@/features/best-image/load-remote-best-image-asset';

describe('remote best image asset localization', () => {
  beforeEach(() => {
    mocks.getCachePathAsync.mockReset();
    mocks.prefetch.mockReset();
    mocks.base64.mockReset();
    mocks.getCachePathAsync.mockResolvedValue('/cache/image.png');
    mocks.prefetch.mockResolvedValue(true);
    mocks.base64.mockResolvedValue('YWJj');
  });

  it('uses the existing image disk cache and returns a data URI', async () => {
    await expect(loadRemoteBestImageAssetDataUri('https://example.test/cached.png'))
      .resolves.toBe('data:image/png;base64,YWJj');
    expect(mocks.prefetch).not.toHaveBeenCalled();
  });

  it('prefetches a cache miss', async () => {
    mocks.getCachePathAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('/cache/original.png');
    mocks.prefetch.mockResolvedValueOnce(true);
    await expect(loadRemoteBestImageAssetDataUri('https://example.test/original.png'))
      .resolves.toBe('data:image/png;base64,YWJj');
    expect(mocks.prefetch).toHaveBeenCalledWith('https://example.test/original.png', 'disk');
  });

  it('treats missing and failed items as a per-item null fallback', async () => {
    mocks.getCachePathAsync.mockRejectedValue(new Error('download failed'));
    await expect(loadRemoteBestImageAssetDataUri(null)).resolves.toBeNull();
    await expect(loadRemoteBestImageAssetDataUri('https://example.test/failed.png')).resolves.toBeNull();
  });
});
