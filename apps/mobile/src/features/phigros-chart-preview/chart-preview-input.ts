import { phigrosLevelColors, phigrosLevelLabel } from '@/domain/phigros-level-theme';
import { bytesToBase64 } from '@/utils/crypto-subset';
import { phigrosChartPreviewLevelLabel, type PhigrosChartPreviewAsset } from '@/domain/phigros-chart-preview';
import { loadPhigrosChartPreviewResources } from '@/services/phigros-chart-preview-resources';
import type { PgrPreviewSettings, PreparedPgrPreviewInput } from '@/features/chart-preview-shared/pgr-preview-config';

export type PhigrosChartPreviewInput = {
  songId: string;
  levelIndex: number;
  title?: string;
  variantIndex?: number;
};

export async function buildPhigrosChartPreviewInput(
  input: PhigrosChartPreviewInput,
  settings: PgrPreviewSettings,
  signal: AbortSignal,
  read: (asset: PhigrosChartPreviewAsset, index: number) => Promise<Uint8Array>,
): Promise<PreparedPgrPreviewInput> {
  const resources = await loadPhigrosChartPreviewResources({
    songId: input.songId,
    difficulty: phigrosChartPreviewLevelLabel(input.levelIndex),
    ...(input.variantIndex === undefined ? {} : { variantIndex: input.variantIndex }),
  }, signal, read);
  const { bundle } = resources;
  return {
    musicDataBase64: bytesToBase64(resources.music),
    config: {
      game: 'phigros',
      sourceLabel: 'Phigros 谱面',
      title: input.title ?? bundle.song.title,
      previewDifficulty: {
        label: phigrosLevelLabel(input.levelIndex),
        value: Number.isFinite(bundle.song.difficultyConstant) ? bundle.song.difficultyConstant.toFixed(1) : '—',
        background: phigrosLevelColors(input.levelIndex).bg,
        text: phigrosLevelColors(input.levelIndex).fg,
        identity: input.variantIndex ? `里谱 ${input.variantIndex}` : undefined,
      },
      chartText: new TextDecoder('utf-8', { fatal: true }).decode(resources.chart),
      illustrationUrl: `data:${bundle.illustration.contentType};base64,${bytesToBase64(resources.illustration)}`,
      settings,
    },
  };
}
