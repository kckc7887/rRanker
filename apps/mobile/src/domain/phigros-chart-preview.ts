import type { PhigrosRelease, PhigrosResourceAsset } from '@/services/phigros-resources';

const PHIGROS_CHART_PREVIEW_DIFFICULTIES = ['EZ', 'HD', 'IN', 'AT'] as const;

export type PhigrosChartPreviewTarget = {
  songId: string;
  difficulty: string;
  variantIndex?: number;
};

export type PhigrosChartPreviewAsset = PhigrosResourceAsset & { url: string };

export type PhigrosChartPreviewBundle = {
  target: PhigrosChartPreviewTarget;
  song: {
    title: string;
    composer: string;
    illustrator: string;
    charter: string;
    difficultyConstant: number;
  };
  chart: PhigrosResourceAsset;
  music: PhigrosResourceAsset;
  illustration: PhigrosResourceAsset;
};

export type PhigrosChartPreviewResourceRead = (
  asset: PhigrosChartPreviewAsset,
  index: number,
) => Promise<Uint8Array | { uri: string; size: number; bytes: () => Promise<Uint8Array> }>;

function escapeRegExp(value: string): string {
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
  catalog,
  manifest,
  target,
}: Pick<PhigrosRelease, 'catalog' | 'manifest'> & {
  target: PhigrosChartPreviewTarget;
}): PhigrosChartPreviewBundle {
  const songs = catalog.songs.filter((song) => song.id === target.songId);
  if (songs.length !== 1) throw new Error(`目录中目标歌曲数量异常：${songs.length}`);
  const song = songs[0]!;
  const difficultyIndex = PHIGROS_CHART_PREVIEW_DIFFICULTIES.indexOf(
    target.difficulty as (typeof PHIGROS_CHART_PREVIEW_DIFFICULTIES)[number],
  );
  if (difficultyIndex < 0 || song.difficulties[difficultyIndex] === undefined) {
    throw new Error(`${target.songId} 不存在 ${target.difficulty} 难度`);
  }

  const assets = manifest.assets;
  const chartPattern = new RegExp(`^charts/${escapeRegExp(target.songId)}(?:\\.\\d+)?/${escapeRegExp(target.difficulty)}\\.json$`);
  const findUnique = (predicate: (path: string) => boolean, label: string): PhigrosResourceAsset => {
    const matches = assets.filter((asset) => predicate(asset.path));
    if (matches.length !== 1) throw new Error(`${label} 资产数量异常：${matches.length}`);
    return matches[0]!;
  };

  /** 默认谱面使用 .0，共用音乐；Random 有 .1–.6 变体。 */
  const defaultDirectory = [`charts/${target.songId}.0/`, `charts/${target.songId}/`]
    .find((prefix) => assets.some((asset) => asset.path.startsWith(prefix)));
  if (target.variantIndex !== undefined && (!Number.isSafeInteger(target.variantIndex) || target.variantIndex < 0)) {
    throw new Error('无效的里谱编号');
  }
  const selectedDirectory = target.variantIndex === undefined ? defaultDirectory : `charts/${target.songId}.${target.variantIndex}/`;
  const chart = findUnique((path) => selectedDirectory
    ? path === `${selectedDirectory}${target.difficulty}.json`
    : chartPattern.test(path), `${target.difficulty} 谱面`);
  const musicId = target.variantIndex ? `${target.songId}.${target.variantIndex}` : target.songId;
  /** 缺少专属音乐才使用共用音乐，损坏资源仍报错。 */
  const musicPath = assets.some((asset) => asset.path === `music/${musicId}.ogg`)
    ? `music/${musicId}.ogg`
    : `music/${target.songId}.ogg`;
  const music = findUnique((path) => path === musicPath, '音乐');
  let illustration: PhigrosResourceAsset;
  const full = assets.filter((asset) => asset.path === `illustrations/${target.songId}.png`);
  if (full.length === 1) illustration = full[0]!;
  else illustration = findUnique((path) => path === `illustrations-lowres/${target.songId}.png`, '曲绘');

  return {
    target,
    song: {
      title: song.title,
      composer: song.composer,
      illustrator: song.illustrator,
      charter: song.charters[difficultyIndex]!,
      difficultyConstant: song.difficulties[difficultyIndex]!,
    },
    chart,
    music,
    illustration,
  };
}
