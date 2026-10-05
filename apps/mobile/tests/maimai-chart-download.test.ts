import { downloadSimaiPackage } from '@/features/chart-download-shared/simai-package';
import { storedZipEnd, storedZipHeader } from '@/features/chart-download-shared/stored-zip';
import { createChartPreviewCrc32 } from '@/features/chart-preview-shared/chart-preview-resource-budget';
import { saveChartPackage } from '@/features/chart-download-shared/chart-download-shared';
import { Directory } from 'expo-file-system';
const native = vi.hoisted(() => ({
  downloadFileAsync: vi.fn(),
  pickDirectoryAsync: vi.fn(),
  downloaded: [] as { url: string; uri: string }[],
  texts: new Map<string, string>(),
  bytes: new Map<string, Uint8Array>(),
  resourceBytes: new Map<string, Uint8Array>(),
  writes: [] as { uri: string; content: string | Uint8Array }[],
  createFileCalls: [] as { name: string; mime: string | null }[],
  deleted: [] as string[],
  createdDirs: [] as string[],
  cancelDownload: vi.fn(),
  reads: [] as number[],
  closed: [] as string[],
  shortReads: false,
  shortWrites: false,
  emptyRead: false,
  writeError: undefined as Error | undefined,
  deleteError: undefined as Error | undefined,
}));

vi.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    static async downloadFileAsync(url: string, file: MockFile) {
      await native.downloadFileAsync(url, file.uri);
      native.texts.set(file.uri, `${url}\n谱面内容`);
      native.bytes.set(file.uri, new TextEncoder().encode(`${url}\n谱面内容`));
      return file;
    }
    get exists() { return native.bytes.has(this.uri); }
    get size() { return native.bytes.get(this.uri)?.length ?? 0; }
    async text() { return native.texts.get(this.uri) ?? ''; }
    async bytes() { throw new Error('whole-file reads are forbidden'); }
    create() { native.bytes.set(this.uri, new Uint8Array()); }
    copy(destination: { uri: string; write: (bytes: Uint8Array) => void }) {
      if (destination.uri.startsWith('file://') && native.bytes.has(destination.uri)) {
        throw new Error('The destination file already exists');
      }
      destination.write(native.bytes.get(this.uri)!);
    }
    open() {
      const uri = this.uri;
      let offset = 0;
      let closed = false;
      return {
        get offset() { return offset; }, set offset(value: number) { offset = value; },
        get size() { return native.bytes.get(uri)?.length ?? 0; },
        readBytes(length: number) {
          if (closed) throw new Error('closed');
          native.reads.push(length);
          if (native.emptyRead) return new Uint8Array();
          const end = offset + (native.shortReads ? Math.min(length, 4096) : length);
          const chunk = native.bytes.get(uri)!.slice(offset, end);
          offset += chunk.length;
          return chunk;
        },
        writeBytes(bytes: Uint8Array) {
          if (closed) throw new Error('closed');
          if (native.writeError) throw native.writeError;
          if (native.shortWrites) bytes = bytes.subarray(0, Math.min(bytes.length, 4096));
          const previous = native.bytes.get(uri)!;
          const next = new Uint8Array(Math.max(previous.length, offset + bytes.length));
          next.set(previous); next.set(bytes, offset); offset += bytes.length;
          native.bytes.set(uri, next);
        },
        close() { closed = true; native.closed.push(uri); },
      };
    }
    write(content: string | Uint8Array) {
      native.writes.push({ uri: this.uri, content });
      native.bytes.set(this.uri, typeof content === 'string' ? new TextEncoder().encode(content) : content);
    }
    delete() { if (native.deleteError) throw native.deleteError; native.deleted.push(this.uri); native.bytes.delete(this.uri); }
  }
  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    create() { native.createdDirs.push(this.uri); }
    createFile(name: string, mime: string | null) {
      native.createFileCalls.push({ name, mime });
      const file = new MockFile(this, name);
      if (file.exists) throw new Error('The destination file already exists');
      file.create();
      return file;
    }
    get exists() { return this.uri.startsWith('file:///cache/'); }
    delete() {
      if (native.deleteError) throw native.deleteError;
      native.deleted.push(this.uri);
      for (const uri of native.bytes.keys()) if (uri.startsWith(`${this.uri}/`)) native.bytes.delete(uri);
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
      await native.downloadFileAsync(url, uri);
      native.texts.set(uri, `${url}\n谱面内容`);
      native.bytes.set(uri, native.resourceBytes.get(url) ?? new TextEncoder().encode(`${url}\n谱面内容`));
      onProgress?.({ totalBytesWritten: 100, totalBytesExpectedToWrite: 100 });
      return { uri, status: 200, headers: {} };
    },
    cancelAsync: () => native.cancelDownload(),
  }),
}));

// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import JSZip from 'jszip';
// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import {
  downloadMaimaiChartPackage,
  MaimaiChartDownloadCancelledError,
  MaimaiChartDownloadError,
  maimaiChartPackageName,
} from '@/features/maimai-chart-download/maimai-chart-download';

function pickedDirectoryMock() {
  return {
    uri: 'picked://',
    createFile: (name: string, mime: string | null) => {
      native.createFileCalls.push({ name, mime });
      return {
        uri: `picked://${name}`,
        write: (content: string | Uint8Array) => native.writes.push({ uri: `picked://${name}`, content }),
      };
    },
  };
}

describe('maimai chart download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.downloaded.length = 0;
    native.texts.clear();
    native.bytes.clear();
    native.resourceBytes.clear();
    native.writes.length = 0;
    native.createFileCalls.length = 0;
    native.deleted.length = 0;
    native.createdDirs.length = 0;
    native.reads.length = 0;
    native.closed.length = 0;
    native.shortReads = false;
    native.shortWrites = false;
    native.emptyRead = false;
    native.writeError = undefined;
    native.deleteError = undefined;
    native.downloadFileAsync.mockImplementation(async (url: string, uri: string) => {
      native.downloaded.push({ url, uri });
    });
    native.pickDirectoryAsync.mockResolvedValue(pickedDirectoryMock());
    native.cancelDownload.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sanitizes package names and truncates long titles', () => {
    expect(maimaiChartPackageName('A:B*C?D"E<F>G/H\\I|J', 'DX', '12+')).toBe('A_B_C_D_E_F_G_H_I_J DX 12+');
    expect(maimaiChartPackageName('x'.repeat(80), 'SD', '10')).toBe(`${'x'.repeat(34)} SD 10`);
    expect(maimaiChartPackageName('   ', 'DX', '14')).toBe('DX 14');
    expect(maimaiChartPackageName('協', 'UTAGE', '協')).toBe('協 UTAGE 協');
  });

  it('downloads chart, music, jacket and optional video into an AstroDX zip', async () => {
    const saved = await downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'DX',
      levelIndex: 3,
      levelLabel: '12+',
      title: '测试曲目',
      includeVideo: true,
    });
    expect(saved).toBe(true);

    expect(native.downloaded.map((entry) => entry.url)).toEqual([
      'https://assets2.lxns.net/maimai/chart/10123.txt',
      'https://assets2.lxns.net/maimai/music/123.mp3',
      'https://assets2.lxns.net/maimai/jacket/123.png',
      'https://maimai-video.lxns.net/123.mp4',
    ]);

    expect(native.createFileCalls).toEqual([{ name: '测试曲目 DX 12+.adx.zip', mime: 'application/zip' }]);
    const written = native.writes.find((entry) => entry.uri.startsWith('picked://'));
    expect(written).toBeTruthy();
    const zip = await JSZip.loadAsync(written!.content as Uint8Array);
    const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir).sort();
    expect(fileNames).toEqual([
      '测试曲目 DX 12+/bg.png',
      '测试曲目 DX 12+/maidata.txt',
      '测试曲目 DX 12+/pv.mp4',
      '测试曲目 DX 12+/track.mp3',
    ]);
    expect(await zip.file('测试曲目 DX 12+/maidata.txt')!.async('string')).toContain('chart/10123.txt');
    expect(await zip.file('测试曲目 DX 12+/pv.mp4')!.async('string')).toContain('maimai-video.lxns.net');

    const staging = native.createdDirs.find((uri) => uri.includes('rranker-chart-download-'));
    expect(staging).toBeTruthy();
    expect(native.deleted).toContain(staging);
  });

  it('omits pv.mp4 when the player picks cover only', async () => {
    const saved = await downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'SD',
      levelIndex: 0,
      levelLabel: '5',
      title: '测试曲目',
      includeVideo: false,
    });
    expect(saved).toBe(true);
    expect(native.downloaded.map((entry) => entry.url)).not.toContain('https://maimai-video.lxns.net/123.mp4');
    const written = native.writes.find((entry) => entry.uri.startsWith('picked://'));
    const zip = await JSZip.loadAsync(written!.content as Uint8Array);
    const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir).sort();
    expect(fileNames).toEqual([
      '测试曲目 SD 5/bg.png',
      '测试曲目 SD 5/maidata.txt',
      '测试曲目 SD 5/track.mp3',
    ]);
  });

  it.each([
    {
      name: '舞萌 DX 12+.adx.zip',
      chart: '舞萌 DX 12+/maidata.txt',
      download: () => downloadMaimaiChartPackage({ songId: '123', chartType: 'DX', levelIndex: 3, levelLabel: '12+', title: '舞萌', includeVideo: false }),
    },
    {
      name: 'Majdata Master.zip',
      chart: 'Majdata Master/maidata.txt',
      download: () => downloadSimaiPackage({ title: 'Majdata', suffix: 'Master', resources: [{ fileName: 'maidata.txt', url: 'https://majdata.net/chart' }] }),
    },
  ])('saves a nonempty iOS package as $name without precreating the copy target', async ({ name, chart, download }) => {
    native.pickDirectoryAsync.mockResolvedValueOnce(new Directory('file:///exports'));

    await expect(download()).resolves.toBe(true);

    const bytes = native.bytes.get(`file:///exports/${name}`)!;
    expect(bytes.length).toBeGreaterThan(0);
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    expect(await zip.file(chart)!.async('string')).toContain('谱面内容');
    expect(native.createFileCalls).toEqual([]);
    expect(native.deleted).toContain(native.createdDirs[0]);
  });

  it('preserves an existing iOS package when native copying rejects the same name', async () => {
    const uri = 'file:///exports/Majdata Master.zip';
    const original = new Uint8Array([1, 2, 3]);
    native.bytes.set(uri, original);
    native.pickDirectoryAsync.mockResolvedValueOnce(new Directory('file:///exports'));

    await expect(downloadSimaiPackage({ title: 'Majdata', suffix: 'Master', resources: [{ fileName: 'maidata.txt', url: 'https://majdata.net/chart' }] }))
      .rejects.toBeInstanceOf(MaimaiChartDownloadError);

    expect(native.bytes.get(uri)).toEqual(original);
    expect(native.createFileCalls).toEqual([]);
    expect(native.deleted).not.toContain(uri);
    expect(native.deleted).toContain(native.createdDirs[0]);
  });

  it('keeps creating and writing the destination for iOS byte output', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    native.pickDirectoryAsync.mockResolvedValueOnce(new Directory('file:///exports'));

    await expect(saveChartPackage('bytes.zip', { kind: 'bytes', bytes })).resolves.toBe(true);

    expect(native.createFileCalls).toEqual([{ name: 'bytes.zip', mime: 'application/zip' }]);
    expect(native.bytes.get('file:///exports/bytes.zip')).toEqual(bytes);
  });

  it('reports download and organizing progress before opening the save location', async () => {
    const events: string[] = [];
    native.pickDirectoryAsync.mockImplementationOnce(async () => {
      events.push('picker');
      return pickedDirectoryMock();
    });

    await downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'DX',
      levelIndex: 3,
      levelLabel: '12+',
      title: '测试曲目',
      includeVideo: false,
    }, {
      onProgress: ({ phase, progress }) => events.push(`${phase}:${Math.round(progress * 100)}`),
      onReadyToSave: () => {
        events.push('ready');
      },
    });

    expect(events).toContain('downloading:100');
    expect(events).toContain('organizing:100');
    expect(events.indexOf('ready')).toBeLessThan(events.indexOf('picker'));
  });

  it('cancels the active download and does not open the save location', async () => {
    const controller = new AbortController();
    let rejectDownload!: (error: Error) => void;
    native.downloadFileAsync.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectDownload = reject;
    }));
    native.cancelDownload.mockImplementationOnce(async () => {
      rejectDownload(new Error('cancelled'));
    });

    const result = downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'DX',
      levelIndex: 3,
      levelLabel: '12+',
      title: '测试曲目',
      includeVideo: false,
    }, { signal: controller.signal });
    await vi.waitFor(() => expect(native.downloadFileAsync).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(result).rejects.toBeInstanceOf(MaimaiChartDownloadCancelledError);
    expect(native.cancelDownload).toHaveBeenCalledTimes(1);
    expect(native.pickDirectoryAsync).not.toHaveBeenCalled();
    const staging = native.createdDirs.find((uri) => uri.includes('rranker-chart-download-'));
    expect(native.deleted).toContain(staging);
  });

  it('returns false without writing when the save dialog is cancelled', async () => {
    native.pickDirectoryAsync.mockRejectedValueOnce(
      Object.assign(new Error('The file picker was cancelled by the user'), { code: 'ERR_PICKER_CANCELLED' }),
    );
    const saved = await downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'DX',
      levelIndex: 3,
      levelLabel: '12+',
      title: '测试曲目',
      includeVideo: false,
    });
    expect(saved).toBe(false);
    expect(native.createFileCalls).toEqual([]);
    expect(native.writes).toEqual([]);
    const staging = native.createdDirs.find((uri) => uri.includes('rranker-chart-download-'));
    expect(native.deleted).toContain(staging);
  });

  it('fails with a typed error when a resource or the picker fails, and cleans staging', async () => {
    native.downloadFileAsync.mockRejectedValueOnce(new Error('UnableToDownload status 404'));
    await expect(downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'DX',
      levelIndex: 3,
      levelLabel: '12+',
      title: '测试曲目',
      includeVideo: false,
    })).rejects.toBeInstanceOf(MaimaiChartDownloadError);
    const staging = native.createdDirs.find((uri) => uri.includes('rranker-chart-download-'));
    expect(native.deleted).toContain(staging);

    native.pickDirectoryAsync.mockRejectedValueOnce(new Error('boom'));
    await expect(downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'DX',
      levelIndex: 3,
      levelLabel: '12+',
      title: '测试曲目',
      includeVideo: false,
    })).rejects.toBeInstanceOf(MaimaiChartDownloadError);
  });
  it.each([
    ['bg.png', [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    ['bg.jpg', [0xFF, 0xD8, 0xFF, 0xE0]],
  ] as const)('names the full cover by its bytes as %s', async (name, bytes) => {
    native.resourceBytes.set('https://majdata.net/image', new Uint8Array(bytes));
    await downloadSimaiPackage({ title: 'Majdata', suffix: 'Master', resources: [{ fileName: 'bg.auto', url: 'https://majdata.net/image' }] });
    const zip = await JSZip.loadAsync(native.writes[0].content as Uint8Array);
    expect(zip.file(`Majdata Master/${name}`)).not.toBeNull();
  });

  it('rejects an unsupported cover and cleans the temporary package without saving', async () => {
    await expect(downloadSimaiPackage({ title: 'Majdata', suffix: 'Master', resources: [{ fileName: 'bg.auto', url: 'https://majdata.net/image' }] })).rejects.toBeInstanceOf(MaimaiChartDownloadError);
    expect(native.pickDirectoryAsync).not.toHaveBeenCalled();
    expect(native.deleted).toContain(native.createdDirs[0]);
  });

  it('exports a plain Majdata ZIP through the same save and cancellation path', async () => {
    const resources = [{ fileName: 'maidata.txt', url: 'https://majdata.net/chart' }, { fileName: 'track.mp3', url: 'https://majdata.net/track' }];
    expect(await downloadSimaiPackage({ title: 'Majdata', suffix: 'Master', resources })).toBe(true);
    expect(native.createFileCalls[0].name).toBe('Majdata Master.zip');
    const zip = await JSZip.loadAsync(native.writes[0].content as Uint8Array);
    expect(await zip.file('Majdata Master/maidata.txt')!.async('string')).toContain('谱面内容');
    const controller = new AbortController(); controller.abort();
    await expect(downloadSimaiPackage({ title: 'Majdata', suffix: 'Master', resources }, { signal: controller.signal })).rejects.toThrow();
    expect(native.deleted).toContain(native.createdDirs[native.createdDirs.length - 1]);
  });

  it('copies large media in at most 64 KiB chunks, tolerates short reads and closes every handle', async () => {
    const bytes = new Uint8Array(200_000).fill(7);
    native.resourceBytes.set('https://example/media', bytes);
    native.shortReads = true;
    native.shortWrites = true;
    await downloadSimaiPackage({ title: 'Large', suffix: '', resources: [{ fileName: 'track.mp3', url: 'https://example/media' }] });
    const zip = await JSZip.loadAsync(native.writes[0].content as Uint8Array, { checkCRC32: true });
    expect(await zip.file('Large/track.mp3')!.async('uint8array')).toEqual(bytes);
    expect(Math.max(...native.reads)).toBeLessThanOrEqual(65_536);
    expect(native.closed).toHaveLength(2);
  });

  it('cancels during organizing without saving and closes input/output', async () => {
    native.resourceBytes.set('https://example/media', new Uint8Array(200_000));
    const controller = new AbortController();
    await expect(downloadSimaiPackage({ title: 'Large', suffix: '', resources: [{ fileName: 'track.mp3', url: 'https://example/media' }] }, {
      signal: controller.signal,
      onProgress: event => { if (event.phase === 'organizing' && event.progress > 0) controller.abort(); },
    })).rejects.toBeInstanceOf(MaimaiChartDownloadCancelledError);
    expect(native.pickDirectoryAsync).not.toHaveBeenCalled();
    expect(native.reads).toEqual([65_536]);
    expect(native.closed).toHaveLength(2);
  });

  it('rejects truncated reads and write failure, preserving the error through cleanup', async () => {
    const request = { title: 'Chart', suffix: '', resources: [{ fileName: 'maidata.txt', url: 'https://example/chart' }] };
    native.emptyRead = true;
    await expect(downloadSimaiPackage(request)).rejects.toThrow('读取不完整');
    expect(native.closed).toHaveLength(2);
    native.emptyRead = false;
    native.writeError = new Error('disk-full');
    native.deleteError = new Error('cleanup');
    await expect(downloadSimaiPackage(request)).rejects.toThrow('disk-full');
    expect(native.closed).toHaveLength(3);
    expect(native.pickDirectoryAsync).not.toHaveBeenCalled();
  });

  it('keeps staged bytes until file saving completes and cleanup failure cannot turn success into failure', async () => {
    native.deleteError = new Error('cleanup');
    await expect(downloadSimaiPackage({ title: 'Chart', suffix: '', resources: [{ fileName: 'maidata.txt', url: 'https://example/chart' }] })).resolves.toBe(true);
    expect(native.writes[0].content).toBeInstanceOf(Uint8Array);
  });

  it('awaits the save picker before releasing the archive and its session', async () => {
    let choose!: (value: ReturnType<typeof pickedDirectoryMock>) => void;
    native.pickDirectoryAsync.mockImplementationOnce(() => new Promise(resolve => { choose = resolve; }));
    const operation = downloadSimaiPackage({ title: 'Chart', suffix: '', resources: [{ fileName: 'maidata.txt', url: 'https://example/chart' }] });
    await vi.waitFor(() => expect(native.pickDirectoryAsync).toHaveBeenCalledTimes(1));
    expect(native.deleted).toEqual([]);
    expect([...native.bytes.keys()].some(uri => uri.endsWith('/package.zip'))).toBe(true);
    choose(pickedDirectoryMock());
    await expect(operation).resolves.toBe(true);
    expect(native.writes[0].content).toBeInstanceOf(Uint8Array);
    expect(native.bytes.size).toBe(0);
  });

  it('encodes ZIP64 entry sizes, central offsets and archive counts without truncation', () => {
    const entry = { name: new TextEncoder().encode('large.bin'), size: 0x100000123, offset: 0x100000456, crc: 17 };
    const local = storedZipHeader(entry);
    const central = storedZipHeader(entry, true);
    const a = new DataView(local.buffer); const b = new DataView(central.buffer);
    expect(a.getUint16(4, true)).toBe(45);
    expect(a.getUint32(18, true)).toBe(0xffffffff);
    expect(a.getBigUint64(30 + entry.name.length + 4, true)).toBe(BigInt(entry.size));
    expect(b.getUint32(42, true)).toBe(0xffffffff);
    expect(b.getBigUint64(46 + entry.name.length + 20, true)).toBe(BigInt(entry.offset));
    const end = new DataView(storedZipEnd(65_535, 70, entry.offset).buffer);
    expect(end.getUint32(0, true)).toBe(0x06064b50);
    expect(end.getBigUint64(32, true)).toBe(65_535n);
    expect(end.getBigUint64(48, true)).toBe(BigInt(entry.offset));
    expect(end.getBigUint64(64, true)).toBe(BigInt(entry.offset + 70));
    expect(end.getUint32(76, true)).toBe(0x06054b50);
  });

  it('shares incremental CRC32 across chunks and preserves the empty checksum', () => {
    const crc = createChartPreviewCrc32();
    expect(crc.value()).toBe(0);
    crc.update(new TextEncoder().encode('1234'));
    crc.update(new TextEncoder().encode('56789'));
    expect(crc.value()).toBe(0xcbf43926);
  });

});
