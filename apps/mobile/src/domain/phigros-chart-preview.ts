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
  paths: Iterable<string>,
  target: Pick<PhigrosChartPreviewTarget, 'songId' | 'difficulty'>,
): number[] {
  const pattern = new RegExp(`^charts/${escapeRegExp(target.songId)}\\.(\\d+)/${escapeRegExp(target.difficulty)}\\.json$`);
  const variants: number[] = [];
  for (const path of paths) {
    const match = pattern.exec(path);
    if (match) variants.push(Number(match[1]));
  }
  if (variants.some((value) => !Number.isSafeInteger(value)) || new Set(variants).size !== variants.length) {
    throw new Error('谱面编号重复或无效');
  }
  return variants.sort((a, b) => a - b);
}

export function resolvePhigrosChartPreviewAssetBundle({
  catalog,
  assetsByPath,
  target,
}: Pick<PhigrosRelease, 'catalog' | 'assetsByPath'> & {
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

  if (target.variantIndex !== undefined && (!Number.isSafeInteger(target.variantIndex) || target.variantIndex < 0)) {
    throw new Error('无效的里谱编号');
  }
  /** 默认目录中任意资源都确定目录归属，不借用其他变体补缺失难度。 */
  const defaultDirectory = `charts/${target.songId}.0/`;
  const plainDirectory = `charts/${target.songId}/`;
  let chart = assetsByPath.get(`charts/${target.songId}.${target.variantIndex ?? 0}/${target.difficulty}.json`);
  if (!chart && target.variantIndex === undefined) {
    const chartPattern = new RegExp(`^charts/${escapeRegExp(target.songId)}(?:\\.\\d+)?/${escapeRegExp(target.difficulty)}\\.json$`);
    let selectedDirectory: string | undefined;
    const matches: PhigrosResourceAsset[] = [];
    for (const [path, asset] of assetsByPath) {
      if (path.startsWith(defaultDirectory)) { selectedDirectory = defaultDirectory; break; }
      if (path.startsWith(plainDirectory)) selectedDirectory = plainDirectory;
      if (chartPattern.test(path)) matches.push(asset);
    }
    if (selectedDirectory) chart = assetsByPath.get(`${selectedDirectory}${target.difficulty}.json`);
    else {
      if (matches.length !== 1) throw new Error(`${target.difficulty} 谱面 资产数量异常：${matches.length}`);
      chart = matches[0]!;
    }
  }
  if (!chart) throw new Error(`${target.difficulty} 谱面 资产数量异常：0`);
  const musicId = target.variantIndex ? `${target.songId}.${target.variantIndex}` : target.songId;
  /** 缺少专属音乐才使用共用音乐，损坏资源仍报错。 */
  const music = assetsByPath.get(`music/${musicId}.ogg`)
    ?? assetsByPath.get(`music/${target.songId}.ogg`);
  if (!music) throw new Error('音乐 资产数量异常：0');
  const illustration = assetsByPath.get(`illustrations/${target.songId}.png`)
    ?? assetsByPath.get(`illustrations-lowres/${target.songId}.png`);
  if (!illustration) throw new Error('曲绘 资产数量异常：0');

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
