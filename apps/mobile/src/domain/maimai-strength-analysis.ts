import { chartVersionKey } from './catalog';
import { MAIMAI_DXTAG_AXES, type MaimaiDxTagScores } from './maimai-dxtag';
import type { CatalogSnapshot, Chart, ScoreRecord } from './models';
import { buildBestRecordMap } from './random-charts';

const TARGET_ACHIEVEMENT = 100.5;
export type MaimaiStrengthChart = Chart & { title: string };
export type MaimaiStrengthSample = { record: ScoreRecord; value: number };
export type MaimaiStrengthAxis = {
  name: typeof MAIMAI_DXTAG_AXES[number];
  value: number | null;
  samples: MaimaiStrengthSample[];
};
export type MaimaiStrengthRecommendation = {
  chart: MaimaiStrengthChart;
  record: ScoreRecord | undefined;
  axes: string[];
  gain: number;
};

const EPSILON = 1e-9;
const keyOf = (chart: Chart) => chartVersionKey(chart.songId, chart.type, chart.levelIndex);
const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function buildMaimaiStrengthPool(
  catalog: CatalogSnapshot, records: readonly ScoreRecord[],
) {
  const best = buildBestRecordMap(records.filter(record => record.type !== 'UTAGE' && !record.incomplete));
  const played = [...best.values()];
  const mastered = played.filter(record => record.achievements >= TARGET_ACHIEVEMENT);
  const constants = mastered.map(record => record.difficultyConstant)
    .filter(value => Number.isFinite(value) && value > 0).sort((a, b) => b - a).slice(0, 10);
  const baseline = constants.length ? average(constants) : null;
  const candidates = new Map<string, MaimaiStrengthChart>();
  if (baseline !== null) {
    for (const song of catalog.songs) {
      if (song.disabled) continue;
      for (const chart of song.charts) {
        if (chart.type === 'UTAGE' || !Number.isFinite(chart.difficultyConstant) || chart.difficultyConstant <= 0
          || chart.difficultyConstant < baseline - 0.5 - EPSILON
          || chart.difficultyConstant > baseline + 0.3 + EPSILON) continue;
        if ((best.get(keyOf(chart))?.achievements ?? -Infinity) >= TARGET_ACHIEVEMENT) continue;
        candidates.set(keyOf(chart), { ...chart, title: song.title });
      }
    }
  }
  return { best, played, mastered, baseline, candidates: [...candidates.values()] };
}

export function analyzeMaimaiStrength(
  catalog: CatalogSnapshot, records: readonly ScoreRecord[],
  scores: ReadonlyMap<string, MaimaiDxTagScores>,
) {
  const pool = buildMaimaiStrengthPool(catalog, records);
  const axes: MaimaiStrengthAxis[] = MAIMAI_DXTAG_AXES.map((name, index) => {
    const samples = pool.mastered.flatMap(record => {
      const value = scores.get(keyOf(record))?.[index];
      return value !== undefined && value > 0 ? [{ record, value }] : [];
    }).sort((a, b) => b.value - a.value || b.record.achievements - a.record.achievements
      || keyOf(a.record).localeCompare(keyOf(b.record))).slice(0, 10);
    return { name, samples, value: samples.length ? average(samples.map(sample => sample.value)) : null };
  });
  const sufficient = axes.every(axis => axis.samples.length >= 3);
  const values = axes.map(axis => axis.value ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const balanced = sufficient && max - min <= 0.3 + EPSILON;
  const strongest = sufficient ? axes.filter(axis => Math.abs(axis.value! - max) <= EPSILON).map(axis => axis.name) : [];
  const weakest = sufficient ? axes.filter(axis => Math.abs(axis.value! - min) <= EPSILON).map(axis => axis.name) : [];
  const conclusion = !sufficient ? '暂无足够成绩'
    : balanced ? '五维较均衡' : `相对擅长：${strongest.join('、')} · 相对薄弱：${weakest.join('、')}`;
  const cutoff = [...values].sort((a, b) => a - b)[1];
  const trainingAxes = axes.flatMap((axis, index) => balanced || axis.value! <= cutoff + EPSILON ? [index] : []);
  const recommendations: MaimaiStrengthRecommendation[] = [];
  if (sufficient && pool.baseline !== null) {
    for (const chart of pool.candidates) {
      const features = scores.get(keyOf(chart));
      if (!features) continue;
      const gains = trainingAxes.flatMap(index => {
        if (features[index] <= 0) return [];
        const projected = [...axes[index].samples.map(sample => sample.value), features[index]]
          .sort((a, b) => b - a).slice(0, 10);
        const gain = average(projected) - axes[index].value!;
        return gain > EPSILON ? [{ name: axes[index].name, gain }] : [];
      });
      if (!gains.length) continue;
      recommendations.push({ chart, record: pool.best.get(keyOf(chart)), axes: gains.map(item => item.name),
        gain: gains.reduce((sum, item) => sum + item.gain, 0) / trainingAxes.length });
    }
    const baseline = pool.baseline;
    recommendations.sort((a, b) => b.gain - a.gain
      || Math.abs(a.chart.difficultyConstant - baseline) - Math.abs(b.chart.difficultyConstant - baseline)
      || Number(!!b.record) - Number(!!a.record) || keyOf(a.chart).localeCompare(keyOf(b.chart)));
  }
  return { axes, sufficient, conclusion, baseline: pool.baseline, recommendations: recommendations.slice(0, 3) };
}
