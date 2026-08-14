/**
 * Phigros 谱面确认资源定位，移植自 demo/phigros-chart-preview/resource-loader.js：
 * 按 current.json → catalog/manifest → immutable asset URL 动态定位任意歌曲的
 * 谱面、OGG 音乐与曲绘，与发布台对象存储的资产约定保持一致。
 */

import { PHIGROS_OSS_BASE } from '@/domain/account-avatar';

export const PHIGROS_CHART_PREVIEW_DIFFICULTIES = Object.freeze(['EZ', 'HD', 'IN', 'AT'] as const);

export type PhigrosChartPreviewTarget = {
  songId: string;
  difficulty: string;
};

export type PhigrosChartPreviewAsset = {
  path: string;
  url: string;
  size: number;
  sha256: string;
  contentType: string;
};

export type PhigrosChartPreviewBundle = {
  target: PhigrosChartPreviewTarget;
  gameVersion: string;
  resourceVersion: string;
  publishedAt: string | null;
  song: {
    id: string;
    title: string;
    composer: string;
    illustrator: string;
    charter: string;
    difficultyConstant: number;
  };
  chart: PhigrosChartPreviewAsset;
  music: PhigrosChartPreviewAsset;
  illustration: PhigrosChartPreviewAsset;
};

type AssetRecord = { path?: unknown; size?: unknown; sha256?: unknown; contentType?: unknown };
type CatalogSong = {
  id?: unknown;
  title?: unknown;
  composer?: unknown;
  illustrator?: unknown;
  charters?: unknown;
  difficulties?: unknown;
};
type CurrentPointer = {
  gameVersion?: unknown;
  resourceVersion?: unknown;
  manifest?: unknown;
  catalog?: unknown;
  publishedAt?: unknown;
};
type CatalogDocument = { songs?: unknown };
type ManifestDocument = { assets?: unknown };

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 不是有效对象`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} 缺失`);
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function fetchPhigrosPreviewJson<T>(url: string, signal: AbortSignal, label = 'JSON'): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${label} 请求失败：HTTP ${response.status}`);
  try {
    return await response.json() as T;
  } catch (error) {
    throw new Error(`${label} 无法解析：${error instanceof Error ? error.message : String(error)}`);
  }
}

export function phigrosChartPreviewLevelLabel(levelIndex: number): string {
  const label = PHIGROS_CHART_PREVIEW_DIFFICULTIES[levelIndex];
  if (label === undefined) throw new Error(`不支持的难度下标 ${levelIndex}`);
  return label;
}

export function resolvePhigrosChartPreviewAssetBundle({
  current,
  catalog,
  manifest,
  target,
  ossBase = PHIGROS_OSS_BASE,
}: {
  current: CurrentPointer;
  catalog: CatalogDocument;
  manifest: ManifestDocument;
  target: PhigrosChartPreviewTarget;
  ossBase?: string;
}): PhigrosChartPreviewBundle {
  const currentObject = assertObject(current, 'current.json');
  const catalogObject = assertObject(catalog, 'catalog.json');
  const manifestObject = assertObject(manifest, 'manifest.json');
  const gameVersion = requiredString(currentObject.gameVersion, 'gameVersion');
  const resourceVersion = requiredString(currentObject.resourceVersion, 'resourceVersion');
  const manifestPath = requiredString(currentObject.manifest, 'manifest 路径');

  if (!Array.isArray(catalogObject.songs)) throw new Error('catalog.songs 缺失');
  const songs = (catalogObject.songs as CatalogSong[]).filter((song) => song && song.id === target.songId);
  if (songs.length !== 1) throw new Error(`目录中目标歌曲数量异常：${songs.length}`);
  const song = songs[0]!;
  const difficultyIndex = PHIGROS_CHART_PREVIEW_DIFFICULTIES.indexOf(
    target.difficulty as (typeof PHIGROS_CHART_PREVIEW_DIFFICULTIES)[number],
  );
  if (difficultyIndex < 0 || !Array.isArray(song.difficulties) || song.difficulties[difficultyIndex] == null) {
    throw new Error(`${target.songId} 不存在 ${target.difficulty} 难度`);
  }

  if (!Array.isArray(manifestObject.assets)) throw new Error('manifest.assets 缺失');
  const assets = manifestObject.assets as AssetRecord[];
  const chartPattern = new RegExp(`^charts/${escapeRegExp(target.songId)}(?:\\.\\d+)?/${escapeRegExp(target.difficulty)}\\.json$`);
  const findUnique = (predicate: (path: string) => boolean, label: string): AssetRecord => {
    const matches = assets.filter((asset) => asset && typeof asset.path === 'string' && predicate(asset.path));
    if (matches.length !== 1) throw new Error(`${label} 资产数量异常：${matches.length}`);
    return matches[0]!;
  };

  const chart = findUnique((path) => chartPattern.test(path), `${target.difficulty} 谱面`);
  const music = findUnique((path) => path === `music/${target.songId}.ogg`, '音乐');
  let illustration: AssetRecord;
  const full = assets.filter((asset) => asset?.path === `illustrations/${target.songId}.png`);
  if (full.length === 1) illustration = full[0]!;
  else illustration = findUnique((path) => path === `illustrations-lowres/${target.songId}.png`, '曲绘');

  const manifestUrl = new URL(manifestPath, ossBase);
  const releaseBase = new URL('./', manifestUrl);
  const toPublicAsset = (asset: AssetRecord): PhigrosChartPreviewAsset => ({
    path: String(asset.path),
    url: new URL(String(asset.path), releaseBase).href,
    size: Number(asset.size) || 0,
    sha256: typeof asset.sha256 === 'string' ? asset.sha256 : '',
    contentType: typeof asset.contentType === 'string' ? asset.contentType : '',
  });

  return {
    target: { ...target },
    gameVersion,
    resourceVersion,
    publishedAt: typeof currentObject.publishedAt === 'string' ? currentObject.publishedAt : null,
    song: {
      id: requiredString(song.id, '歌曲 ID'),
      title: requiredString(song.title, '歌曲名'),
      composer: requiredString(song.composer, '曲师'),
      illustrator: typeof song.illustrator === 'string' ? song.illustrator : '',
      charter: Array.isArray(song.charters) ? String(song.charters[difficultyIndex] ?? target.difficulty) : target.difficulty,
      difficultyConstant: Number(song.difficulties[difficultyIndex]),
    },
    chart: toPublicAsset(chart),
    music: toPublicAsset(music),
    illustration: toPublicAsset(illustration),
  };
}

/** 读取对象存储当前发布版本，定位目标歌曲的谱面、音乐与曲绘资源。 */
export async function loadPhigrosChartPreviewBundle(
  target: PhigrosChartPreviewTarget,
  signal: AbortSignal,
  ossBase = PHIGROS_OSS_BASE,
): Promise<PhigrosChartPreviewBundle> {
  const currentUrl = new URL('phigros/current.json', ossBase);
  const current = await fetchPhigrosPreviewJson<CurrentPointer>(currentUrl.href, signal, 'current.json');
  const currentObject = assertObject(current, 'current.json');
  const catalogPath = requiredString(currentObject.catalog, 'catalog 路径');
  const manifestPath = requiredString(currentObject.manifest, 'manifest 路径');

  const [catalog, manifest] = await Promise.all([
    fetchPhigrosPreviewJson<CatalogDocument>(new URL(catalogPath, ossBase).href, signal, 'catalog.json'),
    fetchPhigrosPreviewJson<ManifestDocument>(new URL(manifestPath, ossBase).href, signal, 'manifest.json'),
  ]);
  return resolvePhigrosChartPreviewAssetBundle({ current, catalog, manifest, target, ossBase });
}
