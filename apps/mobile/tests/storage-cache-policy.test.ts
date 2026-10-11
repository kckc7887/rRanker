import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entries: new Map<string, { isDirectory: boolean; modificationTime: number }>(),
  beforeInfo: vi.fn(async (_uri: string) => undefined),
  beforeDelete: vi.fn(async (_uri: string) => undefined),
}));

vi.mock('expo-file-system', () => {
  const join = (...parts: (string | { uri: string })[]) => parts.map(part => typeof part === 'string' ? part : part.uri).join('/').replace(/\/{2,}/gu, '/').replace(/\/$/u, '');
  class Directory {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = join(...parts); }
    create() {
      if (!mocks.entries.has(this.uri)) mocks.entries.set(this.uri, { isDirectory: true, modificationTime: Math.floor(Date.now() / 1000) });
    }
  }
  return { Directory, Paths: { cache: '/cache', document: '/document', join } };
});
vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: async (uri: string) => {
    const entry = mocks.entries.get(uri);
    await mocks.beforeInfo(uri);
    return { exists: !!entry, ...entry };
  },
  readDirectoryAsync: async (uri: string) => [...mocks.entries.keys()]
    .filter(path => path.startsWith(`${uri}/`) && !path.slice(uri.length + 1).includes('/'))
    .map(path => path.slice(uri.length + 1)),
  deleteAsync: async (uri: string) => {
    await mocks.beforeDelete(uri);
    for (const path of mocks.entries.keys()) if (path === uri || path.startsWith(`${uri}/`)) mocks.entries.delete(path);
  },
  makeDirectoryAsync: async (uri: string) => {
    if (!mocks.entries.has(uri)) mocks.entries.set(uri, { isDirectory: true, modificationTime: Math.floor(Date.now() / 1000) });
  },
}));
vi.mock('expo-asset', () => ({ Asset: {} }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('@/features/best-image/maimai-font-cache', () => ({ MAIMAI_FONT_CACHE_VERSION: 'v1' }));
vi.mock('@/features/best-image/maimai-ui-cache', () => ({ MAIMAI_UI_CACHE_VERSION: 'v1' }));
vi.mock('@/features/phigros-best-image/phigros-font-cache', () => ({ PHIGROS_FONT_CACHE_VERSION: 'v1' }));
vi.mock('@/services/remote-image-cache', () => ({ pruneRemoteImageCache: vi.fn(async () => undefined) }));

// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import { cleanupOrphanedTemporaryStorage } from '@/features/storage-management/storage-cache-maintenance';
// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import { chartPreviewStageDirectory, createChartPreviewSessionDirectory } from '@/features/chart-preview-shared/chart-preview-assets';

describe('startup cache cleanup', () => {
  beforeEach(() => {
    mocks.entries.clear();
    mocks.entries.set('/cache', { isDirectory: true, modificationTime: 1 });
    mocks.beforeInfo.mockReset().mockResolvedValue(undefined);
    mocks.beforeDelete.mockReset().mockResolvedValue(undefined);
  });

  it('removes temporary files and retains current image cache, system files and other applications', async () => {
    for (const name of [
      'rranker-chart-preview-session-1', 'rRanker-backup-session.json',
      'rranker-remote-image-cache-v1', 'rranker-remote-image-cache-v2',
      'rranker-runtime-diagnostics.json', 'rranker-runtime-log-31-1.txt',
      'ExponentAsset-Ionicons.ttf', 'Image', 'another-app.json',
    ]) mocks.entries.set(`/cache/${name}`, { isDirectory: false, modificationTime: 1 });
    await cleanupOrphanedTemporaryStorage();
    expect([...mocks.entries.keys()]).toEqual([
      '/cache', '/cache/rranker-remote-image-cache-v2', '/cache/ExponentAsset-Ionicons.ttf', '/cache/Image', '/cache/another-app.json',
    ]);
  });

  it('keeps this session and a reused preview directory opened while its old metadata is being read', async () => {
    const active = '/cache/rranker-chart-preview-remote';
    mocks.entries.set(active, { isDirectory: true, modificationTime: 1 });
    mocks.entries.set(`${active}/skin.png`, { isDirectory: false, modificationTime: 1 });
    mocks.entries.set('/cache/rranker-chart-preview-session-current', { isDirectory: true, modificationTime: Math.floor(Date.now() / 1000) });
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    mocks.beforeInfo.mockImplementation(async uri => {
      if (uri === active) { entered.resolve(); await resume.promise; }
    });
    const cleanup = cleanupOrphanedTemporaryStorage();
    await entered.promise;
    const opening = chartPreviewStageDirectory('rranker-chart-preview-remote');
    resume.resolve();
    await cleanup;
    await opening;
    expect(mocks.entries.has(`${active}/skin.png`)).toBe(true);
    expect(mocks.entries.has('/cache/rranker-chart-preview-session-current')).toBe(true);
  });

  it('opens a fixed preview directory only after its already-started deletion has completed', async () => {
    const root = '/cache/rranker-phigros-chart-preview-remote';
    mocks.entries.set(root, { isDirectory: true, modificationTime: 1 });
    mocks.entries.set(`${root}/old.png`, { isDirectory: false, modificationTime: 1 });
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    mocks.beforeDelete.mockImplementation(async uri => {
      if (uri === root) { entered.resolve(); await resume.promise; }
    });
    const cleanup = cleanupOrphanedTemporaryStorage();
    await entered.promise;
    const opening = chartPreviewStageDirectory('rranker-phigros-chart-preview-remote');
    const openingSession = createChartPreviewSessionDirectory('rranker-phigros-chart-preview');
    resume.resolve();
    await cleanup;
    const directory = await opening;
    const session = await openingSession;
    expect(mocks.entries.has(`${root}/old.png`)).toBe(false);
    expect(mocks.entries.get(directory.uri)?.isDirectory).toBe(true);
    expect(mocks.entries.get(session.uri)?.isDirectory).toBe(true);
    mocks.entries.set(`${directory.uri}/current.part`, { isDirectory: false, modificationTime: Math.floor(Date.now() / 1000) });
    await cleanupOrphanedTemporaryStorage();
    expect(mocks.entries.has(`${directory.uri}/current.part`)).toBe(true);
  });

  it('removes old illustration sessions and obsolete fonts while keeping current files and shared roots', async () => {
    const root = '/document/rranker/phigros-illustration-stage';
    const fonts = '/document/rranker/phigros-fonts';
    for (const path of [root, `${root}/session-old`, fonts, `${fonts}/v0`, `${fonts}/v1`, `${fonts}/v1/tmp`]) {
      mocks.entries.set(path, { isDirectory: true, modificationTime: 1 });
    }
    mocks.entries.set(`${fonts}/v1/font.ttf`, { isDirectory: false, modificationTime: 1 });
    mocks.entries.set(`${fonts}/v1/tmp/old.part`, { isDirectory: false, modificationTime: 1 });
    const recent = Math.floor(Date.now() / 1000);
    mocks.entries.set(`${root}/session-current`, { isDirectory: true, modificationTime: recent });
    mocks.entries.set(`${fonts}/v1/tmp/current.part`, { isDirectory: false, modificationTime: recent });
    await cleanupOrphanedTemporaryStorage();
    expect([...mocks.entries.keys()].filter(path => path.startsWith(root))).toEqual([root, `${root}/session-current`]);
    expect([...mocks.entries.keys()].filter(path => path.startsWith(fonts))).toEqual([
      fonts, `${fonts}/v1`, `${fonts}/v1/tmp`, `${fonts}/v1/font.ttf`, `${fonts}/v1/tmp/current.part`,
    ]);
  });
});
