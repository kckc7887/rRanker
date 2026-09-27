import type { GameNoteGroup } from '@/domain/game-content';
import {
  formatPhiraAccuracy, phiraGrade,
  type PhiraChart, type PhiraNoteCounts, type PhiraQueriedBest,
} from '@/domain/phira';
import { phiraRecordXing } from '@/domain/phira-filters';
import { phigrosXingLabel } from '@/domain/phigros-xing';
import type {
  BestSectionPresentation,
  ChartCardPresentation,
  ScoreCardPresentation,
  SongRowPresentation,
} from '../presentation';

export type PhiraRawChart = { chart: PhiraChart; notes?: PhiraNoteCounts | null };

function phiraNotes(notes: PhiraNoteCounts | null | undefined): GameNoteGroup[] {
  if (!notes) return [];
  return [{ key: 'notes', values: [
    { key: 'click', label: 'Click', value: notes.click },
    { key: 'hold', label: 'Hold', value: notes.hold },
    { key: 'flick', label: 'Flick', value: notes.flick },
    { key: 'drag', label: 'Drag', value: notes.drag },
    { key: 'total', label: '总计', value: notes.click + notes.hold + notes.flick + notes.drag },
  ] }];
}

export function presentPhiraScore(raw: PhiraQueriedBest, position?: number): ScoreCardPresentation<'phira'> {
  const record = raw.record;
  const grade = record ? phiraGrade(record) : '—';
  const xing = phiraRecordXing(raw);
  return {
    key: String(record?.id ?? `unplayed:${raw.chart.id}`), gameId: 'phira',
    route: { songId: String(raw.chart.id) }, position, title: raw.chart.name,
    accessibilityLabel: `查看谱面 ${raw.chart.name}`,
    primaryMetric: { key: 'score', label: 'Score', text: record ? record.score.toLocaleString('en-US') : '—', tone: grade },
    secondaryMetrics: [
      { key: 'accuracy', label: 'ACC', text: record ? formatPhiraAccuracy(record.accuracy) : '—' },
      { key: 'rks', label: 'RKS', text: raw.poolRks == null ? '—' : raw.poolRks.toFixed(4), tone: raw.poolRks == null ? 'muted' : 'accent' },
    ],
    difficulty: { key: 'difficulty', label: raw.chart.level, value: raw.chart.difficulty.toFixed(1), tone: '4' },
    grade: record ? { key: 'grade', label: grade, tone: grade.toLowerCase() } : undefined,
    achievementRows: record ? [
      ...(xing ? [[{
        key: 'xing',
        label: phigrosXingLabel(xing),
        tone: `xing-${xing}`,
      }]] : []),
      [
        { key: 'perfect', label: 'Perfect', value: String(record.perfect), tone: 'perfect' },
        { key: 'good', label: 'Good', value: String(record.good), tone: 'good' },
        { key: 'bad', label: 'Bad', value: String(record.bad), tone: 'bad' },
        { key: 'miss', label: 'Miss', value: String(record.miss), tone: 'miss' },
      ],
    ] : [],
  };
}

export function presentPhiraBestSection(items: readonly PhiraQueriedBest[]): BestSectionPresentation<'phira'> {
  return { id: 'best20', title: 'Best20', items: items.slice(0, 20).map((item, index) => presentPhiraScore(item, index + 1)) };
}

export function presentPhiraSong(chart: PhiraChart): SongRowPresentation<'phira'> {
  return {
    key: String(chart.id), gameId: 'phira', route: { songId: String(chart.id) },
    title: chart.name, subtitle: chart.composer || '曲师未知', accessibilityLabel: `查看歌曲 ${chart.name}`,
    chartBadges: [{ key: String(chart.id), label: chart.level, value: chart.difficulty.toFixed(1), tone: '4' }],
  };
}

export function presentPhiraChart(raw: PhiraRawChart, score?: PhiraQueriedBest): ChartCardPresentation<'phira'> {
  const presented = score ? presentPhiraScore(score) : undefined;
  return {
    key: String(raw.chart.id), gameId: 'phira', route: { songId: String(raw.chart.id) },
    difficulty: { key: 'difficulty', label: raw.chart.level, value: raw.chart.difficulty.toFixed(1), tone: '4' },
    primaryMetric: presented?.primaryMetric ?? { key: 'score', label: 'Score', text: '—' },
    secondaryMetrics: presented?.secondaryMetrics ?? [
      { key: 'accuracy', label: 'ACC', text: '—' }, { key: 'rks', label: 'RKS', text: '—', tone: 'muted' },
    ],
    grade: presented?.grade, achievementRows: presented?.achievementRows ?? [],
    charter: raw.chart.charter || '未提供', notes: phiraNotes(raw.notes),
  };
}
