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
    download: vi.fn<(url: string, uri: string, options: { headers?: Record<string, string> }) => Promise<{ uri: string; status: number } | undefined>>(),
    cancelDownload: vi.fn<() => Promise<void>>(),
  };
});

vi.mock('expo-file-system', () => ({
  Directory: mocks.MockDirectory,
  File: mocks.MockFile,
  Paths: mocks.paths,
}));

vi.mock('expo-file-system/legacy', () => ({
  createDownloadResumable: (url: string, uri: string, options: { headers?: Record<string, string> }) => ({
    downloadAsync: () => mocks.download(url, uri, options),
    cancelAsync: () => mocks.cancelDownload(),
  }),
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
      await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(192);
    } finally { read.mockRestore(); }
  });
  beforeEach(async () => {
    mocks.files.clear();
    mocks.directories.clear();
    mocks.directories.add('/cache');
    mocks.imageSequence = 0;
    mocks.imageBytes = 64;
    mocks.animated = false;
    mocks.download.mockReset().mockImplementation(async (_url, uri) => {
      mocks.files.set(uri, { content: 'original bytes', size: 128, modified: Date.now() });
      return { uri, status: 200 };
    });
    mocks.cancelDownload.mockReset().mockResolvedValue();
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

  it('rejects native cache path failures and allows the next request to recover', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(mocks.paths, 'cache')!;
    Object.defineProperty(mocks.paths, 'cache', {
      configurable: true,
      get() { throw new Error('cache directory unavailable'); },
    });
    try {
      await expect(cache.acquireRemoteImageOriginal('https://example.test/cover.png', 'maimai'))
        .rejects.toThrow('cache directory unavailable');
    } finally {
      Object.defineProperty(mocks.paths, 'cache', descriptor);
    }
    const original = await cache.acquireRemoteImageOriginal('https://example.test/cover.png', 'maimai');
    expect(mocks.files.get(original.fileUri)?.content).toBe('original bytes');
    await original.release();
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
      expect(cache.normalizeRemoteImageSource(source)).toBeNull();
      await expect(cache.findCompressedRemoteImage(source, { gameId: 'adofai', profile: 'thumbnail' }))
        .resolves.toBeNull();
      await expect(cache.cacheCompressedRemoteImage(source, { gameId: 'adofai', profile: 'thumbnail' }))
        .resolves.toBeNull();
      expect(mocks.download).not.toHaveBeenCalled();
      expect(mocks.loadAsync).not.toHaveBeenCalled();
      expect(mocks.manipulate).not.toHaveBeenCalled();
      expect(mocks.files.size).toBe(0);
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
      expect.objectContaining({ uri: expect.any(String) }),
      { maxWidth: 160, maxHeight: 160 },
    );
    expect(mocks.saveAsync).toHaveBeenCalledWith({ format: 'webp', compress: 0.5 });

    const cached = await cache.findCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' });
    expect(cached?.source).toEqual(first?.source);
    expect(mocks.loadAsync).toHaveBeenCalledTimes(1);
  });

  it.each(['findCompressedRemoteImage', 'cacheCompressedRemoteImage'] as const)(
    'lets the next cover load before an abandoned %s file read completes', async method => {
      const options = { gameId: 'maimai', profile: 'thumbnail' } as const;
      const sources = ['https://example.test/first.png', 'https://example.test/abandoned.png', 'https://example.test/visible.png'];
      const covers: Awaited<ReturnType<typeof cache.cacheCompressedRemoteImage>>[] = [];
      for (const source of sources) covers.push(await cache.cacheCompressedRemoteImage(source, options));
      await cache.flushRemoteImageCacheManifest();
      const entered = Promise.withResolvers<void>();
      const resumeFirst = Promise.withResolvers<void>();
      const resumeAbandoned = Promise.withResolvers<void>();
      const fileSystem = await import('expo-file-system/legacy');
      const readInfo = fileSystem.getInfoAsync;
      const read = vi.spyOn(fileSystem, 'getInfoAsync').mockImplementation(async (uri, settings) => {
        if (uri === covers[0]!.fileUri) { entered.resolve(); await resumeFirst.promise; }
        if (uri === covers[1]!.fileUri) await resumeAbandoned.promise;
        return readInfo(uri, settings);
      });
      const pending: Promise<unknown>[] = [];
      try {
        pending.push(cache.findCompressedRemoteImage(sources[0], options));
        await entered.promise;
        const controller = new AbortController();
        const abandoned = cache[method](sources[1], options, controller.signal);
        let visible: Awaited<ReturnType<typeof cache.findCompressedRemoteImage>> = null;
        const current = cache.findCompressedRemoteImage(sources[2], options).then(result => { visible = result; });
        pending.push(abandoned, current);
        await new Promise(resolve => setImmediate(resolve));
        controller.abort();
        resumeFirst.resolve();
        await vi.waitFor(() => expect(visible).toEqual(covers[2]));
        await expect(abandoned).resolves.toBeNull();
        expect(mocks.files.has(covers[1]!.fileUri)).toBe(true);
      } finally {
        resumeFirst.resolve();
        resumeAbandoned.resolve();
        await Promise.allSettled(pending);
        read.mockRestore();
      }
    },
  );

  it.each(['findCompressedRemoteImage', 'cacheCompressedRemoteImage'] as const)(
    'preserves cached files when %s is cancelled before or during a read', async method => {
      const source = 'https://example.test/cancelled-read.png';
      const options = { gameId: 'maimai', profile: 'thumbnail' } as const;
      const cached = await cache.cacheCompressedRemoteImage(source, options);
      const cancelled = new AbortController();
      cancelled.abort();
      await expect(cache[method](source, options, cancelled.signal)).resolves.toBeNull();
      const entered = Promise.withResolvers<void>();
      const resume = Promise.withResolvers<void>();
      const fileSystem = await import('expo-file-system/legacy');
      const readInfo = fileSystem.getInfoAsync;
      const read = vi.spyOn(fileSystem, 'getInfoAsync').mockImplementationOnce(async (uri, settings) => {
        entered.resolve();
        await resume.promise;
        return readInfo(uri, settings);
      });
      try {
        const controller = new AbortController();
        const pending = cache[method](source, options, controller.signal);
        await entered.promise;
        controller.abort();
        resume.resolve();
        await expect(pending).resolves.toBeNull();
        read.mockRejectedValueOnce(new Error('storage unavailable'));
        await expect(cache[method](source, options)).rejects.toThrow('storage unavailable');
        await expect(cache[method](source, options)).resolves.toEqual(cached);
        await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(192);
      } finally { resume.resolve(); read.mockRestore(); }
    },
  );

  it('shares original bytes between display and compression and reuses the file after release', async () => {
    const source = { uri: 'https://example.test/shared-original.png', headers: { Z: 'last', Authorization: 'token' }, cacheKey: 'revision-1' };
    const first = await cache.acquireRemoteImageOriginal(source, 'maimai');
    const second = await cache.acquireRemoteImageOriginal({ ...source, headers: { Authorization: 'token', Z: 'last' } }, 'maimai');
    expect(second.fileUri).toBe(first.fileUri);
    expect(mocks.files.get(first.fileUri)?.content).toBe('original bytes');
    await cache.pruneRemoteImageCache();
    expect(mocks.files.has(first.fileUri)).toBe(true);
    const compressed = await Promise.all([
      cache.cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' }),
      cache.cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'artwork' }),
    ]);
    expect(compressed.every(Boolean)).toBe(true);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.download).toHaveBeenCalledWith(source.uri, expect.any(String), { headers: source.headers });
    for (const [loadedSource] of mocks.loadAsync.mock.calls) expect(loadedSource).toEqual({ uri: first.fileUri });
    await first.release();
    expect(mocks.files.has(first.fileUri)).toBe(true);
    await second.release();
    expect(mocks.files.has(first.fileUri)).toBe(true);
    mocks.download.mockRejectedValueOnce(new Error('network unavailable'));
    const reopened = await cache.acquireRemoteImageOriginal(source, 'maimai');
    expect(reopened.fileUri).toBe(first.fileUri);
    expect(mocks.files.get(reopened.fileUri)?.content).toBe('original bytes');
    await reopened.release();
  });

  it('separates original downloads by game, URL, headers and cache identity', async () => {
    const source = { uri: 'https://example.test/original.png', headers: { Authorization: 'one' }, cacheKey: 'v1' };
    const results = await Promise.all([
      cache.acquireRemoteImageOriginal(source, 'maimai'),
      cache.acquireRemoteImageOriginal(source, 'phigros'),
      cache.acquireRemoteImageOriginal({ ...source, uri: `${source.uri}?second` }, 'maimai'),
      cache.acquireRemoteImageOriginal({ ...source, headers: { Authorization: 'two' } }, 'maimai'),
      cache.acquireRemoteImageOriginal({ ...source, cacheKey: 'v2' }, 'maimai'),
    ]);
    expect(new Set(results.map(result => result.fileUri)).size).toBe(5);
    expect(mocks.download).toHaveBeenCalledTimes(5);
    await Promise.all(results.map(result => result.release()));
    expect([...mocks.files.keys()].filter(uri => uri.endsWith('.source.part'))).toEqual([]);
  });

  it('serves initialized original and compressed caches when directory writes are unavailable', async () => {
    const source = 'https://example.test/read-only-cache.png';
    const options = { gameId: 'maimai', profile: 'thumbnail' as const };
    const compressed = await cache.cacheCompressedRemoteImage(source, options);
    const first = await cache.acquireRemoteImageOriginal(source, 'maimai');
    await first.release();
    await cache.flushRemoteImageCacheManifest();
    const fileSystem = await import('expo-file-system/legacy');
    const directory = vi.spyOn(fileSystem, 'makeDirectoryAsync').mockRejectedValue(new Error('directory writes unavailable'));
    mocks.download.mockRejectedValue(new Error('offline'));
    try {
      await expect(cache.findCompressedRemoteImage(source, options)).resolves.toEqual(compressed);
      const reopened = await cache.acquireRemoteImageOriginal(source, 'maimai');
      expect(reopened.fileUri).toBe(first.fileUri);
      expect(mocks.files.get(reopened.fileUri)?.content).toBe('original bytes');
      await expect(reopened.release()).resolves.toBeUndefined();
    } finally { directory.mockRestore(); }
  });

  it('keeps a long-held original recent when the next download exceeds capacity', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const bytes = 20 * 1024 * 1024;
    mocks.download.mockImplementation(async (url, uri) => {
      mocks.files.set(uri, { content: url, size: bytes, modified: Date.now() });
      return { uri, status: 200 };
    });
    try {
      const held = await cache.acquireRemoteImageOriginal('https://example.test/long-held.png', 'maimai');
      now.mockReturnValue(2000);
      const other = await cache.acquireRemoteImageOriginal('https://example.test/other.png', 'maimai');
      await other.release();
      now.mockReturnValue(3000);
      await held.release();
      now.mockReturnValue(4000);
      const newest = await cache.acquireRemoteImageOriginal('https://example.test/newest.png', 'maimai');
      expect(mocks.files.get(held.fileUri)?.content).toBe('https://example.test/long-held.png');
      expect(mocks.files.has(other.fileUri)).toBe(false);
      expect(mocks.files.get(newest.fileUri)?.content).toBe('https://example.test/newest.png');
      await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(2 * bytes);
      await newest.release();
    } finally { now.mockRestore(); }
  });

  it('retries after the last consumer cancels while the download directory is being prepared', async () => {
    await cache.listRemoteImageCacheUsage();
    const fileSystem = await import('expo-file-system/legacy');
    const makeDirectory = fileSystem.makeDirectoryAsync;
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const directory = vi.spyOn(fileSystem, 'makeDirectoryAsync').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await resume.promise;
      await makeDirectory(...args);
    });
    const source = 'https://example.test/cancel-before-download.png';
    const controller = new AbortController();
    try {
      const pending = cache.acquireRemoteImageOriginal(source, 'maimai', controller.signal);
      const rejected = expect(pending).rejects.toThrow();
      await entered.promise;
      controller.abort();
      await rejected;
      const reopening = cache.acquireRemoteImageOriginal(source, 'maimai');
      resume.resolve();
      const original = await reopening;
      expect(mocks.files.get(original.fileUri)?.content).toBe('original bytes');
      await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(128);
      await original.release();
      mocks.download.mockRejectedValue(new Error('offline'));
      const restored = await cache.acquireRemoteImageOriginal(source, 'maimai');
      expect(restored.fileUri).toBe(original.fileUri);
      await restored.release();
    } finally { resume.resolve(); directory.mockRestore(); }
  });

  it('cancels one waiting display consumer without cancelling the other', async () => {
    const gate = Promise.withResolvers<void>();
    const download = mocks.download.getMockImplementation()!;
    mocks.download.mockImplementationOnce(async (...args) => { await gate.promise; return download(...args); });
    const controller = new AbortController();
    const first = cache.acquireRemoteImageOriginal('https://example.test/shared-wait.png', 'maimai', controller.signal);
    const rejected = expect(first).rejects.toThrow();
    const second = cache.acquireRemoteImageOriginal({ uri: 'https://example.test/shared-wait.png' }, 'maimai');
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    controller.abort();
    await rejected;
    expect(mocks.cancelDownload).not.toHaveBeenCalled();
    gate.resolve();
    const original = await second;
    expect(mocks.files.has(original.fileUri)).toBe(true);
    await original.release();
    expect(mocks.files.has(original.fileUri)).toBe(true);
  });

  it('cancels the last waiting consumer and removes its late file without deleting a newer request', async () => {
    const gate = Promise.withResolvers<void>();
    const written = Promise.withResolvers<void>();
    const download = mocks.download.getMockImplementation()!;
    mocks.download.mockImplementationOnce(async (...args) => {
      await gate.promise;
      const result = await download(...args);
      written.resolve();
      return result;
    });
    const controller = new AbortController();
    const source = 'https://example.test/late-original.png';
    const first = cache.acquireRemoteImageOriginal(source, 'maimai', controller.signal);
    const rejected = expect(first).rejects.toThrow();
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    const oldUri = mocks.download.mock.calls[0][1];
    controller.abort();
    await rejected;
    expect(mocks.cancelDownload).toHaveBeenCalledTimes(1);
    const next = await cache.acquireRemoteImageOriginal(source, 'maimai');
    expect(next.fileUri).not.toBe(oldUri);
    gate.resolve();
    await written.promise;
    await vi.waitFor(() => expect(mocks.files.has(oldUri)).toBe(false));
    await cache.listRemoteImageCacheUsage();
    expect(mocks.files.has(next.fileUri)).toBe(true);
    await next.release();
  });

  it('keeps the source alive until native decoding finishes after the compressor is cancelled', async () => {
    const gate = Promise.withResolvers<void>();
    let decodingUri = '';
    mocks.loadAsync.mockImplementationOnce(async ({ uri }: { uri: string }) => {
      decodingUri = uri;
      await gate.promise;
      expect(mocks.files.has(uri)).toBe(true);
      return { isAnimated: false, release: vi.fn() };
    });
    const controller = new AbortController();
    const pending = cache.cacheCompressedRemoteImage('https://example.test/decoding.png', { gameId: 'maimai', profile: 'thumbnail' }, controller.signal);
    await vi.waitFor(() => expect(decodingUri).not.toBe(''));
    controller.abort();
    await expect(pending).resolves.toBeNull();
    expect(mocks.files.has(decodingUri)).toBe(true);
    gate.resolve();
    const reopened = await cache.acquireRemoteImageOriginal('https://example.test/decoding.png', 'maimai');
    expect(reopened.fileUri).toBe(decodingUri);
    await reopened.release();
    expect(mocks.manipulate).not.toHaveBeenCalled();
  });

  it.each(['game', 'all'] as const)('preserves a displayed original during %s clearing while rejecting the old compression', async scope => {
    const source = 'https://example.test/visible-during-clear.png';
    const options = { gameId: 'maimai', profile: 'thumbnail' as const };
    const original = await cache.acquireRemoteImageOriginal(source, 'maimai');
    const gate = Promise.withResolvers<void>();
    mocks.manipulate.mockImplementationOnce(() => ({
      release: vi.fn(), renderAsync: async () => {
        await gate.promise; return { release: vi.fn(), saveAsync: mocks.saveAsync };
      },
    }));
    const pending = cache.cacheCompressedRemoteImage(source, options);
    await vi.waitFor(() => expect(mocks.manipulate).toHaveBeenCalledTimes(1));
    await (scope === 'game' ? cache.clearGameRemoteImageCache('maimai') : cache.clearCompressedRemoteImageCache());
    expect(mocks.files.get(original.fileUri)?.content).toBe('original bytes');
    gate.resolve();
    await expect(pending).resolves.toBeNull();
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(0);
    expect(mocks.files.has(original.fileUri)).toBe(true);
    await expect(cache.cacheCompressedRemoteImage(source, options)).resolves.not.toBeNull();
    expect(mocks.download).toHaveBeenCalledTimes(2);
    await original.release();
    expect(mocks.files.has(original.fileUri)).toBe(false);
  });

  it.each(['game', 'all'] as const)('uses newly downloaded bytes after %s clearing instead of a late original from the previous generation', async scope => {
    const gate = Promise.withResolvers<void>();
    mocks.download.mockImplementationOnce(async (_url, uri) => {
      await gate.promise;
      mocks.files.set(uri, { content: 'old bytes', size: 9, modified: Date.now() });
      return { uri, status: 200 };
    });
    const source = 'https://example.test/changed-after-clear.png';
    const previous = cache.acquireRemoteImageOriginal(source, 'maimai');
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    await (scope === 'game' ? cache.clearGameRemoteImageCache('maimai') : cache.clearCompressedRemoteImageCache());
    const next = await cache.acquireRemoteImageOriginal(source, 'maimai');
    const decoded: string[] = [];
    mocks.loadAsync.mockImplementation(async ({ uri }: { uri: string }) => {
      decoded.push(mocks.files.get(uri)!.content);
      return { isAnimated: false, release: vi.fn() };
    });
    const compressed = await cache.cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' });
    expect(compressed).not.toBeNull();
    expect(decoded).toEqual(['original bytes']);
    gate.resolve();
    const old = await previous;
    expect(mocks.files.get(old.fileUri)?.content).toBe('old bytes');
    expect(mocks.files.get(next.fileUri)?.content).toBe('original bytes');
    await old.invalidate();
    await old.release();
    expect(mocks.files.has(next.fileUri)).toBe(true);
    await expect(cache.findCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' })).resolves.toEqual(compressed);
    await next.release();
  });

  it('releases a failed original download and allows retry without retaining the response body', async () => {
    mocks.download.mockImplementationOnce(async (_url, uri) => {
      mocks.files.set(uri, { content: 'denied', size: 6, modified: Date.now() });
      return { uri, status: 403 };
    });
    const source = 'https://example.test/denied.png';
    await expect(cache.acquireRemoteImageOriginal(source, 'maimai')).rejects.toThrow('403');
    const next = await cache.acquireRemoteImageOriginal(source, 'maimai');
    expect(mocks.files.get(next.fileUri)?.content).toBe('original bytes');
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(128);
    await next.release();
  });

  it('restores the same original file after a process restart without using the network', async () => {
    const source = { uri: 'https://example.test/persisted.jpg', headers: { Authorization: 'account' }, cacheKey: 'revision' };
    const first = await cache.acquireRemoteImageOriginal(source, 'maimai');
    await first.release();
    await cache.flushRemoteImageCacheManifest();
    await reloadCache();
    mocks.download.mockRejectedValue(new Error('offline'));
    const restored = await cache.acquireRemoteImageOriginal(source, 'maimai');
    expect(restored.fileUri).toBe(first.fileUri);
    expect(mocks.files.get(restored.fileUri)?.content).toBe('original bytes');
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(128);
    await restored.release();
    await cache.clearGameRemoteImageCache('maimai');
    expect(mocks.files.has(restored.fileUri)).toBe(false);
  });

  it('keeps a live original above capacity until its final consumer releases it', async () => {
    const bytes = cache.REMOTE_IMAGE_CACHE_BUDGET_BYTES + 1;
    mocks.download.mockImplementationOnce(async (_url, uri) => {
      mocks.files.set(uri, { content: 'large original bytes', size: bytes, modified: Date.now() });
      return { uri, status: 200 };
    });
    const first = await cache.acquireRemoteImageOriginal('https://example.test/large-original.png', 'maimai');
    const second = await cache.acquireRemoteImageOriginal('https://example.test/large-original.png', 'maimai');
    await cache.pruneRemoteImageCache();
    expect(mocks.files.get(first.fileUri)?.content).toBe('large original bytes');
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(bytes);
    await first.release();
    expect(mocks.files.has(second.fileUri)).toBe(true);
    await second.release();
    expect(mocks.files.has(first.fileUri)).toBe(false);
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(0);
  });

  it('invalidates only the failed original file and ignores its later failure after replacement', async () => {
    const source = 'https://example.test/damaged-original.png';
    const failed = await cache.acquireRemoteImageOriginal(source, 'maimai');
    await failed.invalidate();
    mocks.download.mockImplementationOnce(async (_url, uri) => {
      mocks.files.set(uri, { content: 'replacement bytes', size: 256, modified: Date.now() });
      return { uri, status: 200 };
    });
    const replacement = await cache.acquireRemoteImageOriginal(source, 'maimai');
    expect(replacement.fileUri).not.toBe(failed.fileUri);
    await failed.invalidate();
    await failed.release();
    expect(mocks.files.get(replacement.fileUri)?.content).toBe('replacement bytes');
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(256);
    await replacement.release();
    mocks.download.mockRejectedValue(new Error('offline'));
    const reopened = await cache.acquireRemoteImageOriginal(source, 'maimai');
    expect(reopened.fileUri).toBe(replacement.fileUri);
    await reopened.release();
  });

  it('discards a source that native decoding rejects and downloads usable bytes on retry', async () => {
    const source = 'https://example.test/bad-encoding.png';
    const options = { gameId: 'maimai', profile: 'thumbnail' as const };
    mocks.loadAsync.mockRejectedValueOnce(new Error('invalid image encoding'));
    await expect(cache.cacheCompressedRemoteImage(source, options)).rejects.toThrow('invalid image encoding');
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(0);
    mocks.download.mockImplementationOnce(async (_url, uri) => {
      mocks.files.set(uri, { content: 'valid replacement', size: 256, modified: Date.now() });
      return { uri, status: 200 };
    });
    const compressed = await cache.cacheCompressedRemoteImage(source, options);
    expect(compressed).not.toBeNull();
    const original = await cache.acquireRemoteImageOriginal(source, 'maimai');
    expect(mocks.files.get(original.fileUri)?.content).toBe('valid replacement');
    await original.release();
  });

  it('rejects a failed original publication without retaining a partial cache entry', async () => {
    const fileSystem = await import('expo-file-system/legacy');
    const move = vi.spyOn(fileSystem, 'moveAsync').mockRejectedValueOnce(new Error('disk full'));
    const source = 'https://example.test/publish-original.png';
    try {
      await expect(cache.acquireRemoteImageOriginal(source, 'maimai')).rejects.toThrow('disk full');
      await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(0);
      const original = await cache.acquireRemoteImageOriginal(source, 'maimai');
      expect(mocks.files.get(original.fileUri)?.content).toBe('original bytes');
      await original.release();
    } finally { move.mockRestore(); }
  });

  it('preserves a newer lease after repeated cancellation during eviction and failed clearing', async () => {
    const bytes = 27 * 1024 * 1024;
    mocks.download.mockImplementation(async (url, uri) => {
      mocks.files.set(uri, { content: url, size: bytes, modified: Date.now() });
      return { uri, status: 200 };
    });
    const older = await cache.acquireRemoteImageOriginal('https://example.test/older.png', 'maimai');
    await older.release();
    const fileSystem = await import('expo-file-system/legacy');
    const deleteFile = fileSystem.deleteAsync;
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const deletion = vi.spyOn(fileSystem, 'deleteAsync').mockImplementation(async (uri, options) => {
      if (uri === older.fileUri) { entered.resolve(); await resume.promise; }
      await deleteFile(uri, options);
    });
    let acquired: Awaited<ReturnType<typeof cache.acquireRemoteImageOriginal>> | undefined;
    try {
      const source = 'https://example.test/during-eviction.png';
      const controller = new AbortController();
      const pending = cache.acquireRemoteImageOriginal(source, 'maimai', controller.signal);
      const rejected = expect(pending).rejects.toThrow();
      await entered.promise;
      controller.abort();
      await rejected;
      const anotherController = new AbortController();
      const another = cache.acquireRemoteImageOriginal(source, 'maimai', anotherController.signal);
      const anotherRejected = expect(another).rejects.toThrow();
      anotherController.abort();
      await anotherRejected;
      const directory = vi.spyOn(fileSystem, 'makeDirectoryAsync').mockRejectedValueOnce(new Error('storage unavailable'));
      const clearing = cache.clearGameRemoteImageCache('maimai');
      const clearingRejected = expect(clearing).rejects.toThrow('storage unavailable');
      const reopening = cache.acquireRemoteImageOriginal(source, 'maimai');
      await Promise.resolve();
      resume.resolve();
      try { await clearingRejected; acquired = await reopening; }
      finally { directory.mockRestore(); }
      await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(bytes);
      expect(mocks.files.get(acquired.fileUri)?.content).toBe(source);
      await acquired.release();
      mocks.download.mockRejectedValue(new Error('offline'));
      const restored = await cache.acquireRemoteImageOriginal(source, 'maimai');
      expect(restored.fileUri).toBe(acquired.fileUri);
      expect(mocks.files.get(restored.fileUri)?.content).toBe(source);
      await restored.release();
    } finally { resume.resolve(); deletion.mockRestore(); await acquired?.release(); }
  });

  it('keeps a newer lease alive when clearing fails and an older generation releases the same file', async () => {
    const source = 'https://example.test/clear-failed.png';
    const older = await cache.acquireRemoteImageOriginal(source, 'maimai');
    const fileSystem = await import('expo-file-system/legacy');
    const directory = vi.spyOn(fileSystem, 'makeDirectoryAsync').mockRejectedValueOnce(new Error('disk unavailable'));
    try {
      await expect(cache.clearGameRemoteImageCache('maimai')).rejects.toThrow('disk unavailable');
    } finally { directory.mockRestore(); }
    const newer = await cache.acquireRemoteImageOriginal(source, 'maimai');
    expect(newer.fileUri).toBe(older.fileUri);
    await older.release();
    expect(mocks.files.get(newer.fileUri)?.content).toBe('original bytes');
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(128);
    await newer.release();
    mocks.download.mockRejectedValue(new Error('offline'));
    const restored = await cache.acquireRemoteImageOriginal(source, 'maimai');
    expect(restored.fileUri).toBe(newer.fileUri);
    await restored.release();
  });

  it('checks for an existing fallback without downloading or transforming', async () => {
    await expect(cache.findCompressedRemoteImage(
      'https://example.test/not-cached.png',
      { gameId: 'maimai', profile: 'thumbnail' },
    )).resolves.toBeNull();
    expect(mocks.loadAsync).not.toHaveBeenCalled();
    expect(mocks.manipulate).not.toHaveBeenCalled();
  });

  it('restores actual cache sizes when a rebuilt cover outlives its pending index write', async () => {
    vi.useFakeTimers();
    const source = 'https://example.test/rebuilt-cover.png';
    const options = { gameId: 'maimai', profile: 'thumbnail' } as const;
    try {
      const first = await cache.cacheCompressedRemoteImage(source, options);
      await cache.flushRemoteImageCacheManifest();
      await cache.invalidateCompressedRemoteImage(first!.cacheKey);
      mocks.imageBytes = 1024;
      await cache.cacheCompressedRemoteImage(source, options);
      vi.clearAllTimers();
      await reloadCache();

      await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(1152);
      await cache.pruneRemoteImageCache(500);
      const storedBytes = [...mocks.files].reduce((total, [uri, file]) => (
        total + (/\.(webp|source)$/.test(uri) ? file.size : 0)
      ), 0);
      expect(storedBytes).toBeLessThanOrEqual(500);
    } finally {
      await cache.flushRemoteImageCacheManifest();
      vi.useRealTimers();
    }
  });

  it.each(['empty', 'directory', 'oversized'] as const)('rejects a %s compressed file when restoring its cover', async kind => {
    const source = 'https://example.test/damaged-cover.png';
    const options = { gameId: 'maimai', profile: 'thumbnail' } as const;
    const cached = await cache.cacheCompressedRemoteImage(source, options);
    await cache.flushRemoteImageCacheManifest();
    if (kind === 'directory') {
      mocks.files.delete(cached!.fileUri);
      mocks.directories.add(cached!.fileUri);
    } else {
      mocks.files.set(cached!.fileUri, { content: '',
        size: kind === 'empty' ? 0 : cache.REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES + 1, modified: Date.now() });
    }
    await reloadCache();
    await expect(cache.findCompressedRemoteImage(source, options)).resolves.toBeNull();
    const rebuilt = await cache.cacheCompressedRemoteImage(source, options);
    expect(rebuilt?.source).toEqual({ uri: rebuilt?.fileUri });
    expect(mocks.files.get(rebuilt!.fileUri)?.size).toBeGreaterThan(0);
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
      expect.objectContaining({ uri: expect.any(String) }),
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

  it('restores mixed original and compressed entries within the shared capacity', async () => {
    const root = '/cache/rranker-remote-image-cache-v2';
    mocks.directories.add(root);
    const entries = {
      older: { kind: 'original', fileName: 'older.source', bytes: 26 * 1024 * 1024, gameId: 'maimai', lastAccess: 1 },
      compressed: { kind: 'compressed', fileName: 'compressed.webp', bytes: 10240, gameId: 'maimai', lastAccess: 2 },
      newer: { kind: 'original', fileName: 'newer.source', bytes: 26 * 1024 * 1024, gameId: 'maimai', lastAccess: 3 },
    };
    for (const entry of Object.values(entries)) {
      mocks.files.set(`${root}/${entry.fileName}`, { content: 'image', size: entry.bytes, modified: entry.lastAccess });
    }
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
    expect(mocks.files.has(`${root}/older.source`)).toBe(false);
    expect(mocks.files.has(`${root}/newer.source`)).toBe(true);
    expect(mocks.files.has(`${root}/compressed.webp`)).toBe(true);
  });

  it('does not leave a failed transform in the in-flight registry', async () => {
    mocks.manipulate.mockImplementationOnce(() => { throw new Error('unsupported image'); });
    const source = 'https://example.test/unknown.bin';
    await expect(cache.cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' })).rejects.toThrow('unsupported image');
    await expect(cache.cacheCompressedRemoteImage(source, { gameId: 'maimai', profile: 'thumbnail' })).resolves.not.toBeNull();
    expect(mocks.loadAsync).toHaveBeenCalledTimes(2);
  });

  it('prunes least recently used files to the requested budget and clears the cache', async () => {
    expect(cache.REMOTE_IMAGE_CACHE_BUDGET_BYTES).toBe(50 * 1024 * 1024);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const options = { gameId: 'maimai', profile: 'thumbnail' } as const;
    try {
      await cache.cacheCompressedRemoteImage('https://example.test/1.png', options);
      clock.mockReturnValue(2000);
      await cache.cacheCompressedRemoteImage('https://example.test/2.png', options);
      clock.mockReturnValue(3000);
      await cache.cacheCompressedRemoteImage('https://example.test/3.png', options);
      await cache.pruneRemoteImageCache(192);

      await expect(cache.findCompressedRemoteImage('https://example.test/1.png', options)).resolves.toBeNull();
      await expect(cache.findCompressedRemoteImage('https://example.test/2.png', options)).resolves.toBeNull();
      await expect(cache.findCompressedRemoteImage('https://example.test/3.png', options)).resolves.not.toBeNull();
      await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(192);

      await cache.clearCompressedRemoteImageCache();
      expect(Array.from(mocks.files.keys()).some((path) => path.includes('rranker-remote-image-cache-v2'))).toBe(false);
    } finally { clock.mockRestore(); }
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
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(208);
    await expect(cache.measureGameRemoteImageCacheBytes('phigros')).resolves.toBe(208);

    await cache.clearGameRemoteImageCache('maimai');
    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(0);
    await expect(cache.measureGameRemoteImageCacheBytes('phigros')).resolves.toBe(208);
  });

  it('restores game ownership and active-game recency from the manifest', async () => {
    await cache.cacheCompressedRemoteImage('https://example.test/restart.png', { gameId: 'maimai', profile: 'thumbnail' });
    await cache.markRemoteImageCacheGameActive('maimai');
    await cache.flushRemoteImageCacheManifest();

    await expect(cache.measureGameRemoteImageCacheBytes('maimai')).resolves.toBe(192);
    await expect(cache.listRemoteImageCacheUsage()).resolves.toEqual([
      expect.objectContaining({ gameId: 'maimai', bytes: 192, active: true }),
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
    await expect(cache.measureGameRemoteImageCacheBytes('phigros')).resolves.toBe(192);
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
