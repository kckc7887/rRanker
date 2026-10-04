import { PHIGROS_OSS_BASE } from '@/domain/account-avatar';

export const PHIGROS_CHART_PREVIEW_DIFFICULTIES = Object.freeze(['EZ', 'HD', 'IN', 'AT'] as const);

export type PhigrosChartPreviewTarget = {
  songId: string;
  difficulty: string;
  variantIndex?: number;
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

export type PhigrosChartPreviewResourceRead = (
  asset: PhigrosChartPreviewAsset,
  index: number,
) => Promise<Uint8Array>;

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

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function phigrosChartPreviewLevelLabel(levelIndex: number): string {
  const label = PHIGROS_CHART_PREVIEW_DIFFICULTIES[levelIndex];
  if (label === undefined) throw new Error(`不支持的难度下标 ${levelIndex}`);
  return label;
}

export function resolvePhigrosChartPreviewVariants(
  assets: readonly { path: string }[],
  target: Pick<PhigrosChartPreviewTarget, 'songId' | 'difficulty'>,
): number[] {
  const pattern = new RegExp(`^charts/${escapeRegExp(target.songId)}\\.(\\d+)/${escapeRegExp(target.difficulty)}\\.json$`);
  const variants = assets.flatMap((asset) => {
    const match = pattern.exec(asset.path);
    return match ? [Number(match[1])] : [];
  });
  if (variants.some((value) => !Number.isSafeInteger(value)) || new Set(variants).size !== variants.length) {
    throw new Error('谱面编号重复或无效');
  }
  return variants.sort((a, b) => a - b);
}

export function resolvePhigrosChartPreviewAssetBundle({
  current,
  catalog,
  manifest,
  target,
}: {
  current: CurrentPointer;
  catalog: CatalogDocument;
  manifest: ManifestDocument;
  target: PhigrosChartPreviewTarget;
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

  /** 默认谱面使用 .0，共用音乐；Random 有 .1–.6 变体。 */
  const defaultDirectory = [`charts/${target.songId}.0/`, `charts/${target.songId}/`]
    .find((prefix) => assets.some((asset) => typeof asset?.path === 'string' && asset.path.startsWith(prefix)));
  if (target.variantIndex !== undefined && (!Number.isSafeInteger(target.variantIndex) || target.variantIndex < 0)) {
    throw new Error('无效的里谱编号');
  }
  const selectedDirectory = target.variantIndex === undefined ? defaultDirectory : `charts/${target.songId}.${target.variantIndex}/`;
  const chart = findUnique((path) => selectedDirectory
    ? path === `${selectedDirectory}${target.difficulty}.json`
    : chartPattern.test(path), `${target.difficulty} 谱面`);
  const musicId = target.variantIndex ? `${target.songId}.${target.variantIndex}` : target.songId;
  /** 缺少专属音乐才使用共用音乐，损坏资源仍报错。 */
  const musicPath = assets.some((asset) => asset?.path === `music/${musicId}.ogg`)
    ? `music/${musicId}.ogg`
    : `music/${target.songId}.ogg`;
  const music = findUnique((path) => path === musicPath, '音乐');
  let illustration: AssetRecord;
  const full = assets.filter((asset) => asset?.path === `illustrations/${target.songId}.png`);
  if (full.length === 1) illustration = full[0]!;
  else illustration = findUnique((path) => path === `illustrations-lowres/${target.songId}.png`, '曲绘');

  const manifestUrl = new URL(manifestPath, PHIGROS_OSS_BASE);
  const releaseBase = new URL('./', manifestUrl);
  /** 发布版本进入查询参数，避免复用同路径旧资源。 */
  const toPublicAsset = (asset: AssetRecord): PhigrosChartPreviewAsset => {
    const url = new URL(String(asset.path).split('/').map(encodeURIComponent).join('/'), releaseBase);
    url.searchParams.set('v', resourceVersion);
    return {
      path: String(asset.path),
      url: url.href,
      size: Number(asset.size) || 0,
      sha256: typeof asset.sha256 === 'string' ? asset.sha256 : '',
      contentType: typeof asset.contentType === 'string' ? asset.contentType : '',
    };
  };

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
