import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyBestImageAsset, createBestImageAssetSession, disposeBestImageAssetSession, loadRemoteImageFile, prepareBestImageCardBackground } from '@/features/best-image/load-best-image-session';
import { loadBestImageJackets } from '@/features/best-image/load-best-image-jackets';
import { acquireRemoteImageOriginal, clearCompressedRemoteImageCache, clearGameRemoteImageCache, pruneRemoteImageCache } from '@/services/remote-image-cache';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';

const mocks = vi.hoisted(() => ({ files: new Map<string, string>(), directories: new Set<string>(), download: vi.fn(), copy: vi.fn(), write: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-image', () => ({ Image: {} }));
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { WEBP: 'webp' } }));
vi.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/$/u, '')).join('/');
    }
    get name() { return this.uri.split('/').at(-1) ?? ''; }
    get type() { return this.uri.endsWith('.svg') ? 'image/svg+xml' : ''; }
    async text() { return mocks.files.get(this.uri) ?? ''; }
    async base64() {
      const content = mocks.files.get(this.uri);
      if (content === undefined) throw new Error('source missing');
      return Buffer.from(content).toString('base64');
    }
  }
  return { File: Entry, Directory: Entry, Paths: { cache: 'file:///cache', document: 'file:///document' } };
});
vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: async (uri: string) => ({ exists: mocks.files.has(uri) || mocks.directories.has(uri), isDirectory: mocks.directories.has(uri), size: mocks.files.get(uri)?.length ?? 0 }),
  makeDirectoryAsync: async (uri: string) => { mocks.directories.add(uri); },
  readDirectoryAsync: async (uri: string) => [...mocks.files.keys()].filter(path => path.startsWith(uri + '/') && !path.slice(uri.length + 1).includes('/')).map(path => path.slice(uri.length + 1)),
  writeAsStringAsync: async (uri: string, content: string) => { await mocks.write(uri, content); mocks.files.set(uri, content); },
  deleteAsync: async (uri: string) => { for (const key of mocks.files.keys()) if (key === uri || key.startsWith(uri + '/')) mocks.files.delete(key); },
  moveAsync: async ({ from, to }: { from: string; to: string }) => { mocks.files.set(to, mocks.files.get(from)!); mocks.files.delete(from); },
  copyAsync: async (options: { from: string; to: string }) => {
    await mocks.copy(options);
    const content = mocks.files.get(options.from);
    if (content === undefined) throw new Error('source missing');
    mocks.files.set(options.to, content);
  },
  createDownloadResumable: (url: string, uri: string) => ({
    downloadAsync: async () => {
      const status = await mocks.download(url);
      mocks.files.set(uri, `original-bytes:${url}`);
      return { uri, status: status ?? 200 };
    },
    cancelAsync: async () => undefined,
  }),
}));

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('best image session files', () => {
  beforeEach(async () => {
    await clearCompressedRemoteImageCache();
    mocks.files.clear(); mocks.directories.clear();
    mocks.download.mockReset().mockResolvedValue(undefined);
    mocks.copy.mockReset().mockResolvedValue(undefined);
    mocks.write.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => clearCompressedRemoteImageCache());

  it('keeps original bytes and reuses the same URL across requests within a session', async () => {
    const session = createBestImageAssetSession('maimai');
    const first = await loadRemoteImageFile(session, 'https://example.test/cover.png');
    expect(first).toMatch(/^file:\/\/\/document\/rranker\//u);
    expect(mocks.files.get(first!)).toBe('original-bytes:https://example.test/cover.png');
    mocks.download.mockRejectedValue(new Error('offline'));
    await expect(loadRemoteImageFile(session, 'https://example.test/cover.png')).resolves.toBe(first);
    mocks.files.set(first!, '');
    await expect(loadRemoteImageFile(session, 'https://example.test/cover.png')).resolves.toBe(first);
    expect(mocks.files.get(first!)).toBe('original-bytes:https://example.test/cover.png');
    await disposeBestImageAssetSession(session);
    expect(mocks.files.has(first!)).toBe(false);
    await expect(loadRemoteImageFile(session, 'https://example.test/cover.png')).resolves.toBeNull();
    const next = createBestImageAssetSession('maimai');
    const reused = await loadRemoteImageFile(next, 'https://example.test/cover.png');
    expect(mocks.files.get(reused!)).toBe('original-bytes:https://example.test/cover.png');
    await disposeBestImageAssetSession(next);
  });

  it('normalizes SD and DX covers and preserves each requested chart key', async () => {
    const session = createBestImageAssetSession('maimai');
    const progress: string[] = [];
    const result = await loadBestImageJackets(session, ['1447', '11447'], (done, total) => progress.push(`${done}/${total}`));
    expect(result['1447']).toBe(result['11447']);
    expect(mocks.files.get(result['1447']!)).toBe('original-bytes:https://assets2.lxns.net/maimai/jacket/1447.png');
    expect(progress).toEqual(['0/2', '2/2']);
    await disposeBestImageAssetSession(session);
  });

  it('embeds original images in reusable card backgrounds and removes a cancelled write', async () => {
    const session = createBestImageAssetSession('chunithm');
    const jacket = 'file:///jacket.png', plate = 'file:///plate.svg';
    mocks.files.set(jacket, 'original jacket bytes');
    mocks.files.set(plate, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const build = (images: readonly string[]) => `<svg xmlns="http://www.w3.org/2000/svg"><image href="${images[1]}"/><image href="${images[0]}"/></svg>`;
    const background = await prepareBestImageCardBackground(session, 'master', [jacket, plate], build);
    const svg = mocks.files.get(background);
    expect(svg).toContain(`data:image/png;base64,${Buffer.from(mocks.files.get(jacket)!).toString('base64')}`);
    expect(svg).toContain(`data:image/svg+xml;base64,${Buffer.from(mocks.files.get(plate)!).toString('base64')}`);
    mocks.files.delete(jacket); mocks.files.delete(plate);
    await expect(prepareBestImageCardBackground(session, 'master', [jacket, plate], build)).resolves.toBe(background);
    expect(mocks.files.get(background)).toBe(svg);

    mocks.files.set(jacket, 'original jacket bytes');
    const gate = deferred(), controller = new AbortController();
    mocks.write.mockReturnValueOnce(gate.promise);
    const pending = prepareBestImageCardBackground(session, 'expert', [jacket], () => '<svg id="cancelled-background"/>', controller.signal);
    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledWith(expect.any(String), '<svg id="cancelled-background"/>'));
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    gate.resolve();
    await copyBestImageAsset(session, jacket, 'after.png');
    expect([...mocks.files.values()]).not.toContain('<svg id="cancelled-background"/>');
    expect(mocks.files.get(background)).toBe(svg);
    mocks.write.mockRejectedValueOnce(new Error('disk full'));
    await expect(prepareBestImageCardBackground(session, 'basic', [jacket], build)).rejects.toThrow('disk full');
    expect(mocks.files.get(background)).toBe(svg);
    const recovered = await prepareBestImageCardBackground(session, 'basic', [jacket], build);
    expect(mocks.files.get(recovered)).toContain('data:image/png;base64,');
    await disposeBestImageAssetSession(session);
  });

  it('isolates sessions and leaves another page files readable after disposal', async () => {
    const first = createBestImageAssetSession('chunithm');
    const second = createBestImageAssetSession('chunithm');
    const [a, b] = await Promise.all([loadRemoteImageFile(first, 'https://example.test/a.png'), loadRemoteImageFile(second, 'https://example.test/a.png')]);
    expect(a).not.toBe(b);
    await disposeBestImageAssetSession(first);
    expect(mocks.files.has(a!)).toBe(false);
    expect(mocks.files.get(b!)).toBe('original-bytes:https://example.test/a.png');
    await disposeBestImageAssetSession(second);
  });

  it('does not publish a late download after the page session ends', async () => {
    const gate = deferred();
    mocks.download.mockReturnValueOnce(gate.promise);
    const session = createBestImageAssetSession('phigros');
    const pending = loadRemoteImageFile(session, 'https://example.test/late.png');
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalled());
    await disposeBestImageAssetSession(session);
    gate.resolve();
    await expect(pending).resolves.toBeNull();
    await vi.waitFor(() => expect([...mocks.files.values()]).not.toContain('original-bytes:https://example.test/late.png'));
  });

  it('keeps a shared download alive while another consumer still needs it', async () => {
    const gate = deferred();
    mocks.download.mockReturnValueOnce(gate.promise);
    const session = createBestImageAssetSession('maimai');
    const controller = new AbortController();
    const abandoned = loadRemoteImageFile(session, 'https://example.test/shared.png', controller.signal);
    const retained = loadRemoteImageFile(session, 'https://example.test/shared.png');
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalled());
    controller.abort(); gate.resolve();
    await expect(abandoned).resolves.toBeNull();
    const uri = await retained;
    expect(mocks.files.get(uri!)).toBe('original-bytes:https://example.test/shared.png');
    await disposeBestImageAssetSession(session);
  });

  it('retries failed loads and represents missing input as null', async () => {
    const session = createBestImageAssetSession('phigros');
    mocks.download.mockRejectedValueOnce(new Error('offline'));
    await expect(loadRemoteImageFile(session, null)).resolves.toBeNull();
    const uri = await loadRemoteImageFile(session, 'https://example.test/retry.png');
    expect(mocks.files.get(uri!)).toBe('original-bytes:https://example.test/retry.png');
    await disposeBestImageAssetSession(session);
  });

  it('copies a displayed original while offline and keeps the session copy after cache clearing', async () => {
    const url = 'https://example.test/displayed.png';
    const original = await acquireRemoteImageOriginal(url, 'phigros');
    await original.release();
    mocks.download.mockRejectedValue(new Error('offline'));
    const session = createBestImageAssetSession('phigros');
    const uri = await loadRemoteImageFile(session, url);
    expect(uri).not.toBe(original.fileUri);
    expect(mocks.files.get(uri!)).toBe(`original-bytes:${url}`);
    await clearGameRemoteImageCache('phigros');
    expect(mocks.files.has(original.fileUri)).toBe(false);
    await expect(loadRemoteImageFile(session, url)).resolves.toBe(uri);
    expect(mocks.files.get(uri!)).toBe(`original-bytes:${url}`);
    await disposeBestImageAssetSession(session);
  });

  it('does not reuse a different game or image URL while offline', async () => {
    const url = 'https://example.test/full.png';
    const original = await acquireRemoteImageOriginal(url, 'phigros');
    await original.release();
    mocks.download.mockRejectedValue(new Error('offline'));
    const sameGame = createBestImageAssetSession('phigros');
    const otherGame = createBestImageAssetSession('chunithm');
    for (const [session, address] of [[sameGame, 'https://example.test/lowres.png'], [otherGame, url]] as const) {
      const controller = new AbortController();
      const pending = loadRemoteImageFile(session, address, controller.signal);
      await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledWith(address));
      controller.abort();
      await expect(pending).resolves.toBeNull();
    }
    await disposeBestImageAssetSession(sameGame);
    await disposeBestImageAssetSession(otherGame);
  });

  it('holds the original through copying when its cache is cleared', async () => {
    const url = 'https://example.test/held.png';
    const original = await acquireRemoteImageOriginal(url, 'phigros');
    await original.release();
    const gate = deferred();
    mocks.copy.mockReturnValueOnce(gate.promise);
    const session = createBestImageAssetSession('phigros');
    const pending = loadRemoteImageFile(session, url);
    await vi.waitFor(() => expect(mocks.copy).toHaveBeenCalled());
    await clearGameRemoteImageCache('phigros');
    expect(mocks.files.get(original.fileUri)).toBe(`original-bytes:${url}`);
    gate.resolve();
    const uri = await pending;
    expect(mocks.files.get(uri!)).toBe(`original-bytes:${url}`);
    expect(mocks.files.has(original.fileUri)).toBe(false);
    await disposeBestImageAssetSession(session);
  });

  it.each(['cancel', 'clear', 'dispose'] as const)('does not publish or retain the original after %s during copying', async action => {
    const url = `https://example.test/${action}.png`;
    const original = await acquireRemoteImageOriginal(url, 'maimai');
    await original.release();
    const gate = deferred();
    mocks.copy.mockReturnValueOnce(gate.promise);
    const session = createBestImageAssetSession('maimai');
    const controller = new AbortController();
    const pending = loadRemoteImageFile(session, url, controller.signal);
    await vi.waitFor(() => expect(mocks.copy).toHaveBeenCalled());
    if (action === 'cancel') controller.abort();
    if (action === 'clear') invalidateResourceWrites('maimai');
    const disposal = action === 'dispose' ? disposeBestImageAssetSession(session) : Promise.resolve();
    await pruneRemoteImageCache(0);
    expect(mocks.files.has(original.fileUri)).toBe(true);
    gate.resolve();
    await expect(pending).resolves.toBeNull();
    await disposal;
    await vi.waitFor(async () => {
      await pruneRemoteImageCache(0);
      expect(mocks.files.has(original.fileUri)).toBe(false);
    });
    expect([...mocks.files.keys()].some(path => path.startsWith(session.directory.uri + '/'))).toBe(false);
    await disposeBestImageAssetSession(session);
  });

  it('releases a failed copy before retrying and lets other file work finish during backoff', async () => {
    const url = 'https://example.test/copy.png';
    const original = await acquireRemoteImageOriginal(url, 'maimai');
    await original.release();
    const session = createBestImageAssetSession('maimai');
    mocks.copy.mockRejectedValueOnce(new Error('copy failed'));
    const pending = loadRemoteImageFile(session, url);
    await vi.waitFor(() => expect(mocks.copy).toHaveBeenCalled());
    expect(mocks.files.get(original.fileUri)).toBe(`original-bytes:${url}`);
    await pruneRemoteImageCache(0);
    expect(mocks.files.has(original.fileUri)).toBe(false);
    mocks.files.set('file:///other', 'unrelated bytes');
    const otherUri = await copyBestImageAsset(session, 'file:///other', 'other.png');
    expect(mocks.files.get(otherUri)).toBe('unrelated bytes');
    const uri = await pending;
    expect(mocks.files.get(uri!)).toBe(`original-bytes:${url}`);
    await disposeBestImageAssetSession(session);
  });

  it('finishes a missing optional image as null after a native HTTP 404 response', async () => {
    const session = createBestImageAssetSession('chunithm');
    mocks.download.mockResolvedValueOnce(404);
    await expect(loadRemoteImageFile(session, 'https://example.test/missing.png')).resolves.toBeNull();
    expect([...mocks.files.keys()].some(path => path.startsWith(session.directory.uri + '/'))).toBe(false);
    await disposeBestImageAssetSession(session);
  });

  it('stops a failed image backoff when the game cache generation changes', async () => {
    const session = createBestImageAssetSession('maimai');
    mocks.download.mockRejectedValue(new Error('offline'));
    const pending = loadRemoteImageFile(session, 'https://example.test/cleared.png');
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalled());
    invalidateResourceWrites('maimai');
    await expect(pending).resolves.toBeNull();
    expect([...mocks.files.keys()].some(path => path.startsWith(session.directory.uri + '/'))).toBe(false);
    await disposeBestImageAssetSession(session);
  });
});
