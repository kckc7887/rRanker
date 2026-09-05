import {
  chartPackageNameWithSuffix,
  cleanupChartDownloadSessionDirectory,
  createChartDownloadSessionDirectory,
  downloadChartResource,
  saveChartPackage,
  throwIfChartDownloadCancelled,
  type ChartPackageDownloadOptions,
} from '@/features/chart-download-shared/chart-download-shared';
import { OSU_BEATMAPSET_DOWNLOAD_ROOT } from '@/providers/osu-config';

export function osuBeatmapsetPackageName(title: string, beatmapsetId: number): string {
  return `${chartPackageNameWithSuffix(title, String(beatmapsetId))}.osz`;
}

export function osuBeatmapsetDownloadUrl(beatmapsetId: number, includeVideo: boolean): string {
  return `${OSU_BEATMAPSET_DOWNLOAD_ROOT}/${includeVideo ? 'full' : 'novideo'}/${beatmapsetId}`;
}

export async function downloadOsuBeatmapsetPackage(
  request: { beatmapsetId: number; title: string; includeVideo: boolean },
  options: ChartPackageDownloadOptions = {},
): Promise<boolean> {
  const signal = options.signal ?? new AbortController().signal;
  const staging = createChartDownloadSessionDirectory();
  try {
    throwIfChartDownloadCancelled(signal);
    const archive = await downloadChartResource(
      staging,
      'beatmapset.osz',
      osuBeatmapsetDownloadUrl(request.beatmapsetId, request.includeVideo),
      signal,
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const progress = totalBytesExpectedToWrite > 0
          ? Math.min(1, totalBytesWritten / totalBytesExpectedToWrite)
          : 0;
        options.onProgress?.({ phase: 'downloading', progress });
      },
    );
    throwIfChartDownloadCancelled(signal);
    options.onProgress?.({ phase: 'organizing', progress: 1 });
    await options.onReadyToSave?.();
    throwIfChartDownloadCancelled(signal);
    return await saveChartPackage(
      osuBeatmapsetPackageName(request.title, request.beatmapsetId),
      { kind: 'file', file: archive },
      signal,
    );
  } finally {
    cleanupChartDownloadSessionDirectory(staging);
  }
}
