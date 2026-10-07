import type { ChartType, DataSource } from './models';
import { maimaiChartPreviewChartId } from './maimai-chart-preview';

export const MAIMAI_DXTAG_AXES = ['键盘', '星星', '技巧', '体力', '爆发'] as const;
export type MaimaiDxTagScores = readonly [number, number, number, number, number];
export type MaimaiDxTagChart = { difficulty: number; scores: MaimaiDxTagScores };
export type MaimaiDxTagLibrary = Readonly<Record<string, readonly MaimaiDxTagChart[]>>;
export type MaimaiDxTagSnapshot = { library: MaimaiDxTagLibrary; source: DataSource };

export function maimaiDxTagChartId(songId: string, chartType: ChartType): number | null {
  return chartType === 'UTAGE' ? null : maimaiChartPreviewChartId(songId, chartType);
}

export function maimaiDxTagScoresForDifficulty(
  charts: readonly MaimaiDxTagChart[], levelIndex: number,
): MaimaiDxTagScores | null {
  const [only, extra] = charts.filter((chart) => chart.difficulty === levelIndex);
  return only && !extra ? only.scores : null;
}
