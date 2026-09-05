const native = vi.hoisted(() => ({
  bytes: new Map<string, Uint8Array>(),
  cancelDownload: vi.fn(),
  copyWait: null as Promise<void> | null,
  createFileCalls: [] as { name: string; mime: string | null }[],
  createdDirs: [] as string[],
  deleted: [] as string[],
  downloaded: [] as { url: string; uri: string }[],
  pickDirectoryAsync: vi.fn(),
  writes: [] as { uri: string; content: string | Uint8Array }[],
}));

const resources = vi.hoisted(() => ({
  loadBundle: vi.fn(),
}));

vi.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists() { return native.bytes.has(this.uri); }
    get size() { return native.bytes.get(this.uri)?.length ?? 0; }
    async bytes() { return native.bytes.get(this.uri) ?? new Uint8Array(0); }
    write(content: string | Uint8Array) { native.writes.push({ uri: this.uri, content }); }
    async copy(destination: MockFile) {
      if (native.copyWait) await native.copyWait;
      native.writes.push({ uri: destination.uri, content: native.bytes.get(this.uri) ?? new Uint8Array(0) });
    }
  }
  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    create() { native.createdDirs.push(this.uri); }
    createFile(name: string, mime: string | null) {
      native.createFileCalls.push({ name, mime });
      return new MockFile(`picked://${name}`);
    }
    get exists() { return this.uri.startsWith('file:///cache/'); }
    delete() { native.deleted.push(this.uri); }
    static pickDirectoryAsync() { return native.pickDirectoryAsync(); }
  }
  return { Paths: { cache: 'file:///cache' }, File: MockFile, Directory: MockDirectory };
});

vi.mock('expo-file-system/legacy', () => ({
  createDownloadResumable: (
    url: string,
    uri: string,
    _options: unknown,
    onProgress?: (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
  ) => ({
    downloadAsync: async () => {
      native.downloaded.push({ url, uri });
      const bytes = new TextEncoder().encode(`resource:${url}`);
      native.bytes.set(uri, bytes);
      onProgress?.({ totalBytesWritten: bytes.length, totalBytesExpectedToWrite: bytes.length });
      return { uri, status: 200, headers: {} };
    },
    cancelAsync: () => native.cancelDownload(),
  }),
}));

vi.mock('@/domain/phigros-chart-preview', () => ({
  loadPhigrosChartPreviewBundle: (...args: unknown[]) => resources.loadBundle(...args),
  phigrosChartPreviewLevelLabel: (levelIndex: number) => ['EZ', 'HD', 'IN', 'AT'][levelIndex],
}));

// Native Expo modules must be mocked before importing the download module.
// eslint-disable-next-line import/first
import JSZip from 'jszip';
// eslint-disable-next-line import/first
import type { PhiraChart } from '@/domain/phira';
// eslint-disable-next-line import/first
import { ChartPackageDownloadError } from '@/features/chart-download-shared/chart-download-shared';
// eslint-disable-next-line import/first
import {
  downloadPhigrosChartAsPhiraPackage,
  downloadPhiraChartPackage,
  phiraCompatiblePackageName,
} from '@/features/phira-compatible-chart-download/phira-compatible-chart-download';

const phiraChart: PhiraChart = {
  id: 38294,
  name: '初音未来的消失',
  level: 'AT Lv.16',
  difficulty: 16.2,
  charter: '谱师',
  composer: '曲师',
  illustrator: '画师',
  description: null,
  ranked: true,
  stable: true,
  illustration: null,
  preview: null,
  file: 'https://phira.example/chart.zip',
  uploader: 1,
  tags: [],
  rating: null,
  ratingCount: 0,
  created: null,
  updated: null,
  chartUpdated: null,
};

function pickedDirectoryMock() {
  return {
    createFile: (name: string, mime: string | null) => {
      native.createFileCalls.push({ name, mime });
      return {
        uri: `picked://${name}`,
        write: (content: string | Uint8Array) => native.writes.push({ uri: `picked://${name}`, content }),
      };
    },
  };
}

describe('Phira compatible chart download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.bytes.clear();
    native.copyWait = null;
    native.createFileCalls.length = 0;
    native.createdDirs.length = 0;
    native.deleted.length = 0;
    native.downloaded.length = 0;
    native.writes.length = 0;
    native.pickDirectoryAsync.mockResolvedValue(pickedDirectoryMock());
    native.cancelDownload.mockResolvedValue(undefined);
    resources.loadBundle.mockResolvedValue({
      target: { songId: 'Song.A', difficulty: 'IN' },
      gameVersion: '3.19.0',
      resourceVersion: 'test',
      publishedAt: null,
      song: {
        id: 'Song.A',
        title: '测试曲',
        composer: '测试曲师',
        illustrator: '测试画师',
        charter: '测试谱师',
        difficultyConstant: 14.8,
      },
      chart: { url: 'https://assets.example/chart.json' },
      music: { url: 'https://assets.example/music.ogg' },
      illustration: { url: 'https://assets.example/illustration.png' },
    });
  });

  it('sanitizes package names while retaining the level suffix', () => {
    expect(phiraCompatiblePackageName('A:B*C?D', 'IN')).toBe('A_B_C_D IN.zip');
    expect(phiraCompatiblePackageName('x'.repeat(80), 'AT')).toBe(`${'x'.repeat(37)} AT.zip`);
  });

  it('builds a root-level PGR package that Phira can identify', async () => {
    const progress: string[] = [];
    await expect(downloadPhigrosChartAsPhiraPackage({
      songId: 'Song.A',
      levelIndex: 2,
      title: '测试曲',
    }, {
      onProgress: ({ phase, progress: value }) => progress.push(`${phase}:${Math.round(value * 100)}`),
    })).resolves.toBe(true);

    expect(native.downloaded.map((item) => item.url)).toEqual([
      'https://assets.example/chart.json',
      'https://assets.example/music.ogg',
      'https://assets.example/illustration.png',
    ]);
    expect(native.createFileCalls).toEqual([{ name: '测试曲 IN.zip', mime: 'application/zip' }]);
    const written = native.writes.find((item) => item.uri === 'picked://测试曲 IN.zip');
    const zip = await JSZip.loadAsync(written!.content as Uint8Array);
    expect(Object.keys(zip.files).sort()).toEqual([
      'chart.json',
      'illustration.png',
      'info.yml',
      'music.ogg',
    ]);
    expect(JSON.parse(await zip.file('info.yml')!.async('text'))).toEqual({
      name: '测试曲',
      difficulty: 14.8,
      level: 'IN Lv.14.8',
      charter: '测试谱师',
      composer: '测试曲师',
      illustrator: '测试画师',
      chart: 'chart.json',
      format: 'pgr',
      music: 'music.ogg',
      illustration: 'illustration.png',
    });
    expect(progress).toContain('downloading:100');
    expect(progress).toContain('organizing:100');
    expect(native.deleted).toContainEqual(expect.stringContaining('rranker-chart-download-'));
  });

  it('saves the Phira package bytes without rebuilding the zip', async () => {
    await expect(downloadPhiraChartPackage(phiraChart)).resolves.toBe(true);
    expect(native.downloaded.map((item) => item.url)).toEqual(['https://phira.example/chart.zip']);
    expect(native.createFileCalls).toEqual([{ name: '初音未来的消失 AT Lv.16.zip', mime: 'application/zip' }]);
    const source = native.bytes.get(native.downloaded[0]!.uri);
    const written = native.writes.find((item) => item.uri === 'picked://初音未来的消失 AT Lv.16.zip');
    expect(written?.content).toEqual(source);
  });

  it('treats closing the system directory picker as cancellation', async () => {
    native.pickDirectoryAsync.mockRejectedValueOnce(
      Object.assign(new Error('The file picker was cancelled by the user'), { code: 'ERR_PICKER_CANCELLED' }),
    );
    await expect(downloadPhiraChartPackage(phiraChart)).resolves.toBe(false);
    expect(native.writes).toEqual([]);
  });

  it('keeps the downloaded source alive until an asynchronous copy finishes', async () => {
    let finish!: () => void;
    native.copyWait = new Promise<void>((resolve) => { finish = resolve; });
    const pending = downloadPhiraChartPackage(phiraChart);
    await vi.waitFor(() => expect(native.createFileCalls).toHaveLength(1));
    expect(native.deleted).toEqual([]);
    expect(native.writes).toEqual([]);
    finish();
    await expect(pending).resolves.toBe(true);
    expect(native.writes).toHaveLength(1);
    expect(native.deleted).toContainEqual(expect.stringContaining('rranker-chart-download-'));
  });

  it('does not report success when cancelled while the copy is pending', async () => {
    let finish!: () => void;
    const controller = new AbortController();
    native.copyWait = new Promise<void>((resolve) => { finish = resolve; });
    const pending = downloadPhiraChartPackage(phiraChart, { signal: controller.signal });
    const result = expect(pending).rejects.toThrow('谱面下载已取消');
    await vi.waitFor(() => expect(native.createFileCalls).toHaveLength(1));
    controller.abort();
    expect(native.deleted).toEqual([]);
    finish();
    await result;
    expect(native.deleted).toContainEqual(expect.stringContaining('rranker-chart-download-'));
  });

  it('rejects a Phira chart without a downloadable file', async () => {
    await expect(downloadPhiraChartPackage({ ...phiraChart, file: null }))
      .rejects.toBeInstanceOf(ChartPackageDownloadError);
    expect(native.downloaded).toEqual([]);
  });
});
