import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

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

vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: async (uri: string) => {
    const file = mocks.files.get(uri);
    return file ? { exists: true, isDirectory: false, size: file.size, modificationTime: file.modified / 1000 }
      : { exists: mocks.directories.has(uri), isDirectory: true, size: 0, modificationTime: 0 };
  },
  makeDirectoryAsync: async (uri: string) => { mocks.directories.add(uri); },
  readDirectoryAsync: async (uri: string) => new mocks.MockDirectory(uri).list().map(file => file.name),
  deleteAsync: async (uri: string) => {
    new mocks.MockDirectory(uri).delete();
    mocks.files.delete(uri);
  },
  writeAsStringAsync: async (uri: string, content: string) => new mocks.MockFile(uri).write(content),
  moveAsync: async ({ from, to }: { from: string; to: string }) => new mocks.MockFile(from).move(new mocks.MockFile(to)),
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

let cache: typeof import('@/services/remote-image-cache');
async function reloadCache() {
  vi.resetModules();
  cache = await import('@/services/remote-image-cache');
}

describe('remote image cache', () => {
  it('reports a deferred manifest write failure through flush and allows the next write to recover', async () => {
    vi.useFakeTimers();
    const write = vi.spyOn(mocks.MockFile.prototype, 'write').mockRejectedValueOnce(new Error('disk full'));
    try {
      await cache.markRemoteImageCacheGameActive('maimai');
      await vi.advanceTimersByTimeAsync(1000);
      await expect(cache.flushRemoteImageCacheManifest()).rejects.toThrow('disk full');
      await cache.markRemoteImageCacheGameActive('phigros');
      await expect(cache.flushRemoteImageCacheManifest()).resolves.toBeUndefined();
    } finally { write.mockRestore(); vi.useRealTimers(); }
  });
  it('preserves cached files on manifest I/O failure and retries the read', async () => {
    await cache.cacheCompressedRemoteImage('https://example.test/keep.png', { gameId: 'maimai', profile: 'thumbnail' });
    await cache.flushRemoteImageCacheManifest();
    await reloadCache();
    const before = new Map(mocks.files);
    const read = vi.spyOn(mocks.MockFile.prototype, 'text').mockRejectedValueOnce(new Error('storage unavailable'));
    try {
      await expect(cache.listRemoteImageCacheUsage()).rejects.toThrow('storage unavailable');
      expect(mocks.files).toEqual(before);
      await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(64);
    } finally { read.mockRestore(); }
  });
  beforeEach(async () => {
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
    await reloadCache();
  });

  afterEach(async () => {
    await cache.flushRemoteImageCacheManifest();
  });

  it('normalizes headers and rejects local or array sources', () => {
    expect(cache.normalizeRemoteImageSource({
      uri: 'https://example.test/cover.png',
      headers: { Z: '2', A: '1' },
    })?.source.headers).toEqual({ A: '1', Z: '2' });
    expect(cache.normalizeRemoteImageSource('file:///cover.png')).toBeNull();
    expect(cache.normalizeRemoteImageSource([{ uri: 'https://example.test/cover.png' }])).toBeNull();
  });

  it('leaves bundled module IDs outside remote download and compression', async () => {
    const source = 73;
    const download = vi.spyOn(mocks.MockFile, 'downloadFileAsync');
    try {
      expect(cache.normalizeRemoteImageSource(source)).toBeNull();
      await expect(cache.findCompressedRemoteImage(source, { gameId: 'adofai', profile: 'thumbnail' }))
        .resolves.toBeNull();
      await expect(cache.cacheCompressedRemoteImage(source, { gameId: 'adofai', profile: 'thumbnail' }))
        .resolves.toBeNull();
      expect(download).not.toHaveBeenCalled();
      expect(mocks.loadAsync).not.toHaveBeenCalled();
      expect(mocks.manipulate).not.toHaveBeenCalled();
      expect(mocks.files.size).toBe(0);
    } finally {
      download.mockRestore();
    }
  });

  it('builds stable keys from URL, headers, cache key, profile and cache version', async () => {
    const left = cache.normalizeRemoteImageSource({
      uri: 'https://example.test/cover.png',
      cacheKey: 'song-1',
      headers: { Z: '2', A: '1' },
    });
    const right = cache.normalizeRemoteImageSource({
      uri: 'https://example.test/cover.png',
      cacheKey: 'song-1',
      headers: { A: '1', Z: '2' },
    });
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    await expect(cache.remoteImageCacheKey(left!, { gameId: 'maimai', profile: 'thumbnail' })).resolves.toBe(
      await cache.remoteImageCacheKey(right!, { gameId: 'maimai', profile: 'thumbnail' }),
    );
    await expect(cache.remoteImageCacheKey(left!, { gameId: 'maimai', profile: 'artwork' })).resolves.not.toBe(
      await cache.remoteImageCacheKey(left!, { gameId: 'maimai', profile: 'thumbnail' }),
    );
    await expect(cache.remoteImageCacheKey(left!, { gameId: 'phigros', profile: 'thumbnail' })).resolves.not.toBe(
      await cache.remoteImageCacheKey(left!, { gameId: 'maimai', profile: 'thumbnail' }),
    );
  });

  it('deduplicates a cold transform and reuses the compressed file', async () => {
    const source = { uri: 'https://example.test/cover.png', headers: { A: '1' } };
    const [first, second] = await Promise.all([
      cache.cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' }),
      cache.cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' }),
    ]);
    expect(first?.source).toEqual(second?.source);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsync).toHaveBeenCalledWith(
      expect.objectContaining({ uri: expect.stringContaining('.source.part') }),
      { maxWidth: 160, maxHeight: 160 },
    );
    expect(mocks.saveAsync).toHaveBeenCalledWith({ format: 'webp', compress: 0.5 });

    const cached = await cache.findCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' });
    expect(cached?.source).toEqual(first?.source);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
  });

  it('checks for an existing fallback without downloading or transforming', async () => {
    await expect(cache.findCompressedRemoteImage(
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
    const result = await cache.cacheCompressedRemoteImage(
      'https://example.test/animated.webp',
      { gameId: 'maimai', profile: 'thumbnail' },
    );
    expect(result).toBeNull();
    expect(mocks.manipulate).not.toHaveBeenCalled();
    expect(Array.from(mocks.files.keys()).some((path) => path.endsWith('.webp'))).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('uses the artwork bounds and leaves no atomic temporary file behind', async () => {
    await cache.cacheCompressedRemoteImage(
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
    await reloadCache();

    await expect(cache.pruneRemoteImageCache(0)).resolves.toBeUndefined();
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
    await reloadCache();
    await expect(cache.listRemoteImageCacheUsage()).resolves.toEqual([]);
    expect(mocks.files.has(`${root}/old.webp`)).toBe(false);
  });

  it('restores a manifest within the 10 MiB hard limit', async () => {
    const root = '/cache/rranker-remote-image-cache-v2';
    mocks.directories.add(root);
    const entries = Object.fromEntries(Array.from({ length: 1025 }, (_, index) => {
      const cacheKey = `cover-${index}`;
      mocks.files.set(`${root}/${cacheKey}.webp`, {
        content: '',
        size: cache.REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES,
        modified: index,
      });
      return [cacheKey, {
        bytes: cache.REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES,
        gameId: 'maimai',
        lastAccess: index,
      }];
    }));
    const content = JSON.stringify({
      version: cache.REMOTE_IMAGE_CACHE_VERSION,
      activeGameId: 'maimai',
      gameLastUsed: { maimai: 1 },
      entries,
    });
    mocks.files.set(`${root}/index.json`, { content, size: content.length, modified: 1 });
    await reloadCache();

    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBeLessThanOrEqual(
      cache.REMOTE_IMAGE_CACHE_BUDGET_BYTES,
    );
    expect(mocks.files.has(`${root}/cover-0.webp`)).toBe(false);
    expect(mocks.files.has(`${root}/cover-1024.webp`)).toBe(true);
  });

  it('does not leave a failed transform in the in-flight registry', async () => {
    mocks.manipulate.mockImplementationOnce(() => { throw new Error('unsupported image'); });
    const source = 'https://example.test/unknown.bin';
    await expect(cache.cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' })).rejects.toThrow('unsupported image');
    await expect(cache.cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' })).resolves.not.toBeNull();
    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);
  });

  it('prunes least recently used files to the requested budget and clears the cache', async () => {
    expect(cache.REMOTE_IMAGE_CACHE_BUDGET_BYTES).toBe(10 * 1024 * 1024);
    await cache.cacheCompressedRemoteImage('https://example.test/1.png', { gameId: 'maimai', profile: 'thumbnail' });
    await cache.cacheCompressedRemoteImage('https://example.test/2.png', { gameId: 'maimai', profile: 'thumbnail' });
    await cache.cacheCompressedRemoteImage('https://example.test/3.png', { gameId: 'maimai', profile: 'thumbnail' });
    await cache.pruneRemoteImageCache(100);
    const cachedWebps = Array.from(mocks.files.keys()).filter((path) => path.includes('rranker-remote-image-cache-v2') && path.endsWith('.webp'));
    expect(cachedWebps).toHaveLength(1);

    await cache.clearCompressedRemoteImageCache();
    expect(Array.from(mocks.files.keys()).some((path) => path.includes('rranker-remote-image-cache-v2'))).toBe(false);
  });

  it('allocates 70 percent to the active game and linearly weights the remainder', () => {
    const budget = 1000;
    const quotas = cache.calculateRemoteImageCacheQuotas([
      { gameId: 'maimai', bytes: 700, lastUsed: 30 },
      { gameId: 'phigros', bytes: 200, lastUsed: 20 },
      { gameId: 'chunithm', bytes: 100, lastUsed: 10 },
    ], 'maimai', budget);
    expect(quotas.get('maimai')).toBeCloseTo(700);
    expect(quotas.get('phigros')).toBeCloseTo(200);
    expect(quotas.get('chunithm')).toBeCloseTo(100);
  });

  it('lets over-budget games borrow unused soft quotas', () => {
    const quotas = cache.calculateRemoteImageCacheQuotas([
      { gameId: 'maimai', bytes: 100, lastUsed: 30 },
      { gameId: 'phigros', bytes: 900, lastUsed: 20 },
    ], 'maimai', 1000);
    expect(quotas.get('maimai')).toBeCloseTo(700);
    expect(quotas.get('phigros')).toBeCloseTo(900);
  });

  it('measures and clears one game without deleting another game cover', async () => {
    mocks.imageBytes = 80;
    await cache.cacheCompressedRemoteImage('https://example.test/shared.png', { gameId: 'maimai', profile: 'thumbnail' });
    await cache.cacheCompressedRemoteImage('https://example.test/shared.png', { gameId: 'phigros', profile: 'thumbnail' });
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(80);
    await expect(cache.measureGameRemoteImageCacheBytes('phigros')).resolves.toBe(80);

    await cache.clearGameRemoteImageCache('maimai');
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(0);
    await expect(cache.measureGameRemoteImageCacheBytes('phigros')).resolves.toBe(80);
  });

  it('restores game ownership and active-game recency from the manifest', async () => {
    await cache.cacheCompressedRemoteImage('https://example.test/restart.png', { gameId: 'maimai', profile: 'thumbnail' });
    await cache.markRemoteImageCacheGameActive('maimai');
    await cache.flushRemoteImageCacheManifest();

    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(64);
    await expect(cache.listRemoteImageCacheUsage()).resolves.toEqual([
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
    const pending = cache.cacheCompressedRemoteImage(
      'https://example.test/phigros.png',
      { gameId: 'phigros', profile: 'thumbnail' },
    );
    await vi.waitFor(() => expect(mocks.manipulate).toHaveBeenCalledTimes(1));
    await cache.clearGameRemoteImageCache('maimai');
    finishRender?.();
    await expect(pending).resolves.not.toBeNull();
    await expect(cache.measureGameRemoteImageCacheBytes('phigros')).resolves.toBe(64);
  });

  it('does not persist an image when every compression candidate exceeds 10 KiB', async () => {
    mocks.imageBytes = cache.REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES + 1;
    await expect(cache.cacheCompressedRemoteImage(
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
    const first = cache.cacheCompressedRemoteImage(
      'https://example.test/first.png',
      { gameId: 'maimai', profile: 'thumbnail' },
    );
    await vi.waitFor(() => expect(mocks.manipulate).toHaveBeenCalledTimes(1));
    const controller = new AbortController();
    const second = cache.cacheCompressedRemoteImage(
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
  it('shares one transform without letting the first consumer cancel the second', async () => {
    const gate = Promise.withResolvers<void>();
    mocks.manipulate.mockImplementationOnce(() => ({
      release: vi.fn(), renderAsync: async () => {
        await gate.promise; return { release: vi.fn(), saveAsync: mocks.saveAsync };
      },
    }));
    const controller = new AbortController();
    const options = { gameId: 'maimai', profile: 'thumbnail' as const };
    const first = cache.cacheCompressedRemoteImage('https://example.test/shared.png', options, controller.signal);
    const second = cache.cacheCompressedRemoteImage('https://example.test/shared.png', options);
    await vi.waitFor(() => expect(mocks.manipulate).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(first).resolves.toBeNull();
    gate.resolve();
    await expect(second).resolves.not.toBeNull();
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
    expect(mocks.saveAsync).toHaveBeenCalledTimes(1);
  });

  it('does not recreate a cleared game cache when an old native transform finishes', async () => {
    const gate = Promise.withResolvers<void>();
    mocks.manipulate.mockImplementationOnce(() => ({
      release: vi.fn(), renderAsync: async () => {
        await gate.promise; return { release: vi.fn(), saveAsync: mocks.saveAsync };
      },
    }));
    const pending = cache.cacheCompressedRemoteImage('https://example.test/late.png', { gameId: 'maimai', profile: 'thumbnail' });
    await vi.waitFor(() => expect(mocks.manipulate).toHaveBeenCalledTimes(1));
    await cache.clearGameRemoteImageCache('maimai');
    gate.resolve();
    await expect(pending).resolves.toBeNull();
    expect(await cache.measureGameRemoteImageCacheBytes('maimai')).toBe(0);
    expect([...mocks.files.keys()].filter((path) => path.endsWith('.webp') || path.endsWith('.part'))).toEqual([]);
  });

  it.each(['game', 'all'] as const)('orders %s clearing after an in-flight publish and preserves the next request', async (scope) => {
    const fileSystem = await import('expo-file-system/legacy');
    const moveFile = fileSystem.moveAsync;
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    let held = false;
    const move = vi.spyOn(fileSystem, 'moveAsync').mockImplementation(async options => {
      if (!held && options.to.endsWith('.webp')) {
        held = true;
        entered.resolve();
        await resume.promise;
      }
      await moveFile(options);
    });
    const source = 'https://example.test/publishing.png';
    const options = { gameId: 'maimai', profile: 'thumbnail' as const };
    try {
      const previous = cache.cacheCompressedRemoteImage(source, options);
      await entered.promise;
      const clearing = scope === 'all' ? cache.clearCompressedRemoteImageCache() : cache.clearGameRemoteImageCache('maimai');
      const next = cache.cacheCompressedRemoteImage(source, options);
      resume.resolve();
      await expect(previous).resolves.toBeNull();
      await clearing;
      const result = await next;
      expect(result).not.toBeNull();
      await expect(cache.findCompressedRemoteImage(source, options)).resolves.toEqual(result);
      expect([...mocks.files.keys()].filter(path => path.endsWith('.webp'))).toEqual([result!.fileUri]);
      expect([...mocks.files.keys()].filter(path => path.endsWith('.part'))).toEqual([]);
    } finally { resume.resolve(); move.mockRestore(); }
  });

});
