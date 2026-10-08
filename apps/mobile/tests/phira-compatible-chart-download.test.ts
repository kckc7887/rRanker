
import JSZip from 'jszip';

import type { PhiraChart } from '@/domain/phira';

import { ChartPackageDownloadCancelledError, ChartPackageDownloadError } from '@/features/chart-download-shared/chart-download-shared';

import { downloadPhigrosChartAsPhiraPackage, phiraCompatiblePackageName } from '@/features/phigros-chart-download/chart-package-download';
import { downloadPhiraChartPackage } from '@/features/phira-chart-download/chart-package-download';

const native = vi.hoisted(() => ({
  bytes: new Map<string, Uint8Array>(),
  cancelDownload: vi.fn(),
  createFileCalls: [] as { name: string; mime: string | null }[],
  createdDirs: [] as string[],
  deleted: [] as string[],
  downloaded: [] as { url: string; uri: string }[],
  pickDirectoryAsync: vi.fn(),
  copyError: undefined as Error | undefined,
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
    copy(destination: MockFile) {
      if (native.copyError) throw native.copyError;
      const content = native.bytes.get(this.uri);
      if (!content) throw new Error('Source file does not exist');
      native.writes.push({ uri: destination.uri, content });
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
    delete() {
      native.deleted.push(this.uri);
      for (const uri of native.bytes.keys()) {
        if (uri.startsWith(`${this.uri}/`)) native.bytes.delete(uri);
      }
    }
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

vi.mock('@/services/phigros-chart-preview-resources', () => ({
  loadPhigrosChartPreviewResources: async (target: unknown, signal: unknown, read: (asset: { url: string }, index: number) => Promise<Uint8Array>) => {
    const bundle = await resources.loadBundle(target, signal);
    return { bundle, chart: await read(bundle.chart, 0), music: await read(bundle.music, 1), illustration: await read(bundle.illustration, 2) };
  },
}));

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

function pickedDirectoryMock(uri = 'picked://') {
  const prefix = uri.endsWith('/') ? uri : `${uri}/`;
  return {
    uri,
    createFile: (name: string, mime: string | null) => {
      native.createFileCalls.push({ name, mime });
      return {
        uri: `${prefix}${name}`,
        write: (content: string | Uint8Array) => native.writes.push({ uri: `${prefix}${name}`, content }),
      };
    },
  };
}

describe('Phira compatible chart download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.bytes.clear();
    native.createFileCalls.length = 0;
    native.createdDirs.length = 0;
    native.deleted.length = 0;
    native.downloaded.length = 0;
    native.writes.length = 0;
    native.copyError = undefined;
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
    const source = new TextEncoder().encode(`resource:${phiraChart.file}`);
    const written = native.writes.find((item) => item.uri === 'picked://初音未来的消失 AT Lv.16.zip');
    expect(written?.content).toEqual(source);
    expect(native.bytes.size).toBe(0);
    expect(native.deleted).toEqual(native.createdDirs);
  });

  it.each(['file:///exports', 'content://exports'])('retains the Phira source while choosing %s', async (uri) => {
    let chooseDirectory!: (directory: ReturnType<typeof pickedDirectoryMock>) => void;
    native.pickDirectoryAsync.mockImplementationOnce(() => new Promise((resolve) => {
      chooseDirectory = resolve;
    }));
    const pending = downloadPhiraChartPackage(phiraChart);
    const result = expect(pending).resolves.toBe(true);
    await vi.waitFor(() => expect(native.pickDirectoryAsync).toHaveBeenCalledOnce());
    const sourceUri = native.downloaded[0]!.uri;
    const sourceBeforeSave = native.bytes.get(sourceUri);
    const deletedBeforeSave = [...native.deleted];

    chooseDirectory(pickedDirectoryMock(uri));
    await result;

    expect(sourceBeforeSave).toEqual(new TextEncoder().encode(`resource:${phiraChart.file}`));
    expect(deletedBeforeSave).toEqual([]);
    expect(native.writes).toEqual([{ uri: `${uri}/初音未来的消失 AT Lv.16.zip`, content: sourceBeforeSave }]);
    expect(native.bytes.has(sourceUri)).toBe(false);
    expect(native.deleted).toEqual(native.createdDirs);
  });

  it.each(['cancel', 'copy failure'] as const)('releases the Phira source after delayed %s', async (outcome) => {
    let chooseDirectory!: (directory: ReturnType<typeof pickedDirectoryMock>) => void;
    let rejectPicker!: (error: Error) => void;
    native.pickDirectoryAsync.mockImplementationOnce(() => new Promise((resolve, reject) => {
      chooseDirectory = resolve;
      rejectPicker = reject;
    }));
    const copyError = new Error('Copy failed');
    const pending = downloadPhiraChartPackage(phiraChart);
    const result = outcome === 'cancel'
      ? expect(pending).resolves.toBe(false)
      : expect(pending).rejects.toMatchObject({ cause: copyError });
    await vi.waitFor(() => expect(native.pickDirectoryAsync).toHaveBeenCalledOnce());
    const sourceExistsBeforeSave = native.bytes.has(native.downloaded[0]!.uri);
    const deletedBeforeSave = [...native.deleted];

    if (outcome === 'cancel') {
      rejectPicker(Object.assign(new Error('The file picker was cancelled by the user'), { code: 'ERR_PICKER_CANCELLED' }));
    } else {
      native.copyError = copyError;
      chooseDirectory(pickedDirectoryMock());
    }
    await result;

    expect(sourceExistsBeforeSave).toBe(true);
    expect(deletedBeforeSave).toEqual([]);
    expect(native.writes).toEqual([]);
    expect(native.bytes.size).toBe(0);
    expect(native.deleted).toEqual(native.createdDirs);
  });

  it('treats closing the system directory picker as cancellation', async () => {
    native.pickDirectoryAsync.mockRejectedValueOnce(
      Object.assign(new Error('The file picker was cancelled by the user'), { code: 'ERR_PICKER_CANCELLED' }),
    );
    await expect(downloadPhiraChartPackage(phiraChart)).resolves.toBe(false);
    expect(native.writes).toEqual([]);
  });

  it.each([
    ['Phira', 'file:///exports'], ['Phira', 'content://exports'],
    ['Phigros', 'file:///exports'], ['Phigros', 'content://exports'],
  ])('%s 在目录选择期间取消后不向 %s 保存谱包', async (game, uri) => {
    let chooseDirectory!: (directory: ReturnType<typeof pickedDirectoryMock>) => void;
    native.pickDirectoryAsync.mockImplementationOnce(() => new Promise(resolve => { chooseDirectory = resolve; }));
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const pending = game === 'Phira'
      ? downloadPhiraChartPackage(phiraChart, options)
      : downloadPhigrosChartAsPhiraPackage({ songId: 'Song.A', levelIndex: 2 }, options);
    const result = expect(pending).rejects.toBeInstanceOf(ChartPackageDownloadCancelledError);
    await vi.waitFor(() => expect(native.pickDirectoryAsync).toHaveBeenCalled());

    controller.abort();
    chooseDirectory(pickedDirectoryMock(uri));
    await result;

    expect(native.createFileCalls).toEqual([]);
    expect(native.writes).toEqual([]);
    expect(native.bytes.size).toBe(0);
    expect(native.deleted).toEqual(native.createdDirs);
  });

  it('rejects a Phira chart without a downloadable file', async () => {
    await expect(downloadPhiraChartPackage({ ...phiraChart, file: null }))
      .rejects.toBeInstanceOf(ChartPackageDownloadError);
    expect(native.downloaded).toEqual([]);
  });
});
