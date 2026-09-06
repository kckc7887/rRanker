import JSZip from 'jszip';
import { chartPackageNameWithSuffix, cleanupChartDownloadSessionDirectory, createChartDownloadSessionDirectory, downloadChartResource, saveChartPackage, throwIfChartDownloadCancelled, ChartPackageDownloadError, type ChartPackageDownloadOptions } from './chart-download-shared';
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
    const zip = new JSZip();
    const folder = zip.folder(packageName);
    if (!folder) throw new ChartPackageDownloadError('无法创建谱面压缩包目录');
    for (const [fileName, file] of downloadedFiles) {
      throwIfChartDownloadCancelled(options.signal);
      const bytes = await file.bytes();
      let actualName = fileName;
      if (fileName === 'bg.auto') {
        // 上游 Content-Type 可能与图片内容不同；MajdataPlay 仅寻找 bg.png / bg.jpg。
        if ([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].every((byte, index) => bytes[index] === byte)) actualName = 'bg.png';
        else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) actualName = 'bg.jpg';
        else throw new ChartPackageDownloadError('该谱面的封面暂时无法保存，请稍后重试。');
      }
      folder.file(actualName, bytes);
    }
    // 谱面媒体已是压缩格式，STORE 免去压缩峰值内存。
    const zipBytes = await zip.generateAsync(
      { type: 'uint8array', compression: 'STORE' },
      ({ percent }) => options.onProgress?.({
        phase: 'organizing',
        progress: Math.min(1, Math.max(0, percent / 100)),
      }),
    );
    throwIfChartDownloadCancelled(options.signal);
    options.onProgress?.({ phase: 'organizing', progress: 1 });
    await options.onReadyToSave?.();
    throwIfChartDownloadCancelled(options.signal);
    return saveChartPackage(`${packageName}${extension}`, { kind: 'bytes', bytes: zipBytes });
  } finally {
    cleanupChartDownloadSessionDirectory(staging);
  }
}
