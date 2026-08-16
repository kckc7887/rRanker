import { calculateChartRating } from '@/domain/rating';
import type { CatalogSnapshot, Player, ScoreRecord } from '@/domain/models';
import type { CatalogDrivenScoreProvider } from '@/providers/contracts';
import { generatedSource } from '@/providers/generated-source';
import { MAIMAI_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import { buildMaxedScoreRecords } from '@/providers/maxed-records';

export function buildMaxedMaimaiRecords(catalog: CatalogSnapshot): ScoreRecord[] {
  return buildMaxedScoreRecords(catalog, {
    achievements: 101,
    dxScore: (chart) => (chart.notes && typeof chart.notes.total === 'number'
      ? chart.notes.total * 3
      : null),
    rating: (chart) => calculateChartRating(chart.difficultyConstant, 101),
    fc: 'app',
    fs: 'fsdp',
    rate: 'sssp',
  });
}

export class MaxedMaimaiTestProvider implements CatalogDrivenScoreProvider {
  constructor(
    private readonly accountId = MAIMAI_TEST_ACCOUNT_ID,
    private readonly displayName = '示例账号',
  ) {}

  async getPlayer(): Promise<Player> {
    return {
      id: this.accountId,
      displayName: this.displayName,
      rating: 0,
      extension: { kind: 'maimai', courseRank: 23 },
      source: generatedSource('示例查分器（全谱面满成绩）'),
    };
  }

  async getRecordsFromCatalog(catalog: CatalogSnapshot): Promise<ScoreRecord[]> {
    return buildMaxedMaimaiRecords(catalog);
  }
}
