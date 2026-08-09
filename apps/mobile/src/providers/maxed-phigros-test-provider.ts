import { PHIGROS_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import type { BestListSection } from '@/domain/game-data';
import type { CatalogSnapshot, DataSource, Player, ScoreRecord } from '@/domain/models';
import { PHIGROS_MAX_SCORE, roundRks } from '@/domain/phigros';
import type { CatalogDrivenScoreProvider } from '@/providers/contracts';

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

function generatedSource(): DataSource {
  return {
    kind: 'generated',
    label: '示例查分器（全曲全谱面满成绩）',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}

export function buildMaxedPhigrosRecords(catalog: CatalogSnapshot): ScoreRecord[] {
  return catalog.songs.flatMap((song) => {
    if (song.disabled) return [];
    return song.charts.flatMap((chart): ScoreRecord[] => {
      if (!Number.isInteger(chart.levelIndex) || chart.levelIndex < 0 || chart.levelIndex > 3) {
        return [];
      }
      return [{
        ...chart,
        title: song.title,
        achievements: 100,
        dxScore: PHIGROS_MAX_SCORE,
        rating: Math.max(0, chart.difficultyConstant),
        fc: 'ap',
        fs: null,
        rate: 'phi',
        version: song.version,
      }];
    });
  }).sort((left, right) => (
    right.rating - left.rating
    || left.songId.localeCompare(right.songId, 'en')
    || left.levelIndex - right.levelIndex
  ));
}

export function buildMaxedPhigrosSnapshot(
  catalog: CatalogSnapshot,
  displayName = '示例账号',
): MaxedPhigrosSnapshot {
  const records = buildMaxedPhigrosRecords(catalog);
  const best27 = records.slice(0, 27);
  const phi3 = records.slice(0, 3);
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
    challengeModeRank: 599,
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
