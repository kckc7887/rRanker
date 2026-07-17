import { calculateChartRating } from '@/domain/rating';
import type { CatalogSnapshot, DataSource, Player, ScoreRecord } from '@/domain/models';
import type { CatalogDrivenScoreProvider } from '@/providers/contracts';
import { MAIMAI_TEST_ACCOUNT_ID } from '@/domain/bound-account';

function generatedSource(): DataSource {
  return {
    kind: 'generated',
    label: '测试查分器（全谱面满成绩）',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}

export function buildMaxedMaimaiRecords(catalog: CatalogSnapshot): ScoreRecord[] {
  return catalog.songs.flatMap((song) => {
    if (song.disabled) return [];
    return song.charts.map((chart): ScoreRecord => ({
      ...chart,
      title: song.title,
      achievements: 101,
      dxScore: chart.notes ? chart.notes.total * 3 : null,
      rating: calculateChartRating(chart.difficultyConstant, 101),
      fc: 'app',
      fs: 'fsdp',
      rate: 'sssp',
      version: song.version,
    }));
  });
}

export class MaxedMaimaiTestProvider implements CatalogDrivenScoreProvider {
  async getPlayer(): Promise<Player> {
    return {
      id: MAIMAI_TEST_ACCOUNT_ID,
      displayName: '测试玩家',
      rating: 0,
      additionalRating: 0,
      source: generatedSource(),
    };
  }

  async getRecordsFromCatalog(catalog: CatalogSnapshot): Promise<ScoreRecord[]> {
    return buildMaxedMaimaiRecords(catalog);
  }
}
