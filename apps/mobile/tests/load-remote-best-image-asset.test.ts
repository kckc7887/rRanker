import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  files: new Set<string>(),
  download: vi.fn(),
  base64: vi.fn(async (_uri: string) => 'YWJj'),
  deleted: [] as string[],
  compressed: vi.fn(),
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
      await mocks.download(url, file.uri);
      mocks.files.add(file.uri);
      return file;
    }
  }
  return { File, Paths: { cache: { uri: 'file://cache' } } };
});

vi.mock('@/services/remote-image-cache', () => ({
  loadCompressedRemoteImage: (...args: unknown[]) => mocks.compressed(...args),
}));

// Mocked native modules must be registered before the module under test is imported.
// eslint-disable-next-line import/first
import { loadRemoteBestImageAssetDataUri } from '@/features/best-image/load-remote-best-image-asset';

describe('remote best image asset localization', () => {
  beforeEach(() => {
    mocks.files.clear();
    mocks.deleted.length = 0;
    mocks.download.mockReset().mockResolvedValue(undefined);
    mocks.base64.mockReset().mockResolvedValue('YWJj');
    mocks.compressed.mockReset().mockResolvedValue(null);
  });

  it('downloads through a unique temporary file and deletes it after reading', async () => {
    await expect(loadRemoteBestImageAssetDataUri('https://example.test/cached.png'))
      .resolves.toBe('data:image/png;base64,YWJj');
    expect(mocks.download).toHaveBeenCalledWith(
      'https://example.test/cached.png',
      expect.stringContaining('rranker-best-image-session-'),
    );
    expect(mocks.deleted).toHaveLength(1);
    expect(mocks.files.size).toBe(0);
  });

  it('deletes the temporary file when base64 reading fails', async () => {
    mocks.base64.mockRejectedValueOnce(new Error('read failed'));
    await expect(loadRemoteBestImageAssetDataUri('https://example.test/failed.png')).resolves.toBeNull();
    expect(mocks.deleted).toHaveLength(1);
    expect(mocks.files.size).toBe(0);
  });

  it('treats missing input and download failures as null', async () => {
    mocks.download.mockRejectedValueOnce(new Error('download failed'));
    await expect(loadRemoteBestImageAssetDataUri(null)).resolves.toBeNull();
    await expect(loadRemoteBestImageAssetDataUri('https://example.test/failed.png')).resolves.toBeNull();
  });

  it('reads song covers from the shared compressed file without a second download', async () => {
    const fileUri = 'file://cache/shared-cover.webp';
    mocks.files.add(fileUri);
    mocks.compressed.mockResolvedValueOnce({ cacheKey: 'cover', fileUri, source: { uri: fileUri } });
    await expect(loadRemoteBestImageAssetDataUri(
      'https://example.test/cover.png',
      { gameId: 'phigros', profile: 'artwork' },
    )).resolves.toBe('data:image/webp;base64,YWJj');
    expect(mocks.compressed).toHaveBeenCalledWith(
      'https://example.test/cover.png',
      { gameId: 'phigros', profile: 'artwork' },
    );
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.files.has(fileUri)).toBe(true);
  });
});
