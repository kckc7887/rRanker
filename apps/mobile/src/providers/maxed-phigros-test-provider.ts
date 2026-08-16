import { PHIGROS_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import type { BestListSection } from '@/domain/game-data';
import type { CatalogSnapshot, DataSource, Player, ScoreRecord } from '@/domain/models';
import { PHIGROS_MAX_SCORE, roundRks } from '@/domain/phigros';
import type { CatalogDrivenScoreProvider } from '@/providers/contracts';
import { generatedSource } from '@/providers/generated-source';
import { buildMaxedScoreRecords } from '@/providers/maxed-records';


export type MaxedPhigrosSnapshot = {
  player: Player;
  records: ScoreRecord[];
  bestSections: BestListSection[];
  challengeModeRank: number;
  progress: {
    cleared: [number, number, number, number];
    fullCombo: [number, number, number, number];
    phi: [number, number, number, number];
  };
  source: DataSource;
};


export function buildMaxedPhigrosRecords(catalog: CatalogSnapshot): ScoreRecord[] {
  return buildMaxedScoreRecords(catalog, {
    achievements: 100,
    includeChart: (chart) => Number.isInteger(chart.levelIndex)
      && chart.levelIndex >= 0
      && chart.levelIndex <= 3,
    dxScore: () => PHIGROS_MAX_SCORE,
    rating: (chart) => Math.max(0, chart.difficultyConstant),
    fc: 'ap',
    fs: null,
    rate: 'phi',
    compare: (left, right) => (
      right.rating - left.rating
      || left.songId.localeCompare(right.songId, 'en')
      || left.levelIndex - right.levelIndex
    ),
  });
}

export function buildMaxedPhigrosSnapshot(
  catalog: CatalogSnapshot,
  displayName = '示例账号',
): MaxedPhigrosSnapshot {
  const records = buildMaxedPhigrosRecords(catalog);
  const best27 = records.slice(0, 27);
  const phi3 = records.slice(0, 3);
  const challengeModeScore = phi3.reduce(
    (sum, record) => sum + Math.floor(record.difficultyConstant),
    0,
  );
  const rating = roundRks((
    best27.reduce((sum, record) => sum + record.rating, 0)
    + phi3.reduce((sum, record) => sum + record.difficultyConstant, 0)
  ) / 30);
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const record of records) counts[record.levelIndex]! += 1;
  const source = generatedSource();

  return {
    player: {
      id: PHIGROS_TEST_ACCOUNT_ID,
      displayName,
      rating,
      source,
    },
    records,
    bestSections: [
      { id: 'phi3', title: 'Phi3', records: phi3 },
      { id: 'b27', title: 'Best27', records: best27 },
    ],
    challengeModeRank: 500 + challengeModeScore,
    progress: {
      cleared: [...counts],
      fullCombo: [...counts],
      phi: [...counts],
    },
    source,
  };
}

export class MaxedPhigrosTestProvider implements CatalogDrivenScoreProvider {
  constructor(private readonly displayName = '示例账号') {}

  async getPlayer(): Promise<Player> {
    return {
      id: PHIGROS_TEST_ACCOUNT_ID,
      displayName: this.displayName,
      rating: 0,
      source: generatedSource(),
    };
  }

  async getRecordsFromCatalog(catalog: CatalogSnapshot): Promise<ScoreRecord[]> {
    return buildMaxedPhigrosRecords(catalog);
  }
}
