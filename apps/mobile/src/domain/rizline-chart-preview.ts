/**
 * Rizline 谱面确认资源定位（纯领域）：
 * 按当前发布曲库与清单 files 解析唯一谱面 JSON 和 m4a 的路径、URL 与完整性字段。
 * 资源下载、字节校验、超时、重试与取消编排在 services/rizline-chart-preview-resources。
 */

import {
  RIZLINE_DIFFICULTIES,
  RIZLINE_RESOURCE_BASE,
  type RizlineCatalog,
  type RizlineDifficulty,
} from '@/domain/rizline';

export type RizlineChartPreviewTarget = {
  songId: string;
  levelIndex: number;
  title?: string;
};

export type RizlineChartPreviewAsset = {
  path: string;
  url: string;
  size: number;
  sha256: string;
};

export type RizlineChartPreviewBundle = {
  target: RizlineChartPreviewTarget;
  gameVersion: string;
  resourceVersion: string;
  song: { id: string; title: string; artist: string | null };
  chart: RizlineChartPreviewAsset & { difficulty: RizlineDifficulty; level: string };
  music: RizlineChartPreviewAsset;
};

/** 纯解析所需的最小发布清单形状；服务层的 RizlineRelease 结构上满足它。 */
export type RizlineChartPreviewReleaseFile = { path: string; size: number; sha256: string };
export type RizlineChartPreviewRelease = {
  snapshot: RizlineCatalog;
  files: readonly RizlineChartPreviewReleaseFile[];
};

/** 资源字节读取端口形状；默认实现由服务层的资源端口提供。 */
export type RizlineChartPreviewResourceRead = (
  asset: RizlineChartPreviewAsset,
  index: number,
) => Promise<Uint8Array>;

function requiredFile(
  files: ReadonlyMap<string, RizlineChartPreviewReleaseFile>,
  path: string,
  label: string,
): RizlineChartPreviewReleaseFile {
  const file = files.get(path);
  if (!file) throw new Error(`${label}不在发布清单中`);
  return file;
}

export function rizlineChartPreviewResourceUrl(path: string, base = RIZLINE_RESOURCE_BASE): string {
  return `${base}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function resolveRizlineChartPreviewBundle(
  release: RizlineChartPreviewRelease,
  target: RizlineChartPreviewTarget,
  base = RIZLINE_RESOURCE_BASE,
): RizlineChartPreviewBundle {
  const difficulty = RIZLINE_DIFFICULTIES[target.levelIndex];
  if (!difficulty) throw new Error('缺少或无效的难度参数');
  const songs = release.snapshot.songs.filter((song) => song.id === target.songId);
  if (songs.length !== 1) throw new Error(`目录中目标歌曲数量异常：${songs.length}`);
  const song = songs[0]!;
  const charts = song.charts.filter((chart) => chart.difficulty === difficulty);
  if (charts.length !== 1) throw new Error(`${song.title} 不存在 ${difficulty} 难度`);
  const chart = charts[0]!;
  const files = new Map(release.files.map((file) => [file.path, file]));
  const toAsset = (file: RizlineChartPreviewReleaseFile): RizlineChartPreviewAsset => ({
    path: file.path,
    url: rizlineChartPreviewResourceUrl(file.path, base),
    size: file.size,
    sha256: file.sha256,
  });
  return {
    target: { ...target },
    gameVersion: release.snapshot.gameVersion,
    resourceVersion: release.snapshot.resourceVersion,
    song: { id: song.id, title: song.title, artist: song.artist },
    chart: { ...toAsset(requiredFile(files, chart.chartPath, '谱面文件')), difficulty, level: chart.level },
    music: toAsset(requiredFile(files, song.audioPath, '音频文件')),
  };
}
