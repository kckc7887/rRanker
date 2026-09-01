import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  type StoredFile = { content: string; size: number; modified: number };
  const files = new Map<string, StoredFile>();
  const directories = new Set<string>(['/cache']);

  function normalizePath(parts: unknown[]): string {
    const values = parts.map((part) => {
      if (typeof part === 'string') return part;
      return (part as { uri: string }).uri;
    });
    return values.join('/').replace(/:\/+/gu, ':/').replace(/\/{2,}/gu, '/').replace(/\/$/u, '');
  }

  class MockFile {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = normalizePath(parts); }
    get name() { return this.uri.split('/').at(-1) ?? ''; }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.size ?? 0; }
    get modificationTime() { return files.get(this.uri)?.modified ?? null; }
    async text() { return files.get(this.uri)?.content ?? ''; }
    async write(content: string) {
      files.set(this.uri, { content, size: new TextEncoder().encode(content).byteLength, modified: Date.now() });
    }
    delete() { files.delete(this.uri); }
    move(destination: MockFile) {
      const value = files.get(this.uri);
      if (!value) throw new Error(`missing ${this.uri}`);
      files.delete(this.uri);
      files.set(destination.uri, value);
      this.uri = destination.uri;
    }
  }

  class MockDirectory {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = normalizePath(parts); }
    get name() { return this.uri.split('/').at(-1) ?? ''; }
    get exists() { return directories.has(this.uri); }
    create() { directories.add(this.uri); }
    delete() {
      for (const key of Array.from(files.keys())) {
        if (key.startsWith(`${this.uri}/`)) files.delete(key);
      }
      directories.delete(this.uri);
    }
    list() {
      const prefix = `${this.uri}/`;
      return Array.from(files.keys())
        .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map((path) => new MockFile(path));
    }
  }

  return {
    files,
    directories,
    MockFile,
    MockDirectory,
    paths: { cache: new MockDirectory('/cache') },
    imageSequence: 0,
    imageBytes: 64,
    animated: false,
    loadAsync: vi.fn(),
    manipulate: vi.fn(),
  };
});

vi.mock('expo-file-system', () => ({
  Directory: mocks.MockDirectory,
  File: mocks.MockFile,
  Paths: mocks.paths,
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: vi.fn(async (_algorithm: string, value: string) => {
    let hash = 2166136261;
    for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return Math.abs(hash >>> 0).toString(16).padStart(64, '0');
  }),
}));

vi.mock('expo-image', () => ({ Image: {
  loadAsync: (...args: unknown[]) => mocks.loadAsync(...args),
} }));
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { WEBP: 'webp' },
  ImageManipulator: { manipulate: mocks.manipulate },
}));

// 原生模块 mock 完成后导入缓存服务。
// eslint-disable-next-line import/first
import {
  REMOTE_IMAGE_CACHE_BUDGET_BYTES,
  clearCompressedRemoteImageCache,
  flushRemoteImageCacheManifest,
  loadCompressedRemoteImage,
  normalizeRemoteImageSource,
  pruneRemoteImageCache,
  remoteImageCacheKey,
  resetRemoteImageCacheForTests,
} from '@/services/remote-image-cache';

describe('remote image cache', () => {
  beforeEach(() => {
    mocks.files.clear();
    mocks.directories.clear();
    mocks.directories.add('/cache');
    mocks.imageSequence = 0;
    mocks.imageBytes = 64;
    mocks.animated = false;
    mocks.loadAsync.mockReset().mockImplementation(async () => ({
      isAnimated: mocks.animated,
      release: vi.fn(),
    }));
    mocks.manipulate.mockReset().mockImplementation(() => ({
      release: vi.fn(),
      renderAsync: async () => ({
        release: vi.fn(),
        saveAsync: async () => {
          const uri = `/cache/manipulated-${mocks.imageSequence += 1}.webp`;
          mocks.files.set(uri, { content: '', size: mocks.imageBytes, modified: Date.now() });
          return { uri, width: 100, height: 100 };
        },
      }),
    }));
    resetRemoteImageCacheForTests();
  });

  afterEach(async () => {
    await flushRemoteImageCacheManifest();
    resetRemoteImageCacheForTests();
  });

  it('normalizes headers and rejects local or array sources', () => {
    expect(normalizeRemoteImageSource({
      uri: 'https://example.test/cover.png',
      headers: { Z: '2', A: '1' },
    })?.source.headers).toEqual({ A: '1', Z: '2' });
    expect(normalizeRemoteImageSource('file:///cover.png')).toBeNull();
    expect(normalizeRemoteImageSource([{ uri: 'https://example.test/cover.png' }])).toBeNull();
  });

  it('builds stable keys from URL, headers, cache key, profile and cache version', async () => {
    const left = normalizeRemoteImageSource({
      uri: 'https://example.test/cover.png',
      cacheKey: 'song-1',
      headers: { Z: '2', A: '1' },
    });
    const right = normalizeRemoteImageSource({
      uri: 'https://example.test/cover.png',
      cacheKey: 'song-1',
      headers: { A: '1', Z: '2' },
    });
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    await expect(remoteImageCacheKey(left!, 'thumbnail')).resolves.toBe(
      await remoteImageCacheKey(right!, 'thumbnail'),
    );
    await expect(remoteImageCacheKey(left!, 'artwork')).resolves.not.toBe(
      await remoteImageCacheKey(left!, 'thumbnail'),
    );
  });

  it('deduplicates a cold transform and reuses the compressed file', async () => {
    const source = { uri: 'https://example.test/cover.png', headers: { A: '1' } };
    const [first, second] = await Promise.all([
      loadCompressedRemoteImage(source, 'thumbnail'),
      loadCompressedRemoteImage(source, 'thumbnail'),
    ]);
    expect(first?.source).toEqual(second?.source);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsync).toHaveBeenCalledWith(
      expect.objectContaining({ uri: source.uri }),
      { maxWidth: 512, maxHeight: 512 },
    );

    const cached = await loadCompressedRemoteImage(source, 'thumbnail');
    expect(cached?.source).toEqual(first?.source);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps animated images native without writing a static first frame', async () => {
    mocks.animated = true;
    const release = vi.fn();
    mocks.loadAsync.mockResolvedValueOnce({ isAnimated: true, release });
    const result = await loadCompressedRemoteImage('https://example.test/animated.webp', 'thumbnail');
    expect(result).toBeNull();
    expect(mocks.manipulate).not.toHaveBeenCalled();
    expect(Array.from(mocks.files.keys()).some((path) => path.endsWith('.webp'))).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('uses the artwork bounds and leaves no atomic temporary file behind', async () => {
    await loadCompressedRemoteImage('https://example.test/artwork.png', 'artwork');
    expect(mocks.loadAsync).toHaveBeenCalledWith(
      { uri: 'https://example.test/artwork.png' },
      { maxWidth: 1280, maxHeight: 1280 },
    );
    expect(Array.from(mocks.files.keys()).some((path) => path.endsWith('.part'))).toBe(false);
  });

  it('rebuilds a damaged index from cache files', async () => {
    const root = '/cache/rranker-remote-image-cache-v1';
    mocks.directories.add(root);
    mocks.files.set(`${root}/index.json`, { content: '{broken', size: 7, modified: 1 });
    mocks.files.set(`${root}/orphan.webp`, { content: '', size: 80, modified: 2 });
    resetRemoteImageCacheForTests();

    await expect(pruneRemoteImageCache(0)).resolves.toBeUndefined();
    expect(mocks.files.has(`${root}/orphan.webp`)).toBe(false);
  });

  it('does not leave a failed transform in the in-flight registry', async () => {
    mocks.manipulate.mockImplementationOnce(() => { throw new Error('unsupported image'); });
    const source = 'https://example.test/unknown.bin';
    await expect(loadCompressedRemoteImage(source, 'thumbnail')).rejects.toThrow('unsupported image');
    await expect(loadCompressedRemoteImage(source, 'thumbnail')).resolves.not.toBeNull();
    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);
  });

  it('prunes least recently used files to the requested budget and clears the cache', async () => {
    expect(REMOTE_IMAGE_CACHE_BUDGET_BYTES).toBe(256 * 1024 * 1024);
    await loadCompressedRemoteImage('https://example.test/1.png', 'thumbnail');
    await loadCompressedRemoteImage('https://example.test/2.png', 'thumbnail');
    await loadCompressedRemoteImage('https://example.test/3.png', 'thumbnail');
    await pruneRemoteImageCache(100);
    const cachedWebps = Array.from(mocks.files.keys()).filter((path) => path.includes('rranker-remote-image-cache-v1') && path.endsWith('.webp'));
    expect(cachedWebps).toHaveLength(1);

    await clearCompressedRemoteImageCache();
    expect(Array.from(mocks.files.keys()).some((path) => path.includes('rranker-remote-image-cache-v1'))).toBe(false);
  });
});
