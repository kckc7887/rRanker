/**
 * Rizline 谱面确认资源定位：
 * 按当前发布曲库与清单 files 解析唯一谱面 JSON 和 m4a。
 */

import {
  RIZLINE_DIFFICULTIES,
  RIZLINE_RESOURCE_BASE,
  type RizlineDifficulty,
} from '@/domain/rizline';
import { ProviderError } from '@/providers/errors';
import { requestBytes } from '@/providers/http-json';
import {
  rizlineResources,
  type RizlineRelease,
  type RizlineReleaseFile,
} from '@/services/rizline-resources';
import { verifyResourceBytes } from '@/services/verified-release';

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

function requiredFile(files: ReadonlyMap<string, RizlineReleaseFile>, path: string, label: string): RizlineReleaseFile {
  const file = files.get(path);
  if (!file) throw new Error(`${label}不在发布清单中`);
  return file;
}

export function rizlineChartPreviewResourceUrl(path: string, base = RIZLINE_RESOURCE_BASE): string {
  return `${base}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function resolveRizlineChartPreviewBundle(
  release: RizlineRelease,
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
  const toAsset = (file: RizlineReleaseFile): RizlineChartPreviewAsset => ({
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

async function defaultRead(
  asset: RizlineChartPreviewAsset,
  index: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return requestBytes({
    baseUrl: '',
    path: asset.url,
    fetcher: fetch,
    signal,
    retries: 1,
    timeoutMs: 120_000,
    label: 'Rizline 谱面确认',
    diagnosticScenario: index === 0 ? 'chart' : 'music',
    error: (status) => new ProviderError('network', `Rizline 资源请求失败：${status}`, true),
  });
}

export async function loadRizlineChartPreviewResources(
  target: RizlineChartPreviewTarget,
  signal: AbortSignal,
  read: (asset: RizlineChartPreviewAsset, index: number) => Promise<Uint8Array> =
    (asset, index) => defaultRead(asset, index, signal),
): Promise<RizlineChartPreviewBundle> {
  return rizlineResources.withRelease(async (release) => {
    const bundle = resolveRizlineChartPreviewBundle(release, target);
    for (const [index, asset] of [bundle.chart, bundle.music].entries()) {
      const bytes = await read(asset, index);
      await verifyResourceBytes(
        bytes,
        asset,
        index === 0 ? 'Rizline 谱面校验失败' : 'Rizline 音频校验失败',
      );
      if (signal.aborted) throw signal.reason;
    }
    return bundle;
  }, signal);
}
