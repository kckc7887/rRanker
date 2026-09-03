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
    static async downloadFileAsync(_url: string, destination: MockFile) {
      files.set(destination.uri, { content: '', size: 128, modified: Date.now() });
      return destination;
    }
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
    saveAsync: vi.fn(),
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
  REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES,
  REMOTE_IMAGE_CACHE_VERSION,
  cacheCompressedRemoteImage,
  calculateRemoteImageCacheQuotas,
  clearGameRemoteImageCache,
  clearCompressedRemoteImageCache,
  flushRemoteImageCacheManifest,
  findCompressedRemoteImage,
  listRemoteImageCacheUsage,
  markRemoteImageCacheGameActive,
  measureGameRemoteImageCacheBytes,
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
    mocks.saveAsync.mockReset().mockImplementation(async () => {
      const uri = `/cache/manipulated-${mocks.imageSequence += 1}.webp`;
      mocks.files.set(uri, { content: '', size: mocks.imageBytes, modified: Date.now() });
      return { uri, width: 100, height: 100 };
    });
    mocks.manipulate.mockReset().mockImplementation(() => {
      const context = {
        release: vi.fn(),
        resize: vi.fn(() => context),
        renderAsync: async () => ({
          release: vi.fn(),
          saveAsync: mocks.saveAsync,
        }),
      };
      return context;
    });
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
    await expect(remoteImageCacheKey(left!, { gameId: 'maimai', profile: 'thumbnail' })).resolves.toBe(
      await remoteImageCacheKey(right!, { gameId: 'maimai', profile: 'thumbnail' }),
    );
    await expect(remoteImageCacheKey(left!, { gameId: 'maimai', profile: 'artwork' })).resolves.not.toBe(
      await remoteImageCacheKey(left!, { gameId: 'maimai', profile: 'thumbnail' }),
    );
    await expect(remoteImageCacheKey(left!, { gameId: 'phigros', profile: 'thumbnail' })).resolves.not.toBe(
      await remoteImageCacheKey(left!, { gameId: 'maimai', profile: 'thumbnail' }),
    );
  });

  it('deduplicates a cold transform and reuses the compressed file', async () => {
    const source = { uri: 'https://example.test/cover.png', headers: { A: '1' } };
    const [first, second] = await Promise.all([
      cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' }),
      cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' }),
    ]);
    expect(first?.source).toEqual(second?.source);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsync).toHaveBeenCalledWith(
      expect.objectContaining({ uri: expect.stringContaining('.source.part') }),
      { maxWidth: 160, maxHeight: 160 },
    );
    expect(mocks.saveAsync).toHaveBeenCalledWith({ format: 'webp', compress: 0.5 });

    const cached = await findCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' });
    expect(cached?.source).toEqual(first?.source);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
  });

  it('checks for an existing fallback without downloading or transforming', async () => {
    await expect(findCompressedRemoteImage(
      'https://example.test/not-cached.png',
      { gameId: 'maimai', profile: 'thumbnail' },
    )).resolves.toBeNull();
    expect(mocks.loadAsync).not.toHaveBeenCalled();
    expect(mocks.manipulate).not.toHaveBeenCalled();
  });

  it('keeps animated images native without writing a static first frame', async () => {
    mocks.animated = true;
    const release = vi.fn();
    mocks.loadAsync.mockResolvedValueOnce({ isAnimated: true, release });
    const result = await cacheCompressedRemoteImage(
      'https://example.test/animated.webp',
      { gameId: 'maimai', profile: 'thumbnail' },
    );
    expect(result).toBeNull();
    expect(mocks.manipulate).not.toHaveBeenCalled();
    expect(Array.from(mocks.files.keys()).some((path) => path.endsWith('.webp'))).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('uses the artwork bounds and leaves no atomic temporary file behind', async () => {
    await cacheCompressedRemoteImage(
      'https://example.test/artwork.png',
      { gameId: 'phigros', profile: 'artwork' },
    );
    expect(mocks.loadAsync).toHaveBeenCalledWith(
      expect.objectContaining({ uri: expect.stringContaining('.source.part') }),
      { maxWidth: 320, maxHeight: 320 },
    );
    expect(mocks.saveAsync).toHaveBeenCalledWith({ format: 'webp', compress: 0.5 });
    expect(Array.from(mocks.files.keys()).some((path) => path.endsWith('.part'))).toBe(false);
  });

  it('rebuilds a damaged index from cache files', async () => {
    const root = '/cache/rranker-remote-image-cache-v2';
    mocks.directories.add(root);
    mocks.files.set(`${root}/index.json`, { content: '{broken', size: 7, modified: 1 });
    mocks.files.set(`${root}/orphan.webp`, { content: '', size: 80, modified: 2 });
    resetRemoteImageCacheForTests();

    await expect(pruneRemoteImageCache(0)).resolves.toBeUndefined();
    expect(mocks.files.has(`${root}/orphan.webp`)).toBe(false);
  });

  it('purges files owned by the previous manifest version', async () => {
    const root = '/cache/rranker-remote-image-cache-v2';
    mocks.directories.add(root);
    mocks.files.set(`${root}/index.json`, {
      content: JSON.stringify({
        version: 2,
        activeGameId: 'maimai',
        gameLastUsed: { maimai: 1 },
        entries: { old: { bytes: 80, gameId: 'maimai', lastAccess: 1 } },
      }),
      size: 120,
      modified: 1,
    });
    mocks.files.set(`${root}/old.webp`, { content: '', size: 80, modified: 2 });
    resetRemoteImageCacheForTests();
    await expect(listRemoteImageCacheUsage()).resolves.toEqual([]);
    expect(mocks.files.has(`${root}/old.webp`)).toBe(false);
  });

  it('restores a manifest within the 10 MiB hard limit', async () => {
    const root = '/cache/rranker-remote-image-cache-v2';
    mocks.directories.add(root);
    const entries = Object.fromEntries(Array.from({ length: 1025 }, (_, index) => {
      const cacheKey = `cover-${index}`;
      mocks.files.set(`${root}/${cacheKey}.webp`, {
        content: '',
        size: REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES,
        modified: index,
      });
      return [cacheKey, {
        bytes: REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES,
        gameId: 'maimai',
        lastAccess: index,
      }];
    }));
    const content = JSON.stringify({
      version: REMOTE_IMAGE_CACHE_VERSION,
      activeGameId: 'maimai',
      gameLastUsed: { maimai: 1 },
      entries,
    });
    mocks.files.set(`${root}/index.json`, { content, size: content.length, modified: 1 });
    resetRemoteImageCacheForTests();

    await expect(measureGameRemoteImageCacheBytes('maimai')).resolves.toBeLessThanOrEqual(
      REMOTE_IMAGE_CACHE_BUDGET_BYTES,
    );
    expect(mocks.files.has(`${root}/cover-0.webp`)).toBe(false);
    expect(mocks.files.has(`${root}/cover-1024.webp`)).toBe(true);
  });

  it('does not leave a failed transform in the in-flight registry', async () => {
    mocks.manipulate.mockImplementationOnce(() => { throw new Error('unsupported image'); });
    const source = 'https://example.test/unknown.bin';
    await expect(cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' })).rejects.toThrow('unsupported image');
    await expect(cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' })).resolves.not.toBeNull();
    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);
  });

  it('prunes least recently used files to the requested budget and clears the cache', async () => {
    expect(REMOTE_IMAGE_CACHE_BUDGET_BYTES).toBe(10 * 1024 * 1024);
    await cacheCompressedRemoteImage('https://example.test/1.png', { gameId: 'maimai', profile: 'thumbnail' });
    await cacheCompressedRemoteImage('https://example.test/2.png', { gameId: 'maimai', profile: 'thumbnail' });
    await cacheCompressedRemoteImage('https://example.test/3.png', { gameId: 'maimai', profile: 'thumbnail' });
    await pruneRemoteImageCache(100);
    const cachedWebps = Array.from(mocks.files.keys()).filter((path) => path.includes('rranker-remote-image-cache-v2') && path.endsWith('.webp'));
    expect(cachedWebps).toHaveLength(1);

    await clearCompressedRemoteImageCache();
    expect(Array.from(mocks.files.keys()).some((path) => path.includes('rranker-remote-image-cache-v2'))).toBe(false);
  });

  it('allocates 70 percent to the active game and linearly weights the remainder', () => {
    const budget = 1000;
    const quotas = calculateRemoteImageCacheQuotas([
      { gameId: 'maimai', bytes: 700, lastUsed: 30 },
      { gameId: 'phigros', bytes: 200, lastUsed: 20 },
      { gameId: 'chunithm', bytes: 100, lastUsed: 10 },
    ], 'maimai', budget);
    expect(quotas.get('maimai')).toBeCloseTo(700);
    expect(quotas.get('phigros')).toBeCloseTo(200);
    expect(quotas.get('chunithm')).toBeCloseTo(100);
  });

  it('lets over-budget games borrow unused soft quotas', () => {
    const quotas = calculateRemoteImageCacheQuotas([
      { gameId: 'maimai', bytes: 100, lastUsed: 30 },
      { gameId: 'phigros', bytes: 900, lastUsed: 20 },
    ], 'maimai', 1000);
    expect(quotas.get('maimai')).toBeCloseTo(700);
    expect(quotas.get('phigros')).toBeCloseTo(900);
  });

  it('measures and clears one game without deleting another game cover', async () => {
    mocks.imageBytes = 80;
    await cacheCompressedRemoteImage('https://example.test/shared.png', { gameId: 'maimai', profile: 'thumbnail' });
    await cacheCompressedRemoteImage('https://example.test/shared.png', { gameId: 'phigros', profile: 'thumbnail' });
    await expect(measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(80);
    await expect(measureGameRemoteImageCacheBytes('phigros')).resolves.toBe(80);

    await clearGameRemoteImageCache('maimai');
    await expect(measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(0);
    await expect(measureGameRemoteImageCacheBytes('phigros')).resolves.toBe(80);
  });

  it('restores game ownership and active-game recency from the manifest', async () => {
    await cacheCompressedRemoteImage('https://example.test/restart.png', { gameId: 'maimai', profile: 'thumbnail' });
    await markRemoteImageCacheGameActive('maimai');
    await flushRemoteImageCacheManifest();
    resetRemoteImageCacheForTests();

    await expect(measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(64);
    await expect(listRemoteImageCacheUsage()).resolves.toEqual([
      expect.objectContaining({ gameId: 'maimai', bytes: 64, active: true }),
    ]);
  });

  it('does not interrupt another game transform when one game is cleared', async () => {
    let finishRender: (() => void) | undefined;
    const renderGate = new Promise<void>((resolve) => { finishRender = resolve; });
    mocks.manipulate.mockImplementationOnce(() => ({
      release: vi.fn(),
      renderAsync: async () => {
        await renderGate;
        return { release: vi.fn(), saveAsync: mocks.saveAsync };
      },
    }));
    const pending = cacheCompressedRemoteImage(
      'https://example.test/phigros.png',
      { gameId: 'phigros', profile: 'thumbnail' },
    );
    await vi.waitFor(() => expect(mocks.manipulate).toHaveBeenCalledTimes(1));
    await clearGameRemoteImageCache('maimai');
    finishRender?.();
    await expect(pending).resolves.not.toBeNull();
    await expect(measureGameRemoteImageCacheBytes('phigros')).resolves.toBe(64);
  });

  it('does not persist an image when every compression candidate exceeds 10 KiB', async () => {
    mocks.imageBytes = REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES + 1;
    await expect(cacheCompressedRemoteImage(
      'https://example.test/large.png',
      { gameId: 'maimai', profile: 'thumbnail' },
    )).resolves.toBeNull();
    expect(mocks.saveAsync).toHaveBeenCalledTimes(5);
    expect(Array.from(mocks.files.keys()).some((path) => path.endsWith('.webp'))).toBe(false);
  });

  it('stops a queued transform when its caller aborts', async () => {
    let finishRender: (() => void) | undefined;
    const renderGate = new Promise<void>((resolve) => { finishRender = resolve; });
    mocks.manipulate.mockImplementationOnce(() => ({
      release: vi.fn(),
      renderAsync: async () => {
        await renderGate;
        return { release: vi.fn(), saveAsync: mocks.saveAsync };
      },
    }));
    const first = cacheCompressedRemoteImage(
      'https://example.test/first.png',
      { gameId: 'maimai', profile: 'thumbnail' },
    );
    await vi.waitFor(() => expect(mocks.manipulate).toHaveBeenCalledTimes(1));
    const controller = new AbortController();
    const second = cacheCompressedRemoteImage(
      'https://example.test/second.png',
      { gameId: 'maimai', profile: 'thumbnail' },
      controller.signal,
    );
    controller.abort();
    finishRender?.();
    await expect(first).resolves.not.toBeNull();
    await expect(second).resolves.toBeNull();
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
  });
});
