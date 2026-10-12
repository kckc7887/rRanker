import type { PhiraChart, PhiraNoteCounts, PhiraPlayerSnapshot, PhiraQueriedBest } from '@/domain/phira';
import { generatedSource } from '@/providers/generated-source';

export function buildMaxedPhiraBest(chart: PhiraChart, notes?: PhiraNoteCounts | null): PhiraQueriedBest {
  return {
    chart,
    record: {
      id: chart.id,
      chart: chart.id,
      score: 1_000_000,
      accuracy: 1,
      perfect: notes ? notes.click + notes.hold + notes.flick + notes.drag : 0,
      good: 0,
      bad: 0,
      miss: 0,
      fullCombo: true,
      best: true,
      created: null,
    },
    poolRks: chart.difficulty,
    queriedAt: '',
  };
}

export function maxedPhiraPlayerSnapshot(displayName = '示例账号'): PhiraPlayerSnapshot {
  return {
    player: { id: 0, name: displayName, rks: 19 },
    stats: { numRecords: 114514, avgAccuracy: 1 },
    pool: { bestPool: [], recentPool: [], rks: 19 },
    recent: [],
    seedCharts: [],
    source: generatedSource(),
  };
}
