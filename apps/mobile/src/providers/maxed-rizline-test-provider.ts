import {
  buildRizlineRecords, selectRizlineBest, rizlineAccuracyRks,
  type RizlineCatalog, type RizlineSave, type RizlineSnapshot,
} from '@/domain/rizline';
import { generatedSource } from './generated-source';

export function buildMaxedRizlineSnapshot(catalog: RizlineCatalog, displayName: string): RizlineSnapshot {
  const charts = catalog.songs.flatMap(song => song.charts);
  const save: RizlineSave = {
    userId: 'rizline:test', username: displayName, totalRks: 0,
    myBest: charts.map(chart => ({
      trackAssetId: chart.songId, difficultyClassName: chart.difficulty,
      score: chart.maxScore ?? 1_000_000, completeRate: 120, isFullCombo: true, isClear: true,
    })),
    levelsRks: charts.flatMap(chart => chart.difficulty === 'SP' || chart.constant === null ? [] : [{
      trackId: chart.songId, difficultyClassName: chart.difficulty, rks: 11 * chart.constant + rizlineAccuracyRks(120),
    }]),
  };
  const best = selectRizlineBest(buildRizlineRecords(save, catalog));
  save.totalRks = [...best.ah5, ...best.b35].reduce((sum, record) => sum + (record.rks ?? 0), 0) / 40;
  return { save, source: generatedSource('示例查分器') };
}
