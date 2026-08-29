import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadOsuBeatmapsetPackage,
  osuBeatmapsetDownloadUrl,
  osuBeatmapsetPackageName,
} from '@/features/osu-beatmapset-download/osu-beatmapset-download';

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  download: vi.fn(),
  save: vi.fn(async (_name?: unknown, _output?: unknown) => true),
}));

vi.mock('@/features/chart-download-shared/chart-download-shared', () => ({
  chartPackageNameWithSuffix: (title: string, suffix: string) => `${title} ${suffix}`,
  cleanupChartDownloadSessionDirectory: (directory: unknown) => mocks.cleanup(directory),
  createChartDownloadSessionDirectory: () => ({ id: 'stage' }),
  downloadChartResource: (...args: unknown[]) => mocks.download(...args),
  saveChartPackage: (name: string, output: unknown) => mocks.save(name, output),
  throwIfChartDownloadCancelled: (signal?: AbortSignal) => {
    if (signal?.aborted) throw signal.reason;
  },
}));

describe('osu! beatmapset 下载编排', () => {
  beforeEach(() => {
    mocks.cleanup.mockClear();
    mocks.download.mockReset();
    mocks.save.mockClear();
    mocks.download.mockImplementation(async (...args: unknown[]) => {
      const onProgress = args[4] as ((progress: {
        totalBytesWritten: number;
        totalBytesExpectedToWrite: number;
      }) => void) | undefined;
      onProgress?.({ totalBytesWritten: 25, totalBytesExpectedToWrite: 100 });
      return { id: 'archive' };
    });
  });

  it('包含视频时通过公共下载链保存 osz，并报告进度后清理临时目录', async () => {
    const ready = vi.fn();
    const progress = vi.fn();
    const result = await downloadOsuBeatmapsetPackage({
      beatmapsetId: 3720,
      title: '鳥の詩',
      includeVideo: true,
    }, { onProgress: progress, onReadyToSave: ready });

    expect(result).toBe(true);
    expect(osuBeatmapsetPackageName('鳥の詩', 3720)).toBe('鳥の詩 3720.osz');
    expect(osuBeatmapsetDownloadUrl(3720, true))
      .toBe('https://dl.sayobot.cn/beatmaps/download/full/3720');
    expect(mocks.download).toHaveBeenCalledWith(
      { id: 'stage' },
      'beatmapset.osz',
      'https://dl.sayobot.cn/beatmaps/download/full/3720',
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(progress).toHaveBeenNthCalledWith(1, { phase: 'downloading', progress: 0.25 });
    expect(progress).toHaveBeenNthCalledWith(2, { phase: 'organizing', progress: 1 });
    expect(ready).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledWith(
      '鳥の詩 3720.osz',
      { kind: 'file', file: { id: 'archive' } },
    );
    expect(mocks.cleanup).toHaveBeenCalledWith({ id: 'stage' });
  });

  it('仅游玩内容使用 novideo 地址', async () => {
    await downloadOsuBeatmapsetPackage({ beatmapsetId: 3720, title: '鳥の詩', includeVideo: false });

    expect(osuBeatmapsetDownloadUrl(3720, false))
      .toBe('https://dl.sayobot.cn/beatmaps/download/novideo/3720');
    expect(mocks.download.mock.calls[0]?.[2])
      .toBe('https://dl.sayobot.cn/beatmaps/download/novideo/3720');
  });

  it('下载失败或取消时仍清理临时目录', async () => {
    mocks.download.mockRejectedValueOnce(new Error('failed'));
    await expect(downloadOsuBeatmapsetPackage({ beatmapsetId: 1, title: 'x', includeVideo: false }))
      .rejects.toThrow('failed');
    expect(mocks.cleanup).toHaveBeenCalledWith({ id: 'stage' });

    mocks.cleanup.mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(downloadOsuBeatmapsetPackage(
      { beatmapsetId: 2, title: 'y', includeVideo: true },
      { signal: controller.signal },
    )).rejects.toBeDefined();
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.cleanup).toHaveBeenCalledWith({ id: 'stage' });
  });
});
