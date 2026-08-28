import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadOsuBeatmapsetPackage,
  osuBeatmapsetPackageName,
} from '@/features/osu-beatmapset-download/osu-beatmapset-download';

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  save: vi.fn(async (_name?: unknown, _output?: unknown) => true),
}));

vi.mock('expo-file-system', () => ({
  File: class MockFile {
    exists = true;
    size = 4;
    readonly args: readonly unknown[];
    constructor(...args: unknown[]) { this.args = args; }
  },
}));
vi.mock('@/features/chart-download-shared/chart-download-shared', () => ({
  chartPackageNameWithSuffix: (title: string, suffix: string) => `${title} ${suffix}`,
  cleanupChartDownloadSessionDirectory: (directory: unknown) => mocks.cleanup(directory),
  createChartDownloadSessionDirectory: () => ({ id: 'stage' }),
  saveChartPackage: (name: string, output: unknown) => mocks.save(name, output),
  throwIfChartDownloadCancelled: (signal?: AbortSignal) => {
    if (signal?.aborted) throw signal.reason;
  },
}));

describe('osu! beatmapset 下载编排', () => {
  beforeEach(() => {
    mocks.cleanup.mockClear();
    mocks.save.mockClear();
  });

  it('生成可识别的 osz 文件名并在保存后清理临时目录', async () => {
    const provider = {
      downloadBeatmapsetArchive: vi.fn(async (_id, file, _signal, onProgress) => {
        onProgress?.(1);
        return file;
      }),
    } as unknown as import('@/providers/osu-score-provider').OsuScoreProvider;
    const ready = vi.fn();
    const result = await downloadOsuBeatmapsetPackage(provider, {
      beatmapsetId: 3720,
      title: '鳥の詩',
    }, { onReadyToSave: ready });

    expect(result).toBe(true);
    expect(osuBeatmapsetPackageName('鳥の詩', 3720)).toBe('鳥の詩 3720.osz');
    expect(ready).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledWith('鳥の詩 3720.osz', expect.objectContaining({ kind: 'file' }));
    expect(mocks.cleanup).toHaveBeenCalledWith({ id: 'stage' });
  });

  it('下载失败时仍清理临时目录', async () => {
    const provider = {
      downloadBeatmapsetArchive: vi.fn(async () => { throw new Error('failed'); }),
    } as unknown as import('@/providers/osu-score-provider').OsuScoreProvider;
    await expect(downloadOsuBeatmapsetPackage(provider, { beatmapsetId: 1, title: 'x' }))
      .rejects.toThrow('failed');
    expect(mocks.cleanup).toHaveBeenCalledWith({ id: 'stage' });
  });
});
