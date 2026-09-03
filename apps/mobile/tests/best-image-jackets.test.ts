import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bestImageJacketUrl,
  imageCachePathToFileUri,
  loadBestImageJackets,
} from '@/features/best-image/load-best-image-jackets';

const mocks = vi.hoisted(() => ({
  files: new Set<string>(),
  urls: [] as string[],
  base64: vi.fn(async (uri: string) => `encoded-${uri}`),
  failUrls: new Set<string>(),
  deleted: [] as string[],
}));

vi.mock('expo-file-system', () => {
  class File {
    readonly uri: string;
    constructor(base: { uri: string } | string, name?: string) {
      this.uri = typeof base === 'string' ? base : `${base.uri}/${name}`;
    }
    get exists() { return mocks.files.has(this.uri); }
    get size() { return this.exists ? 3 : 0; }
    base64() { return mocks.base64(this.uri); }
    delete() { mocks.deleted.push(this.uri); mocks.files.delete(this.uri); }
    static async downloadFileAsync(url: string, file: File) {
      mocks.urls.push(url);
      if (mocks.failUrls.has(url)) throw new Error('download failed');
      mocks.files.add(file.uri);
      return file;
    }
  }
  return { File, Paths: { cache: { uri: 'file://cache' } } };
});

describe('best image jacket temporary loading', () => {
  beforeEach(() => {
    mocks.files.clear();
    mocks.urls.length = 0;
    mocks.deleted.length = 0;
    mocks.failUrls.clear();
    mocks.base64.mockClear();
  });

  it('loads jackets serially through temporary files and reports progress', async () => {
    const progress: string[] = [];
    const result = await loadBestImageJackets(['11447', '11448'], (completed, total) => {
      progress.push(`${completed}/${total}`);
    });
    expect(Object.keys(result)).toEqual(['11447', '11448']);
    expect(Object.values(result).every((value) => value?.startsWith('data:image/png;base64,'))).toBe(true);
    expect(progress).toEqual(['0/2', '1/2', '2/2']);
    expect(mocks.deleted).toHaveLength(2);
    expect(mocks.files.size).toBe(0);
  });

  it('marks a failed jacket as null without retaining a file', async () => {
    mocks.failUrls.add(bestImageJacketUrl('11449'));
    await expect(loadBestImageJackets(['11449'])).resolves.toEqual({ '11449': null });
    expect(mocks.files.size).toBe(0);
  });

  it('deduplicates normalized SD and DX URLs while preserving both output keys', async () => {
    await expect(loadBestImageJackets(['1447', '11447'])).resolves.toMatchObject({
      '1447': expect.stringContaining('data:image/png;base64,'),
      '11447': expect.stringContaining('data:image/png;base64,'),
    });
    expect(mocks.urls).toHaveLength(1);
  });

  it('keeps compatibility URL helpers', () => {
    expect(bestImageJacketUrl('11447')).toBe('https://assets2.lxns.net/maimai/jacket/1447.png');
    expect(bestImageJacketUrl('110123')).toBe('https://assets2.lxns.net/maimai/jacket/123.png');
    expect(imageCachePathToFileUri('/data/user/0/app/cache/1449.png'))
      .toBe('file:///data/user/0/app/cache/1449.png');
  });
});
