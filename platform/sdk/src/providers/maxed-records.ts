type GeneratedRecord<Chart, Version> = Chart & {
  title: string; achievements: number; dxScore: number | null; rating: number;
  fc: string | null; fs: string | null; rate: string; version: Version;
};

export type MaxedRecordConfig<Chart, Version> = {
  achievements: number;
  includeChart?: (chart: Chart) => boolean;
  dxScore: (chart: Chart) => number | null;
  rating: (chart: Chart) => number;
  fc: string | null;
  fs: string | null;
  rate: string;
  compare?: (left: GeneratedRecord<Chart, Version>, right: GeneratedRecord<Chart, Version>) => number;
};

export function buildMaxedScoreRecords<Chart extends object, Version>(
  catalog: { songs: readonly { disabled?: boolean; title: string; version: Version; charts: readonly Chart[] }[] },
  config: MaxedRecordConfig<Chart, Version>,
): GeneratedRecord<Chart, Version>[] {
  const records = catalog.songs.flatMap(song => {
    if (song.disabled) return [];
    return song.charts.flatMap(chart => {
      if (config.includeChart?.(chart) === false) return [];
      return [{ ...chart, title: song.title, achievements: config.achievements, dxScore: config.dxScore(chart),
        rating: config.rating(chart), fc: config.fc, fs: config.fs, rate: config.rate, version: song.version }];
    });
  });
  return config.compare ? records.sort(config.compare) : records;
}
