import { jest } from '@jest/globals';
import JSZip from 'jszip';
import { TextDecoder, TextEncoder } from 'node:util';
import { AbortController as NativeAbortController } from 'abort-controller';
import { prepareOsuChartPreviewWebViewSource } from '@/features/osu-chart-preview/prepare-osu-chart-preview-webview';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';

const mockFiles = new Map<string, string | Uint8Array>();
const mockDirectories = new Set<string>();
const mockWrites: string[] = [];
const mockDownloadedUrls: string[] = [];
const mockCleaned: string[] = [];
let mockArchive: Uint8Array;
const mockArchivesByUrl = new Map<string, Uint8Array>();
let mockSequence = 0;
let mockBarrier = async (_phase: string) => {};
let mockAfterWrite = (_uri: string) => {};

jest.mock('../assets/osu-chart-preview/player.bundle', () => 1);
jest.mock('../assets/osu-chart-preview/index.html', () => 2);
jest.mock('expo-file-system', () => {
  const uri = (base: string | { uri: string }, parts: string[]) =>
    `${(typeof base === 'string' ? base : base.uri).replace(/\/+$/u, '')}/${parts.join('/')}`;
  class Directory {
    readonly uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = uri(base, parts); }
    create() { mockDirectories.add(this.uri); }
    get exists() { return mockDirectories.has(this.uri); }
    delete() {
      mockCleaned.push(this.uri);
      for (const key of mockFiles.keys()) if (key.startsWith(`${this.uri}/`)) mockFiles.delete(key);
      for (const key of mockDirectories) if (key === this.uri || key.startsWith(`${this.uri}/`)) mockDirectories.delete(key);
    }
  }
  class File {
    readonly uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = uri(base, parts); }
    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockFiles.get(this.uri)?.length ?? 0; }
    create() { mockFiles.set(this.uri, new Uint8Array()); }
    write(value: string | Uint8Array) {
      mockFiles.set(this.uri, value);
      mockWrites.push(this.uri);
      mockAfterWrite(this.uri);
    }
    async bytes() {
      const bytes = mockFiles.get(this.uri);
      if (!(bytes instanceof Uint8Array)) throw new Error('missing-bytes');
      await mockBarrier('read');
      return bytes;
    }
    delete() { mockFiles.delete(this.uri); }
  }
  return { Directory, File };
});
jest.mock('@/features/chart-preview-shared/chart-preview-assets', () => ({
  createChartPreviewSessionDirectory: (name: string) => {
    const { Directory } = jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
    const directory = new Directory('file:///cache', `${name}-session-${++mockSequence}`);
    directory.create();
    return directory;
  },
  disposeChartPreviewSessionDirectory: (directory: { exists: boolean; delete(): void }) => {
    if (directory.exists) directory.delete();
  },
  stageAsset: async (_module: number, name: string, directory: never) => {
    await mockBarrier('asset');
    const { File } = jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
    const file = new File(directory, name);
    file.create(); file.write('player');
    return file;
  },
  readAssetText: async () => {
    await mockBarrier('template');
    return '<!--OSU_CHART_PREVIEW_CONFIG--><script src="./audio-data.js"></script><script src="./player.js"></script>';
  },
}));
jest.mock('@/features/chart-download-shared/chart-download-shared', () => ({
  throwIfChartDownloadCancelled: (signal?: AbortSignal) => {
    if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
  },
  downloadChartResource: async (directory: never, name: string, url: string, _signal: AbortSignal, onProgress: (value: unknown) => void) => {
    mockDownloadedUrls.push(url);
    const { File } = jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
    const file = new File(directory, name);
    file.create(); file.write(mockArchivesByUrl.get(url) ?? mockArchive);
    onProgress({ totalBytesWritten: mockArchive.length, totalBytesExpectedToWrite: mockArchive.length });
    await mockBarrier('download');
    return file;
  },
}));

const target = { gameId: 'osu-catch' as const, beatmapsetId: 10, beatmapId: 21 };
const originalDecoder = globalThis.TextDecoder;
const originalEncoder = globalThis.TextEncoder;

beforeAll(() => { Object.assign(globalThis, { TextDecoder, TextEncoder }); });
afterAll(() => { Object.assign(globalThis, { TextDecoder: originalDecoder, TextEncoder: originalEncoder }); });
beforeEach(async () => {
  mockFiles.clear(); mockDirectories.clear(); mockWrites.length = 0;
  mockDownloadedUrls.length = 0; mockCleaned.length = 0;
  mockArchivesByUrl.clear();
  mockBarrier = async () => {};
  mockAfterWrite = () => {};
  const zip = new JSZip();
  zip.file('map.osu', `osu file format v14\n[General]\nAudioFilename: song.ogg\nMode:0\n[Metadata]\nBeatmapID:21\nBeatmapSetID:10\n[Difficulty]\nCircleSize:4\n[Events]\n0,0,"bg.png",0,0\nVideo,0,"movie.mp4"\n[TimingPoints]\n0,500,4,1,0,100,1,0\n[HitObjects]\n256,192,1000,1,0,0:0:0:0:`);
  zip.file('song.ogg', Uint8Array.from([1, 2, 3]));
  zip.file('bg.png', Uint8Array.from([4, 5]));
  zip.file('movie.mp4', Uint8Array.from([6, 7, 8]));
  mockArchive = await zip.generateAsync({ type: 'uint8array' });
});

describe('osu 原生资源准备生命周期', () => {
  it('完整下载后只保留选中媒体与播放器文件，dispose释放独占目录', async () => {
    const progress = jest.fn();
    const result = await prepareOsuChartPreviewWebViewSource(target, 'dark', {}, new AbortController().signal, progress);
    expect(mockDownloadedUrls).toEqual(['https://dl.sayobot.cn/beatmaps/download/full/10']);
    expect([...mockFiles.keys()].some(path => /beatmapset-\d+\.osz$/u.test(path))).toBe(false);
    expect([...mockFiles.keys()].filter(path => path.includes('/media/'))).toHaveLength(2);
    const audio = [...mockFiles.entries()].find(([path]) => path.endsWith('audio-data.js'))?.[1];
    expect(audio).toContain('"song.ogg":"AQID"');
    expect(audio).not.toContain('movie.mp4');
    const html = mockFiles.get(result.uri);
    expect(html).toContain('"requestedMode":2');
    expect(html).toContain('"uri":"file:///cache/');
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1 }));
    result.dispose();
    expect(mockFiles.size).toBe(0);
  });

  it('原生AbortController没有throwIfAborted时仍可完成准备', async () => {
    const controller = new NativeAbortController();
    expect('throwIfAborted' in controller.signal).toBe(false);
    const result = await prepareOsuChartPreviewWebViewSource(target, 'dark', {}, controller.signal as unknown as AbortSignal);
    expect(mockFiles.get(result.uri)).toContain('"requestedMode":2');
    result.dispose();
    expect(mockFiles.size).toBe(0);
  });

  it('首源缺失所选难度时清理该候选，再用有效副本准备一次媒体', async () => {
    const invalid = new JSZip();
    invalid.file('other.osu', '[Metadata]\nBeatmapID:999\nBeatmapSetID:10');
    mockArchivesByUrl.set('https://dl.sayobot.cn/beatmaps/download/full/10', await invalid.generateAsync({ type: 'uint8array' }));
    const result = await prepareOsuChartPreviewWebViewSource(target, 'dark', {}, new AbortController().signal);
    expect(mockDownloadedUrls).toEqual(['https://dl.sayobot.cn/beatmaps/download/full/10', 'https://osu.direct/api/d/10']);
    expect(mockWrites.filter(path => path.includes('/media/'))).toHaveLength(2);
    expect([...mockFiles.keys()].some(path => /beatmapset-\d+\.osz$/u.test(path))).toBe(false);
    result.dispose();
  });

  it('目标谱面有效但视频压缩数据损坏时清理整个候选并继续下一源', async () => {
    const zip = await JSZip.loadAsync(mockArchive);
    const damaged = Buffer.from(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
    for (let offset = 0; offset < damaged.length - 30; offset++) {
      if (damaged.readUInt32LE(offset) !== 0x04034b50) continue;
      const nameLength = damaged.readUInt16LE(offset + 26), extraLength = damaged.readUInt16LE(offset + 28);
      if (damaged.subarray(offset + 30, offset + 30 + nameLength).toString() === 'movie.mp4') {
        damaged[offset + 30 + nameLength + extraLength] = 7;
      }
    }
    mockArchivesByUrl.set('https://dl.sayobot.cn/beatmaps/download/full/10', new Uint8Array(damaged));
    const result = await prepareOsuChartPreviewWebViewSource(target, 'dark', {}, new AbortController().signal);
    expect(mockDownloadedUrls).toHaveLength(2);
    // 单遍落盘：已校验的图片先写入隔离候选，视频失败后整个候选被清理，不可见半份资源。
    expect(mockWrites.filter(path => path.includes('/candidate-1/media/'))).toHaveLength(1);
    expect(mockWrites.filter(path => path.includes('/candidate-1/media/'))[0]).toMatch(/0\.png$/u);
    expect([...mockFiles.keys()].some(path => path.includes('/candidate-1/'))).toBe(false);
    expect([...mockFiles.keys()].filter(path => path.includes('/candidate-2/media/'))).toHaveLength(2);
    expect(mockCleaned.some(path => path.endsWith('/candidate-1'))).toBe(true);
    result.dispose();
    expect(mockFiles.size).toBe(0);
  });

  it('引用音频可解压但CRC错误时自动换源，不发布损坏候选的媒体', async () => {
    const zip = await JSZip.loadAsync(mockArchive);
    const damaged = Buffer.from(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
    for (let offset = 0; offset < damaged.length - 46; offset++) {
      if (damaged.readUInt32LE(offset) !== 0x02014b50) continue;
      const nameLength = damaged.readUInt16LE(offset + 28);
      if (damaged.subarray(offset + 46, offset + 46 + nameLength).toString() === 'song.ogg') {
        damaged[offset + 16] ^= 1;
      }
    }
    const withoutIntegrityCheck = await JSZip.loadAsync(damaged);
    expect(await withoutIntegrityCheck.file('song.ogg')!.async('uint8array')).toEqual(new Uint8Array([1, 2, 3]));
    mockArchivesByUrl.set('https://dl.sayobot.cn/beatmaps/download/full/10', new Uint8Array(damaged));
    const result = await prepareOsuChartPreviewWebViewSource(target, 'dark', {}, new AbortController().signal);
    expect(mockDownloadedUrls).toEqual(['https://dl.sayobot.cn/beatmaps/download/full/10', 'https://osu.direct/api/d/10']);
    expect(mockWrites.filter(path => path.includes('/candidate-1/media/'))).toHaveLength(0);
    expect([...mockFiles.keys()].some(path => path.includes('/candidate-1/'))).toBe(false);
    expect([...mockFiles.keys()].filter(path => path.includes('/candidate-2/media/'))).toHaveLength(2);
    expect(mockCleaned.some(path => path.endsWith('/candidate-1'))).toBe(true);
    result.dispose();
    expect(mockFiles.size).toBe(0);
  });

  it.each(['download', 'read', 'asset', 'template'])('在%s异步阶段取消后清理迟到文件，不发布页面', async phase => {
    const controller = new AbortController();
    mockBarrier = async current => { if (current === phase) controller.abort(); };
    await expect(prepareOsuChartPreviewWebViewSource(target, 'dark', {}, controller.signal)).rejects.toBeDefined();
    expect(mockCleaned.filter(path => /-session-\d+$/u.test(path))).toHaveLength(1);
    expect(mockFiles.size).toBe(0);
    expect(mockWrites.some(path => path.endsWith('index.html'))).toBe(false);
  });

  it('校验仍在等待时取消立即结束，迟到读取不重建媒体目录或发布资源', async () => {
    const controller = new AbortController();
    let entered!: () => void;
    const reading = new Promise<void>(resolve => { entered = resolve; });
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    mockBarrier = async phase => {
      if (phase === 'read') { entered(); await barrier; }
    };
    const pending = prepareOsuChartPreviewWebViewSource(target, 'dark', {}, controller.signal);
    await reading;
    const rejection = expect(pending).rejects.toBeDefined();
    controller.abort();
    await rejection;
    expect(mockFiles.size).toBe(0);
    expect(mockDirectories.size).toBe(0);
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockFiles.size).toBe(0);
    expect(mockDirectories.size).toBe(0);
    expect(mockDownloadedUrls).toHaveLength(1);
    expect(mockWrites.some(path => path.includes('/media/') || path.endsWith('index.html'))).toBe(false);
  });

  it.each(['download', 'read', 'asset', 'template'])('在%s阶段清理共享缓存后不重新发布旧资源', async phase => {
    mockBarrier = async current => {
      if (current !== phase) return;
      invalidateResourceWrites('shared');
      mockFiles.clear();
    };
    await expect(prepareOsuChartPreviewWebViewSource(target, 'dark', {}, new AbortController().signal))
      .rejects.toThrow('缓存请求已失效');
    expect(mockCleaned.filter(path => /-session-\d+$/u.test(path))).toHaveLength(1);
    expect(mockFiles.size).toBe(0);
    expect(mockWrites.some(path => path.endsWith('index.html'))).toBe(false);
  });

  it('媒体落盘后取消，不继续提取视频或发布脚本', async () => {
    const controller = new AbortController();
    mockAfterWrite = uri => { if (uri.includes('/media/')) controller.abort(); };
    await expect(prepareOsuChartPreviewWebViewSource(target, 'dark', {}, controller.signal)).rejects.toBeDefined();
    expect(mockWrites.filter(path => path.includes('/media/'))).toHaveLength(1);
    expect(mockWrites.some(path => path.endsWith('audio-data.js'))).toBe(false);
    expect(mockFiles.size).toBe(0);
  });

  it.each(['cancel', 'clear'])('最终完成回调发生%s时再次检查发布代次', async action => {
    const controller = new AbortController();
    await expect(prepareOsuChartPreviewWebViewSource(target, 'dark', {}, controller.signal, ({ value }) => {
      if (value !== 1) return;
      if (action === 'cancel') controller.abort();
      else { invalidateResourceWrites('shared'); mockFiles.clear(); }
    })).rejects.toBeDefined();
    expect(mockFiles.size).toBe(0);
    expect(mockCleaned.filter(path => /-session-\d+$/u.test(path))).toHaveLength(1);
  });
});
