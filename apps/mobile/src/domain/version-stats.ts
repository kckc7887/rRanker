import { chartVersionKey } from './catalog';
import type { Best50Snapshot, CatalogSnapshot, ScoreRecord } from './models';

export interface VersionStats { versionId: number; chartCount: number; playedCount: number; averageAchievement: number | null; sssPlus: number; fc: number; ap: number; b50Contribution: number }
export function calculateVersionStats(versionId: number, catalog: CatalogSnapshot, records: readonly ScoreRecord[], best50?: Best50Snapshot): VersionStats {
  const keys = new Set(Object.entries(catalog.chartVersionIndex).filter(([, version]) => version === versionId).map(([key]) => key));
  const bestByChart = new Map<string, ScoreRecord>();
  records.forEach((record) => {
    const key = chartVersionKey(record.songId, record.type, record.levelIndex);
    if (!keys.has(key)) return;
    const current = bestByChart.get(key);
    if (!current || record.achievements > current.achievements) bestByChart.set(key, record);
  });
  const played = [...bestByChart.values()];
  const b50 = new Set([...(best50?.b35 ?? []), ...(best50?.b15 ?? [])].map((record) => chartVersionKey(record.songId, record.type, record.levelIndex)));
  return {
    versionId, chartCount: keys.size, playedCount: played.length,
    averageAchievement: played.length ? played.reduce((sum, item) => sum + item.achievements, 0) / played.length : null,
    sssPlus: played.filter((item) => item.rate.toLowerCase() === 'sssp' || item.achievements >= 100.5).length,
    fc: played.filter((item) => !!item.fc).length,
    ap: played.filter((item) => ['ap', 'app'].includes(item.fc?.toLowerCase() ?? '')).length,
    b50Contribution: [...keys].filter((key) => b50.has(key)).length,
  };
}
