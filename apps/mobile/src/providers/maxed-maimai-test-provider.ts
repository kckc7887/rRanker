import { calculateChartRating } from '@/domain/rating';
import type { CatalogSnapshot, Player, ScoreRecord } from '@/domain/models';
import type { CatalogDrivenScoreProvider } from '@/providers/contracts';
import { generatedSource } from '@/providers/generated-source';
import { MAIMAI_TEST_ACCOUNT_ID } from '@/domain/bound-account';

export function buildMaxedMaimaiRecords(catalog: CatalogSnapshot): ScoreRecord[] {
  return catalog.songs.flatMap((song) => {
    if (song.disabled) return [];
    return song.charts.map((chart): ScoreRecord => ({
      ...chart,
      title: song.title,
      achievements: 101,
      dxScore: chart.notes && typeof chart.notes.total === 'number' ? chart.notes.total * 3 : null,
      rating: calculateChartRating(chart.difficultyConstant, 101),
      fc: 'app',
      fs: 'fsdp',
      rate: 'sssp',
      version: song.version,
    }));
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
