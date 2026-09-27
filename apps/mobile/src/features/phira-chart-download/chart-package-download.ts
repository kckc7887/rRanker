import type { PhiraChart } from '@/domain/phira';
import {
  ChartPackageDownloadError,
  chartPackageNameWithSuffix,
  cleanupChartDownloadSessionDirectory,
  createChartDownloadSessionDirectory,
  downloadChartResource,
  saveChartPackage,
  throwIfChartDownloadCancelled,
  type ChartPackageDownloadOptions,
} from '@/features/chart-download-shared/chart-download-shared';

export function phiraCompatiblePackageName(title: string, level: string): string {
  return `${chartPackageNameWithSuffix(title, level)}.zip`;
}

export async function downloadPhiraChartPackage(
  chart: PhiraChart,
  options: ChartPackageDownloadOptions = {},
): Promise<boolean> {
  if (!chart.file) throw new ChartPackageDownloadError('该谱面未提供可下载文件');
  const staging = createChartDownloadSessionDirectory();
  try {
    const file = await downloadChartResource(
      staging,
      'chart.zip',
      chart.file,
      options.signal,
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        options.onProgress?.({
          phase: 'downloading',
          progress: totalBytesExpectedToWrite > 0
            ? Math.min(1, totalBytesWritten / totalBytesExpectedToWrite)
            : 0,
        });
      },
    );
    options.onProgress?.({ phase: 'downloading', progress: 1 });
    await options.onReadyToSave?.();
    throwIfChartDownloadCancelled(options.signal);
    return saveChartPackage(
      phiraCompatiblePackageName(chart.name, chart.level),
      { kind: 'file', file },
    );
  } finally {
    cleanupChartDownloadSessionDirectory(staging);
  }
}
