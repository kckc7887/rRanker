import { File } from 'expo-file-system';
import {
  chartPackageNameWithSuffix,
  cleanupChartDownloadSessionDirectory,
  createChartDownloadSessionDirectory,
  saveChartPackage,
  throwIfChartDownloadCancelled,
  type ChartPackageDownloadOptions,
} from '@/features/chart-download-shared/chart-download-shared';
import type { OsuScoreProvider } from '@/providers/osu-score-provider';

export function osuBeatmapsetPackageName(title: string, beatmapsetId: number): string {
  return `${chartPackageNameWithSuffix(title, String(beatmapsetId))}.osz`;
}

export async function downloadOsuBeatmapsetPackage(
  provider: OsuScoreProvider,
  request: { beatmapsetId: number; title: string },
  options: ChartPackageDownloadOptions = {},
): Promise<boolean> {
  const signal = options.signal ?? new AbortController().signal;
  const staging = createChartDownloadSessionDirectory();
  try {
    throwIfChartDownloadCancelled(signal);
    const archive = new File(staging, 'beatmapset.osz');
    await provider.downloadBeatmapsetArchive(
      request.beatmapsetId,
      archive,
      signal,
      (progress) => options.onProgress?.({ phase: 'downloading', progress }),
    );
    throwIfChartDownloadCancelled(signal);
    options.onProgress?.({ phase: 'organizing', progress: 1 });
    await options.onReadyToSave?.();
    throwIfChartDownloadCancelled(signal);
    return await saveChartPackage(
      osuBeatmapsetPackageName(request.title, request.beatmapsetId),
      { kind: 'file', file: archive },
    );
  } finally {
    cleanupChartDownloadSessionDirectory(staging);
  }
}
