import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBestImageAssets } from '@/features/best-image/load-best-image-assets';
import { copyBestImageAsset, createBestImageAssetSession, disposeBestImageAssetSession } from '@/features/best-image/load-best-image-session';

const mocks = vi.hoisted(() => ({ loadAsync: vi.fn(), resolveAssetSource: vi.fn(), files: new Map<string, string>() }));
vi.mock('expo-asset', () => ({ Asset: { loadAsync: mocks.loadAsync } }));
vi.mock('react-native', () => ({ Image: { resolveAssetSource: mocks.resolveAssetSource } }));
vi.mock('@/features/chart-download-shared/chart-download-shared', () => ({ downloadChartResource: vi.fn() }));
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
  getInfoAsync: async (uri: string) => ({ exists: mocks.files.has(uri) }),
  makeDirectoryAsync: async () => undefined,
  moveAsync: async ({ from, to }: { from: string; to: string }) => { mocks.files.set(to, mocks.files.get(from)!); mocks.files.delete(from); },
  copyAsync: async ({ from, to }: { from: string; to: string }) => { mocks.files.set(to, mocks.files.get(from)!); },
  deleteAsync: async (uri: string) => { for (const key of mocks.files.keys()) if (key === uri || key.startsWith(uri + '/')) mocks.files.delete(key); },
}));

describe('best image bundled asset files', () => {
  beforeEach(() => {
    mocks.files.clear(); mocks.resolveAssetSource.mockReset(); mocks.loadAsync.mockReset();
    mocks.loadAsync.mockImplementation(async (id: number) => {
      const localUri = `file:///bundle/${id}`; mocks.files.set(localUri, `bytes-${id}`);
      return [{ localUri }];
    });
  });

  it('copies original bundled bytes under the readable session root', async () => {
    const session = createBestImageAssetSession('maimai');
    const assets = await loadBestImageAssets(session, 901, 902);
    expect(assets.fontUrl.startsWith(session.directory.uri + '/')).toBe(true);
    expect(assets.ratingFrameUrl.startsWith(session.directory.uri + '/')).toBe(true);
    expect(mocks.files.get(assets.fontUrl)).toBe('bytes-901');
    expect(mocks.files.get(assets.ratingFrameUrl)).toBe('bytes-902');
    await disposeBestImageAssetSession(session);
    expect(mocks.files.has(assets.fontUrl)).toBe(false);
    expect(mocks.files.get('file:///bundle/901')).toBe('bytes-901');
  });

  it('retains relative font and UI files after their verified source cache is cleared', async () => {
    const session = createBestImageAssetSession('phigros');
    mocks.files.set('file:///verified/font/phi.ttf', 'original font');
    const uri = await copyBestImageAsset(session, 'file:///verified/font/phi.ttf', 'font/phi.ttf');
    mocks.files.delete('file:///verified/font/phi.ttf');
    await expect(copyBestImageAsset(session, 'file:///verified/font/phi.ttf', 'font/phi.ttf')).resolves.toBe(uri);
    expect(uri).toBe(`${session.directory.uri}/font/phi.ttf`);
    expect(mocks.files.get(uri)).toBe('original font');
    await disposeBestImageAssetSession(session);
    expect(mocks.files.has(uri)).toBe(false);
  });

  it('resolves Android release identifiers into readable local files', async () => {
    mocks.resolveAssetSource.mockImplementation((id: number) => ({ uri: `resource_${id}` }));
    mocks.loadAsync.mockImplementation(async (source: number | string) => {
      if (typeof source === 'number') return [{ uri: `resource_${source}` }];
      const localUri = `file:///bundle/${source}`; mocks.files.set(localUri, source);
      return [{ localUri }];
    });
    const session = createBestImageAssetSession('maimai');
    const assets = await loadBestImageAssets(session, 911, 912);
    expect(mocks.files.get(assets.fontUrl)).toBe('resource_911');
    expect(mocks.files.get(assets.ratingFrameUrl)).toBe('resource_912');
    await disposeBestImageAssetSession(session);
  });
});
