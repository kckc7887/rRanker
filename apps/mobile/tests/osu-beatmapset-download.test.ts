import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Directory, File } from 'expo-file-system';
import JSZip from 'jszip';
import { AbortController as NativeAbortController } from 'abort-controller';
import {
  downloadOsuBeatmapsetArchive, downloadOsuBeatmapsetPackage,
  osuBeatmapsetDownloadUrl, osuBeatmapsetPackageName,
  OSU_BEATMAPSET_PACKAGE_MAX_BYTES,
} from '@/features/osu-beatmapset-download/osu-beatmapset-download';
import { ChartPreviewBudgetExceededError } from '@/features/chart-preview-shared/chart-preview-resource-budget';
import { readOsuChartPreviewArchive } from '@/features/osu-chart-preview/chart-preview-resources';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(), download: vi.fn(), save: vi.fn(async (_name?: unknown, _output?: unknown) => true),
  files: new Map<string, Uint8Array>(),
  sizes: new Map<string, number>(),
}));
vi.mock('expo-file-system', () => {
  class Directory { constructor(readonly uri: string) {} }
  class File {
    readonly uri: string;
    constructor(directory: Directory, name: string) { this.uri = `${directory.uri}/${name}`; }
    get exists() { return mocks.files.has(this.uri); }
    get size() { return mocks.sizes.get(this.uri) ?? mocks.files.get(this.uri)?.byteLength ?? 0; }
    async bytes() { return mocks.files.get(this.uri)!; }
    delete() { mocks.files.delete(this.uri); mocks.sizes.delete(this.uri); }
  }
  return { Directory, File };
});
vi.mock('@/features/chart-download-shared/chart-download-shared', () => ({
  chartPackageNameWithSuffix: (title: string, suffix: string) => `${title} ${suffix}`,
  cleanupChartDownloadSessionDirectory: (directory: unknown) => mocks.cleanup(directory),
  createChartDownloadSessionDirectory: () => ({ uri: 'file:///stage' }),
  downloadChartResource: (...args: unknown[]) => mocks.download(...args),
  saveChartPackage: (name: string, output: unknown) => mocks.save(name, output),
  throwIfChartDownloadCancelled: (signal?: AbortSignal) => { if (signal?.aborted) throw signal.reason; },
}));

const request = { beatmapsetId: 3720, includeVideo: true };
const directory = new Directory('file:///session');
let validArchive: Uint8Array;
async function archive(id = 21, set = 3720): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('map.osu', `osu file format v14\n[Metadata]\nBeatmapID:${id}\nBeatmapSetID:${set}\n[HitObjects]\n256,192,1000,1,0,0:0:0:0:`);
  return zip.generateAsync({ type: 'uint8array' });
}
function downloaded(args: unknown[], bytes = validArchive): File {
  const file = new File(args[0] as Directory, args[1] as string);
  mocks.files.set(file.uri, bytes);
  return file;
}

beforeEach(async () => {
  vi.clearAllMocks(); mocks.files.clear(); mocks.sizes.clear();
  validArchive = await archive();
  mocks.download.mockImplementation(async (...args: unknown[]) => {
    const progress = args[4] as ((value: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void) | undefined;
    progress?.({ totalBytesWritten: 25, totalBytesExpectedToWrite: 100 });
    return downloaded(args);
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('osu! beatmapset 下载编排', () => {
  it('包含视频时共用下载入口保存有效osz，准备保存前完成校验', async () => {
    const ready = vi.fn(), progress = vi.fn();
    await expect(downloadOsuBeatmapsetPackage({ ...request, title: '鳥の詩' }, {
      onProgress: progress, onReadyToSave: ready,
    })).resolves.toBe(true);
    expect(osuBeatmapsetPackageName('鳥の詩', 3720)).toBe('鳥の詩 3720.osz');
    expect(osuBeatmapsetDownloadUrl(3720, true)).toBe('https://dl.sayobot.cn/beatmaps/download/full/3720');
    expect(mocks.download).toHaveBeenCalledWith(
      { uri: 'file:///stage' }, expect.stringMatching(/^beatmapset-\d+\.osz$/u),
      'https://dl.sayobot.cn/beatmaps/download/full/3720', expect.any(AbortSignal), expect.any(Function),
    );
    expect(progress).toHaveBeenNthCalledWith(1, { phase: 'downloading', progress: 0.25 });
    expect(progress).toHaveBeenNthCalledWith(2, { phase: 'organizing', progress: 1 });
    expect(ready).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledWith('鳥の詩 3720.osz', { kind: 'file', file: expect.any(File) });
    expect(mocks.cleanup).toHaveBeenCalledWith({ uri: 'file:///stage' });
  });

  it('下载失败顺序切换全部来源，每次使用独立文件并最终返回中性错误', async () => {
    mocks.download.mockRejectedValue(new Error('upstream unavailable'));
    await expect(downloadOsuBeatmapsetPackage({ ...request, title: 'x' }))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'no_data' });
    expect(mocks.download.mock.calls.map(args => args[2])).toEqual([
      'https://dl.sayobot.cn/beatmaps/download/full/3720', 'https://osu.direct/api/d/3720',
      'https://catboy.best/d/3720', 'https://api.nerinyan.moe/d/3720',
    ]);
    expect(new Set(mocks.download.mock.calls.map(args => args[1])).size).toBe(4);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });

  it('novideo参数在切源时保持，跳过未声明该能力的来源', async () => {
    mocks.download.mockRejectedValue(new Error('unavailable'));
    await expect(downloadOsuBeatmapsetArchive(directory, { ...request, includeVideo: false })).rejects.toBeDefined();
    expect(osuBeatmapsetDownloadUrl(3720, false)).toBe('https://dl.sayobot.cn/beatmaps/download/novideo/3720');
    expect(mocks.download.mock.calls.map(args => args[2])).toEqual([
      'https://dl.sayobot.cn/beatmaps/download/novideo/3720', 'https://osu.direct/api/d/3720?noVideo=1',
      'https://api.nerinyan.moe/d/3720?nv=1',
    ]);
  });

  it('HTTP200非ZIP和没有谱面的ZIP均清理后切源', async () => {
    const empty = await new JSZip().file('readme.txt', 'not a map').generateAsync({ type: 'uint8array' });
    mocks.download.mockImplementationOnce(async (...args) => downloaded(args, new TextEncoder().encode('<html>error</html>')))
      .mockImplementationOnce(async (...args) => downloaded(args, empty));
    const file = await downloadOsuBeatmapsetArchive(directory, request);
    expect(mocks.download).toHaveBeenCalledTimes(3);
    expect([...mocks.files.keys()]).toEqual([file.uri]);
  });

  it('正式谱包的媒体CRC损坏时拒绝原包并切源', async () => {
    const zip = await JSZip.loadAsync(validArchive);
    zip.file('music.wav', new Uint8Array([1, 2, 3]));
    const damaged = Buffer.from(await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }));
    for (let offset = 0; offset < damaged.length - 30; offset++) {
      if (damaged.readUInt32LE(offset) !== 0x04034b50) continue;
      const nameLength = damaged.readUInt16LE(offset + 26), extraLength = damaged.readUInt16LE(offset + 28);
      if (damaged.subarray(offset + 30, offset + 30 + nameLength).toString() === 'music.wav') {
        damaged[offset + 30 + nameLength + extraLength] = 9;
      }
    }
    mocks.download.mockImplementationOnce(async (...args) => downloaded(args, new Uint8Array(damaged)));
    const file = await downloadOsuBeatmapsetArchive(directory, request);
    expect(mocks.download).toHaveBeenCalledTimes(2);
    expect([...mocks.files.keys()]).toEqual([file.uri]);
  });

  it('预览校验所选难度与歌曲身份，错误副本切源且校验不落媒体', async () => {
    const wrongDifficulty = await archive(22), wrongSet = await archive(21, 2);
    mocks.download.mockImplementationOnce(async (...args) => downloaded(args, wrongDifficulty))
      .mockImplementationOnce(async (...args) => downloaded(args, wrongSet));
    let selectedPath: string | undefined;
    const file = await downloadOsuBeatmapsetArchive(directory, request, {
      validate: async (candidate, signal) => {
        const selected = await readOsuChartPreviewArchive(await candidate.bytes(), {
          gameId: 'osu-catch', beatmapsetId: 3720, beatmapId: 21,
        }, { assertCurrent: () => { if (signal.aborted) throw signal.reason; }, stageMedia: async () => '' });
        selectedPath = selected.chartPath;
      },
    });
    expect(selectedPath).toBe('map.osu');
    expect(mocks.download).toHaveBeenCalledTimes(3);
    expect([...mocks.files.keys()]).toEqual([file.uri]);
  });

  it('首源15秒没有字节增长即切换，原任务迟到不会覆盖新源', async () => {
    vi.useFakeTimers();
    let complete!: (file: File) => void;
    let originalArgs!: unknown[];
    mocks.download.mockImplementationOnce((...args) => {
      originalArgs = args;
      return new Promise<File>(resolve => { complete = resolve; });
    });
    const pending = downloadOsuBeatmapsetArchive(directory, request);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.runAllTimersAsync();
    const file = await pending;
    expect((originalArgs[3] as AbortSignal).aborted).toBe(true);
    expect(mocks.download).toHaveBeenCalledTimes(2);
    complete(downloaded(originalArgs));
    await vi.advanceTimersByTimeAsync(0);
    expect([...mocks.files.keys()]).toEqual([file.uri]);
  });

  it('只有新增字节延长等待，重复进度不会让失败源永久占用', async () => {
    vi.useFakeTimers();
    let report!: (value: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void;
    mocks.download.mockImplementationOnce((...args) => {
      report = args[4]; return new Promise(() => {});
    });
    const pending = downloadOsuBeatmapsetArchive(directory, request);
    await vi.advanceTimersByTimeAsync(10_000);
    report({ totalBytesWritten: 10, totalBytesExpectedToWrite: 100 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.download).toHaveBeenCalledOnce();
    report({ totalBytesWritten: 10, totalBytesExpectedToWrite: 100 });
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.runAllTimersAsync();
    await pending;
    expect(mocks.download).toHaveBeenCalledTimes(2);
  });

  it('原生AbortController没有reason和throwIfAborted仍能取消空闲源', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('AbortController', NativeAbortController);
    mocks.download.mockImplementationOnce(() => new Promise(() => {}));
    const pending = downloadOsuBeatmapsetArchive(directory, request);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBeInstanceOf(File);
    expect(mocks.download).toHaveBeenCalledTimes(2);
    expect(mocks.download.mock.calls[0][3].aborted).toBe(true);
  });

  it('共享代次失效立即中止静默下载，不等进度或空闲超时也不切源', async () => {
    mocks.download.mockImplementationOnce(() => new Promise(() => {}));
    const pending = downloadOsuBeatmapsetArchive(directory, request);
    const rejection = expect(pending).rejects.toThrow('缓存请求已失效');
    invalidateResourceWrites('shared');
    await rejection;
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.download.mock.calls[0][3].aborted).toBe(true);
  });

  it('用户取消中止整条链，包括尚未返回的校验，不开启下一源', async () => {
    const controller = new AbortController();
    let entered!: () => void;
    const validating = new Promise<void>(resolve => { entered = resolve; });
    const pending = downloadOsuBeatmapsetArchive(directory, request, {
      signal: controller.signal, validate: async () => { entered(); await new Promise(() => {}); },
    });
    await validating;
    const rejection = expect(pending).rejects.toBeDefined();
    controller.abort(); await rejection;
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.files.size).toBe(0);
  });

  it('共享资源代次变化后不尝试其它源，已取消请求不启动下载', async () => {
    mocks.download.mockImplementationOnce(async (...args) => {
      invalidateResourceWrites('shared'); return downloaded(args);
    });
    await expect(downloadOsuBeatmapsetArchive(directory, request)).rejects.toThrow('缓存请求已失效');
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.files.size).toBe(0);
    const controller = new AbortController(); controller.abort();
    await expect(downloadOsuBeatmapsetArchive(directory, request, { signal: controller.signal })).rejects.toBeDefined();
    expect(mocks.download).toHaveBeenCalledOnce();
  });

  it('传输字节超过上限即中止且不再切源，未知总长度同样受限', async () => {
    mocks.download.mockImplementation(async (...args: unknown[]) => {
      const progress = args[4] as (value: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void;
      progress({ totalBytesWritten: 101, totalBytesExpectedToWrite: 0 });
      return downloaded(args);
    });
    await expect(downloadOsuBeatmapsetArchive(directory, request, { maxArchiveBytes: 100 }))
      .rejects.toBeInstanceOf(ChartPreviewBudgetExceededError);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.files.size).toBe(0);
  });

  it('落盘文件超过上限在读内存前拒绝且不再切源', async () => {
    const bytesSpy = vi.fn();
    mocks.download.mockImplementation(async (...args: unknown[]) => {
      const file = downloaded(args);
      const originalBytes = file.bytes.bind(file);
      file.bytes = async () => { bytesSpy(); return originalBytes(); };
      return file;
    });
    await expect(downloadOsuBeatmapsetArchive(directory, request, { maxArchiveBytes: 50 }))
      .rejects.toThrow('谱面下载超出预算');
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(bytesSpy).not.toHaveBeenCalled();
    expect(mocks.files.size).toBe(0);
  });

  it('校验阶段的预算超限不再切源', async () => {
    await expect(downloadOsuBeatmapsetArchive(directory, request, {
      validate: async () => { throw new ChartPreviewBudgetExceededError('谱面解压总量超出预算'); },
    })).rejects.toThrow('谱面解压总量超出预算');
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.files.size).toBe(0);
  });

  it('正式谱包使用独立预算与文案', async () => {
    mocks.download.mockImplementation(async (...args: unknown[]) => {
      const file = downloaded(args);
      mocks.sizes.set(file.uri, OSU_BEATMAPSET_PACKAGE_MAX_BYTES + 1);
      return file;
    });
    await expect(downloadOsuBeatmapsetPackage({ ...request, title: 'x' }))
      .rejects.toThrow('谱包过大，暂不支持下载');
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
