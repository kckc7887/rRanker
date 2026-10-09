import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBestImageAssetSession, disposeBestImageAssetSession, loadRemoteImageFile } from '@/features/best-image/load-best-image-session';
import { loadBestImageJackets } from '@/features/best-image/load-best-image-jackets';

const mocks = vi.hoisted(() => ({ files: new Map<string, string>(), download: vi.fn() }));
vi.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/$/u, '')).join('/');
    }
  }
  return { File: Entry, Directory: Entry, Paths: { cache: 'file:///cache', document: 'file:///document' } };
});
vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: async (uri: string) => ({ exists: mocks.files.has(uri), size: mocks.files.get(uri)?.length ?? 0 }),
  makeDirectoryAsync: async () => undefined,
  deleteAsync: async (uri: string) => { for (const key of mocks.files.keys()) if (key === uri || key.startsWith(uri + '/')) mocks.files.delete(key); },
  moveAsync: async ({ from, to }: { from: string; to: string }) => { mocks.files.set(to, mocks.files.get(from)!); mocks.files.delete(from); },
}));
vi.mock('@/features/chart-download-shared/chart-download-shared', () => ({
  downloadChartResource: async (directory: string, name: string, url: string, signal: AbortSignal) => {
    await mocks.download(url, signal);
    mocks.files.set(`${directory}/${name}`, `original-bytes:${url}`);
  },
}));

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('best image session files', () => {
  beforeEach(() => { mocks.files.clear(); mocks.download.mockReset().mockResolvedValue(undefined); });

  it('keeps original bytes and reuses the same URL across requests within a session', async () => {
    const session = createBestImageAssetSession('maimai');
    const first = await loadRemoteImageFile(session, 'https://example.test/cover.png');
    expect(first).toMatch(/^file:\/\/\/document\/rranker\//u);
    expect(mocks.files.get(first!)).toBe('original-bytes:https://example.test/cover.png');
    mocks.download.mockRejectedValue(new Error('offline'));
    await expect(loadRemoteImageFile(session, 'https://example.test/cover.png')).resolves.toBe(first);
    await disposeBestImageAssetSession(session);
    expect(mocks.files.size).toBe(0);
    await expect(loadRemoteImageFile(session, 'https://example.test/cover.png')).resolves.toBeNull();
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
    expect(mocks.files.size).toBe(0);
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
    await expect(loadRemoteImageFile(session, 'https://example.test/retry.png')).resolves.toBeNull();
    const uri = await loadRemoteImageFile(session, 'https://example.test/retry.png');
    expect(mocks.files.get(uri!)).toBe('original-bytes:https://example.test/retry.png');
    await disposeBestImageAssetSession(session);
  });
});
