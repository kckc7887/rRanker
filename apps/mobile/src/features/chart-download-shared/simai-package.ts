import { File } from 'expo-file-system';
import { chartPackageNameWithSuffix, cleanupChartDownloadSessionDirectory, createChartDownloadSessionDirectory, downloadChartResource, saveChartPackage, throwIfChartDownloadCancelled, type ChartPackageDownloadOptions } from './chart-download-shared';
import { writeStoredZip } from './stored-zip';
export async function downloadSimaiPackage({ title, suffix, extension = '.zip', resources }: { title: string; suffix: string; extension?: string; resources: { fileName: string; url: string }[] }, options: ChartPackageDownloadOptions = {}): Promise<boolean> {
  const packageName = chartPackageNameWithSuffix(title, suffix);
  const staging = createChartDownloadSessionDirectory();
  try {
    const downloadedFiles = new Map<string, Awaited<ReturnType<typeof downloadChartResource>>>();
    for (const [index, resource] of resources.entries()) {
      throwIfChartDownloadCancelled(options.signal);
      options.onProgress?.({ phase: 'downloading', progress: index / resources.length });
      const file = await downloadChartResource(
        staging,
        resource.fileName,
        resource.url,
        options.signal,
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          const fileProgress = totalBytesExpectedToWrite > 0
            ? Math.min(1, totalBytesWritten / totalBytesExpectedToWrite)
            : 0;
          options.onProgress?.({
            phase: 'downloading',
            progress: (index + fileProgress) / resources.length,
          });
        },
      );
      downloadedFiles.set(resource.fileName, file);
      options.onProgress?.({ phase: 'downloading', progress: (index + 1) / resources.length });
    }

    options.onProgress?.({ phase: 'organizing', progress: 0 });
    throwIfChartDownloadCancelled(options.signal);
    const archive = new File(staging, 'package.zip');
    await writeStoredZip(archive, packageName, downloadedFiles, options);
    throwIfChartDownloadCancelled(options.signal);
    options.onProgress?.({ phase: 'organizing', progress: 1 });
    await options.onReadyToSave?.();
    throwIfChartDownloadCancelled(options.signal);
    return await saveChartPackage(`${packageName}${extension}`, { kind: 'file', file: archive }, options.signal);
  } finally {
    cleanupChartDownloadSessionDirectory(staging);
  }
}
