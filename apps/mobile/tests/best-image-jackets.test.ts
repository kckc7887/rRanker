import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bestImageJacketUrl,
  imageCachePathToFileUri,
  loadBestImageJackets,
} from '@/features/best-image/load-best-image-jackets';

const mocks = vi.hoisted(() => ({
  getCachePathAsync: vi.fn(),
  prefetch: vi.fn(),
  base64: vi.fn(),
}));

vi.mock('expo-image', () => ({
  Image: {
    getCachePathAsync: mocks.getCachePathAsync,
    prefetch: mocks.prefetch,
  },
}));
vi.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(public readonly uri: string) {}
    base64() { return mocks.base64(this.uri); }
  },
}));

describe('best image jacket cache', () => {
  beforeEach(() => {
    mocks.getCachePathAsync.mockReset();
    mocks.prefetch.mockReset();
    mocks.base64.mockReset();
  });

  it('reuses Expo Image disk cache and returns WebView-safe data URIs', async () => {
    mocks.getCachePathAsync.mockImplementation(async (url: string) => `file:///cache/${url.split('/').at(-1)}`);
    mocks.base64.mockImplementation(async (uri: string) => `encoded-${uri.split('/').at(-1)}`);

    await expect(loadBestImageJackets(['cache-11447', 'cache-11448', 'cache-11447'])).resolves.toEqual({
      'cache-11447': 'data:image/png;base64,encoded-cache-11447.png',
      'cache-11448': 'data:image/png;base64,encoded-cache-11448.png',
    });
    expect(mocks.prefetch).not.toHaveBeenCalled();
  });

  it('normalizes the absolute cache path returned by Android before reading it', async () => {
    mocks.getCachePathAsync.mockResolvedValue('/data/user/0/app/cache/1449.png');
    mocks.base64.mockResolvedValue('encoded-android');

    await expect(loadBestImageJackets(['android-11449'])).resolves.toEqual({
      'android-11449': 'data:image/png;base64,encoded-android',
    });
    expect(imageCachePathToFileUri('/data/user/0/app/cache/1449.png'))
      .toBe('file:///data/user/0/app/cache/1449.png');
    expect(mocks.base64).toHaveBeenCalledWith('file:///data/user/0/app/cache/1449.png');
  });

  it('prefetches missing jackets serially and marks failures for placeholders', async () => {
    mocks.getCachePathAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('file:///cache/fetch-11447.png')
      .mockResolvedValueOnce(null);
    mocks.prefetch.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mocks.base64.mockResolvedValue('encoded-fetched');

    const progress: string[] = [];
    await expect(loadBestImageJackets(['fetch-11447', 'fetch-missing'], (completed, total) => {
      progress.push(`${completed}/${total}`);
    })).resolves.toEqual({
      'fetch-11447': 'data:image/png;base64,encoded-fetched',
      'fetch-missing': null,
    });
    expect(progress).toEqual(['0/2', '1/2', '2/2']);
    expect(bestImageJacketUrl('11447')).toBe('https://assets2.lxns.net/maimai/jacket/1447.png');
    expect(bestImageJacketUrl('110123')).toBe('https://assets2.lxns.net/maimai/jacket/123.png');
  });

  it('uses one normalized CDN resource for SD and offset DX ids while preserving both output keys', async () => {
    mocks.getCachePathAsync.mockResolvedValue('file:///cache/1447.png');
    mocks.base64.mockResolvedValue('encoded-1447');

    await expect(loadBestImageJackets(['1447', '11447'])).resolves.toEqual({
      '1447': 'data:image/png;base64,encoded-1447',
      '11447': 'data:image/png;base64,encoded-1447',
    });
    expect(mocks.getCachePathAsync).toHaveBeenCalledTimes(1);
  });
});
