import type {
  GameChart,
  GameContentAdapter,
  GameNoteGroup,
} from '@/domain/game-content';
import {
  formatPhiraAccuracy, PHIRA_STATUS_LABELS, phiraChartStatus, phiraGrade,
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

function normalizePhiraChart(raw: PhiraRawChart): GameChart<'phira', PhiraRawChart> {
  const id = String(raw.chart.id);
  return {
    gameId: 'phira', songId: id, chartId: id, order: 0,
    libraryRef: { type: 'SD', levelIndex: 0 }, label: raw.chart.level,
    level: raw.chart.level, constant: raw.chart.difficulty,
    charter: raw.chart.charter || undefined, notes: phiraNotes(raw.notes), extension: raw,
  };
}

export const phiraContentAdapter: GameContentAdapter<
  'phira', PhiraRawChart, PhiraRawChart, PhiraQueriedBest,
  PhiraRawChart, PhiraRawChart, PhiraQueriedBest
> = {
  gameId: 'phira',
  normalizeSong: (raw) => ({
    gameId: 'phira', songId: String(raw.chart.id), title: raw.chart.name,
    artist: raw.chart.composer || undefined,
    metadata: {
      illustrator: raw.chart.illustrator ?? undefined,
      status: PHIRA_STATUS_LABELS[phiraChartStatus(raw.chart)], uploader: raw.chart.uploader,
      rating: raw.chart.rating ?? undefined, ratingCount: raw.chart.ratingCount,
      created: raw.chart.created ?? undefined, updated: raw.chart.updated ?? undefined,
    },
    charts: [normalizePhiraChart(raw)], extension: raw,
  }),
  normalizeChart: normalizePhiraChart,
  normalizeScore: (raw) => ({
    gameId: 'phira', songId: String(raw.chart.id), chartId: String(raw.chart.id), order: 0,
    libraryRef: { type: 'SD', levelIndex: 0 }, key: String(raw.record?.id ?? `unplayed:${raw.chart.id}`),
    title: raw.chart.name, rating: raw.poolRks ?? undefined, extension: raw,
  }),
};

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
    charter: raw.chart.charter || '未提供', notes: normalizePhiraChart(raw).notes,
  };
}
