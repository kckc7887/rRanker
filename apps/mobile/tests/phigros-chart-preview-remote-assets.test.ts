import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareChartPreviewWebviewFromPlan } from '@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { clearSharedCache } from '@/features/storage-management/shared-storage-cache';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const mockFs = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  remotes: new Map<string, Uint8Array | Error>(),
  downloadCalls: [] as string[],
  onDownloadReady: vi.fn(async () => {}),
  makeStageDirectory: ((_name: string) => ({ uri: '' })) as (name: string) => { uri: string },
}));

vi.mock('expo-file-system', () => {
  const joinUri = (base: string | { uri: string }, parts: string[]) => {
    const root = typeof base === 'string' ? base : base.uri;
    return [root.replace(/\/+$/u, ''), ...parts.map((part) => part.replace(/^\/+|\/+$/gu, ''))].join('/');
  };
  class Directory {
    readonly uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = joinUri(base, parts); }
    create() { /* in-memory directories always exist */ }
    get exists() { return true; }
    delete() {
      for (const key of [...mockFs.files.keys()]) {
        if (key.startsWith(`${this.uri}/`)) mockFs.files.delete(key);
      }
    }
  }
  class File {
    uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = joinUri(base, parts); }
    get exists() { return mockFs.files.has(this.uri); }
    get size() { return mockFs.files.get(this.uri)?.byteLength ?? 0; }
    async base64() { return Buffer.from(await this.bytes()).toString('base64'); }
    async text() { return Buffer.from(await this.bytes()).toString(); }
    async bytes() {
      const bytes = mockFs.files.get(this.uri);
      if (!bytes) throw new Error('source does not exist');
      return Uint8Array.from(bytes);
    }
    create() { mockFs.files.set(this.uri, new Uint8Array()); }
    write(content: string | Uint8Array) {
      mockFs.files.set(this.uri, typeof content === 'string' ? Uint8Array.from(Buffer.from(content)) : Uint8Array.from(content));
    }
    delete() { mockFs.files.delete(this.uri); }
    copy(destination: File) {
      const bytes = mockFs.files.get(this.uri);
      if (!bytes) throw new Error('source does not exist');
      mockFs.files.set(destination.uri, Uint8Array.from(bytes));
    }
    move(destination: File) {
      const bytes = mockFs.files.get(this.uri);
      if (!bytes) throw new Error('source does not exist');
      mockFs.files.set(destination.uri, bytes);
      mockFs.files.delete(this.uri);
      this.uri = destination.uri;
    }
    static async downloadFileAsync(url: string, destination: File) {
      mockFs.downloadCalls.push(url);
      const remote = mockFs.remotes.get(url);
      if (remote instanceof Error) throw remote;
      if (!remote) throw new Error(`missing remote ${url}`);
      await mockFs.onDownloadReady();
      mockFs.files.set(destination.uri, Uint8Array.from(remote));
      return destination;
    }
  }
  mockFs.makeStageDirectory = (name: string) => new Directory('file://cache', name);
  return { Directory, File, Paths: { cache: new Directory('file://cache'), join: (base: string, ...parts: string[]) => joinUri(base, parts) } };
});

vi.mock('expo-file-system/legacy', () => ({
  makeDirectoryAsync: async () => undefined,
  createDownloadResumable: (url: string, uri: string, _options: unknown, onProgress: (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void) => ({
    cancelAsync: async () => undefined,
    downloadAsync: async () => {
      const { File } = await import('expo-file-system');
      onProgress({ totalBytesWritten: 0, totalBytesExpectedToWrite: 100 });
      await File.downloadFileAsync(url, new File(uri));
      onProgress({ totalBytesWritten: 100, totalBytesExpectedToWrite: 100 });
      return { uri, status: 200 };
    },
  }),
  getInfoAsync: async (uri: string) => ({ exists: mockFs.files.has(uri) || [...mockFs.files.keys()].some(path => path.startsWith(`${uri}/`)), size: mockFs.files.get(uri)?.byteLength ?? 0 }),
  readDirectoryAsync: async (uri: string) => [...new Set([...mockFs.files.keys()]
    .filter(path => path.startsWith(`${uri}/`)).map(path => path.slice(uri.length + 1).split('/')[0]))],
  deleteAsync: async (uri: string) => {
    for (const path of mockFs.files.keys()) if (path === uri || path.startsWith(`${uri}/`)) mockFs.files.delete(path);
  },
  writeAsStringAsync: async (uri: string, content: string) => {
    mockFs.files.set(uri, Uint8Array.from(Buffer.from(content)));
  },
  copyAsync: async ({ from, to }: { from: string; to: string }) => {
    const bytes = mockFs.files.get(from);
    if (!bytes) throw new Error('source does not exist');
    mockFs.files.set(to, Uint8Array.from(bytes));
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    const bytes = mockFs.files.get(from);
    if (!bytes) throw new Error('source does not exist');
    mockFs.files.set(to, bytes);
    mockFs.files.delete(from);
  },
}));

vi.mock('expo-image', () => ({ Image: { clearDiskCache: async () => true, clearMemoryCache: async () => true } }));
vi.mock('@/features/storage-management/ui-icon-fonts', () => ({ reloadUiIconFonts: async () => undefined }));

vi.mock('expo-asset', () => ({ Asset: { fromModule: (moduleId: number) => ({
  localUri: `file://asset/${moduleId}`, type: 'js', downloadAsync: async () => undefined,
}) } }));

const SKIN_URL = 'https://rranker-phigros-data.cn-nb1.rains3.com/chart-preview/skin/Tap2.png';
const SKIN_BYTES = Uint8Array.from([1, 2, 3, 4]);
const SOUND_URL = 'https://rranker-phigros-data.cn-nb1.rains3.com/chart-preview/hit-sounds/click.wav';
const SOUND_BYTES = Uint8Array.from([9, 9, 9]);

function stageUri(fileName: string): string {
  return `file://cache/rranker-test/${fileName}`;
}

async function runPlan(
  overrides: Partial<Parameters<typeof prepareChartPreviewWebviewFromPlan>[0]> = {},
  onProgress?: Parameters<typeof prepareChartPreviewWebviewFromPlan>[2],
) {
  return prepareChartPreviewWebviewFromPlan({
    directoryName: 'rranker-test',
    directory: mockFs.makeStageDirectory('rranker-test') as never,
    stagedAssets: [],
    htmlModuleId: 1,
    buildHtml: (template, dataUrls) => `html(${template},${JSON.stringify(dataUrls)})`,
    ...overrides,
  }, undefined, onProgress);
}

describe('chart preview plan executor remote assets', () => {
  beforeEach(() => {
    mockFs.files.clear();
    mockFs.remotes.clear();
    mockFs.downloadCalls.length = 0;
    mockFs.onDownloadReady.mockReset();
    mockFs.files.set('file://asset/1', Uint8Array.from(Buffer.from('<html>')));
    mockFs.files.set('file://asset/7', Uint8Array.from([7, 8, 9]));
  });

  it('downloads remote staged assets once and skips when a non-empty cache file exists', async () => {
    mockFs.remotes.set(SKIN_URL, SKIN_BYTES);

    await runPlan({ stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }] });

    expect(mockFs.downloadCalls).toEqual([SKIN_URL]);
    expect(mockFs.files.get(stageUri('skin/Tap2.png'))).toEqual(SKIN_BYTES);
    expect([...mockFs.files.keys()].filter(uri => uri.startsWith(stageUri(''))).sort())
      .toEqual([stageUri('index.html'), stageUri('skin/Tap2.png')]);

    await runPlan({ stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }] });
    expect(mockFs.downloadCalls).toEqual([SKIN_URL]);
  });

  it('skips a non-empty cache even when the byte estimate differs', async () => {
    mockFs.remotes.set(SKIN_URL, SKIN_BYTES);
    await runPlan({ stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }] });
    mockFs.files.set(stageUri('skin/Tap2.png'), Uint8Array.from([1]));

    await runPlan({ stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }] });
    expect(mockFs.downloadCalls).toEqual([SKIN_URL]);
    expect(mockFs.files.get(stageUri('skin/Tap2.png'))).toEqual(Uint8Array.from([1]));
  });

  it('accepts a remote file when the byte estimate is wrong', async () => {
    const badUrl = `${SKIN_URL}?bad`;
    mockFs.remotes.set(badUrl, SKIN_BYTES);
    await runPlan({
      stagedAssets: [{ fileName: 'skin/Bad.png', url: badUrl, bytes: SKIN_BYTES.byteLength + 1 }],
    });
    expect(mockFs.files.get(stageUri('skin/Bad.png'))).toEqual(SKIN_BYTES);
    expect([...mockFs.files.keys()].filter(uri => uri.startsWith(stageUri(''))).sort())
      .toEqual([stageUri('index.html'), stageUri('skin/Bad.png')]);
  });

  it('copies bundled player bytes and disposes the prepared document', async () => {
    mockFs.remotes.set(SKIN_URL, SKIN_BYTES);
    const result = await runPlan({
      stagedAssets: [
        { fileName: 'player.js', moduleId: 7 },
        { fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength },
      ],
    });

    expect(mockFs.files.get(stageUri('player.js'))).toEqual(Uint8Array.from([7, 8, 9]));
    expect(result.uri).toBe(stageUri('index.html'));
    await result.dispose();
    expect(mockFs.files.has(stageUri('index.html'))).toBe(false);
  });

  it('feeds remote data url assets to buildHtml after staging them', async () => {
    mockFs.remotes.set(SOUND_URL, SOUND_BYTES);
    let seen: Record<string, string> = {};
    await runPlan({
      dataUrlAssets: [{ key: 'click', fileName: 'hit-sounds/click.wav', url: SOUND_URL, bytes: SOUND_BYTES.byteLength }],
      buildHtml: (_template, dataUrls) => {
        seen = dataUrls;
        return `<audio src="${dataUrls.click}"></audio>`;
      },
    });

    expect(mockFs.downloadCalls).toEqual([SOUND_URL]);
    expect(mockFs.files.get(stageUri('hit-sounds/click.wav'))).toEqual(SOUND_BYTES);
    expect(seen.click).toBe('data:audio/wav;base64,CQkJ');
    expect(Buffer.from(mockFs.files.get(stageUri('index.html'))!).toString()).toContain(seen.click);
  });

  it('reports monotonic remote download then player progress', async () => {
    mockFs.remotes.set(SKIN_URL, SKIN_BYTES);
    const values: number[] = [];
    await runPlan(
      { stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }] },
      (progress) => values.push(progress.value),
    );
    expect(values.length).toBeGreaterThan(1);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]!).toBeGreaterThanOrEqual(values[index - 1]!);
    }
    expect(values[values.length - 1]).toBe(1);
  });
  it('copies remote skins from a persistent cache directory without re-downloading', async () => {
    mockFs.remotes.set(SKIN_URL, SKIN_BYTES);
    const cacheDir = mockFs.makeStageDirectory('rranker-chart-preview-remote') as never;
    const stagedName = 'skin/Tap2.png';

    await runPlan({
      remoteCacheDirectory: cacheDir,
      stagedAssets: [{ fileName: stagedName, url: SKIN_URL, bytes: SKIN_BYTES.byteLength }],
    });
    expect(mockFs.downloadCalls).toEqual([SKIN_URL]);
    expect(mockFs.files.get(`file://cache/rranker-chart-preview-remote/${stagedName}`)?.byteLength).toBe(SKIN_BYTES.byteLength);

    for (const key of [...mockFs.files.keys()]) {
      if (key.startsWith('file://cache/rranker-test/')) mockFs.files.delete(key);
    }

    await runPlan({
      remoteCacheDirectory: cacheDir,
      stagedAssets: [{ fileName: stagedName, url: SKIN_URL, bytes: SKIN_BYTES.byteLength }],
    });
    expect(mockFs.downloadCalls).toEqual([SKIN_URL]);
    expect(mockFs.files.get(stageUri(stagedName))?.byteLength).toBe(SKIN_BYTES.byteLength);
  });

  it('does not recreate cleared preview files after a delayed download', async () => {
    mockFs.remotes.set(SKIN_URL, SKIN_BYTES);
    mockFs.onDownloadReady.mockImplementationOnce(async () => {
      invalidateResourceWrites('shared');
      mockFs.files.clear();
    });
    await expect(runPlan({
      remoteCacheDirectory: mockFs.makeStageDirectory('remote') as never,
      stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }],
    })).rejects.toThrow('缓存请求已失效');
    expect([...mockFs.files.keys()].filter(uri => uri.startsWith('file://cache/'))).toEqual([]);
  });

  it('finishes shared cache clearing after a pending native publish and permits a fresh preview', async () => {
    const fileSystem = await import('expo-file-system/legacy');
    const moveFile = fileSystem.moveAsync;
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const move = vi.spyOn(fileSystem, 'moveAsync').mockImplementationOnce(async options => {
      entered.resolve();
      await resume.promise;
      await moveFile(options);
    });
    mockFs.remotes.set(SKIN_URL, SKIN_BYTES);
    const plan = {
      remoteCacheDirectory: mockFs.makeStageDirectory('rranker-chart-preview-remote') as never,
      stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }],
    };
    try {
      const previous = expect(runPlan(plan)).rejects.toThrow('缓存请求已失效');
      await entered.promise;
      const clearing = clearSharedCache();
      resume.resolve();
      await previous;
      await clearing;
      expect([...mockFs.files.keys()].filter(uri => uri.startsWith('file://cache/'))).toEqual([]);
      await runPlan(plan);
      expect(mockFs.files.get(stageUri('skin/Tap2.png'))).toEqual(SKIN_BYTES);
    } finally { resume.resolve(); move.mockRestore(); }
  });


});
