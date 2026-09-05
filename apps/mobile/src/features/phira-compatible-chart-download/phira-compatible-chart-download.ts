import JSZip from 'jszip';
import type { PhiraChart } from '@/domain/phira';
import {
  loadPhigrosChartPreviewBundle,
  phigrosChartPreviewLevelLabel,
} from '@/domain/phigros-chart-preview';
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

export type PhigrosPhiraPackageRequest = {
  songId: string;
  levelIndex: number;
  title?: string;
};

function formatDifficulty(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : String(value);
}

export function phiraCompatiblePackageName(title: string, level: string): string {
  return `${chartPackageNameWithSuffix(title, level)}.zip`;
}

export async function downloadPhigrosChartAsPhiraPackage(
  request: PhigrosPhiraPackageRequest,
  options: ChartPackageDownloadOptions = {},
): Promise<boolean> {
  const signal = options.signal ?? new AbortController().signal;
  const level = phigrosChartPreviewLevelLabel(request.levelIndex);
  const bundle = await loadPhigrosChartPreviewBundle({
    songId: request.songId,
    difficulty: level,
  }, signal);
  const staging = createChartDownloadSessionDirectory();
  try {
    const resources = [
      { fileName: 'chart.json', url: bundle.chart.url },
      { fileName: 'music.ogg', url: bundle.music.url },
      { fileName: 'illustration.png', url: bundle.illustration.url },
    ] as const;
    const downloaded = new Map<string, Awaited<ReturnType<typeof downloadChartResource>>>();
    for (const [index, resource] of resources.entries()) {
      throwIfChartDownloadCancelled(signal);
      options.onProgress?.({ phase: 'downloading', progress: index / resources.length });
      const file = await downloadChartResource(
        staging,
        resource.fileName,
        resource.url,
        signal,
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
      downloaded.set(resource.fileName, file);
      options.onProgress?.({ phase: 'downloading', progress: (index + 1) / resources.length });
    }

    options.onProgress?.({ phase: 'organizing', progress: 0 });
    throwIfChartDownloadCancelled(signal);
    const difficulty = bundle.song.difficultyConstant;
    const info = {
      name: bundle.song.title,
      difficulty,
      level: `${level} Lv.${formatDifficulty(difficulty)}`,
      charter: bundle.song.charter,
      composer: bundle.song.composer,
      illustrator: bundle.song.illustrator,
      chart: 'chart.json',
      format: 'pgr',
      music: 'music.ogg',
      illustration: 'illustration.png',
    };
    const zip = new JSZip();
    zip.file('info.yml', JSON.stringify(info, null, 2));
    zip.file('chart.json', await downloaded.get('chart.json')!.bytes());
    zip.file('music.ogg', await downloaded.get('music.ogg')!.bytes());
    zip.file('illustration.png', await downloaded.get('illustration.png')!.bytes());
    // 音乐与图片已是压缩格式，STORE 可避免无收益的压缩峰值。
    const zipBytes = await zip.generateAsync(
      { type: 'uint8array', compression: 'STORE' },
      ({ percent }) => options.onProgress?.({
        phase: 'organizing',
        progress: Math.min(1, Math.max(0, percent / 100)),
      }),
    );
    throwIfChartDownloadCancelled(signal);
    options.onProgress?.({ phase: 'organizing', progress: 1 });
    await options.onReadyToSave?.();
    throwIfChartDownloadCancelled(signal);
    return await saveChartPackage(
      phiraCompatiblePackageName(request.title ?? bundle.song.title, level),
      { kind: 'bytes', bytes: zipBytes },
      signal,
    );
  } finally {
    cleanupChartDownloadSessionDirectory(staging);
  }
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
    return await saveChartPackage(
      phiraCompatiblePackageName(chart.name, chart.level),
      { kind: 'file', file },
      options.signal,
    );
  } finally {
    cleanupChartDownloadSessionDirectory(staging);
  }
}
