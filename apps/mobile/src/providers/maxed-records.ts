import type { CatalogSnapshot, Chart, ScoreRecord } from '@/domain/models';

export type MaxedRecordConfig = {
  achievements: number;
  includeChart?: (chart: Chart) => boolean;
  dxScore: (chart: Chart) => number | null;
  rating: (chart: Chart) => number;
  fc: string | null;
  fs: string | null;
  rate: string;
  compare?: (left: ScoreRecord, right: ScoreRecord) => number;
};

export function buildMaxedScoreRecords(
  catalog: CatalogSnapshot,
  config: MaxedRecordConfig,
): ScoreRecord[] {
  const records = catalog.songs.flatMap((song) => {
    if (song.disabled) return [];
    return song.charts.flatMap((chart): ScoreRecord[] => {
      if (config.includeChart?.(chart) === false) return [];
      return [{
        ...chart,
        title: song.title,
        achievements: config.achievements,
        dxScore: config.dxScore(chart),
        rating: config.rating(chart),
        fc: config.fc,
        fs: config.fs,
        rate: config.rate,
        version: song.version,
      }];
    });
  });
  return config.compare ? records.sort(config.compare) : records;
}
