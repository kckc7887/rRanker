import { formatRizlineAccuracy, formatRizlineConstant, formatRizlineRks, rizlineDifficultyIndex, rizlineRecordStatus, sortedRizlineCharts, type RizlineChart, type RizlineRecord, type RizlineSong } from '@/domain/rizline';
import type { ChartCardPresentation, ScoreCardPresentation, SongRowPresentation } from '../presentation';

export function presentRizlineNotes(chart: RizlineChart) {
  return { key: 'notes', values: [
    { key: 'hit', label: 'HIT', value: chart.hit ?? '—' },
    { key: 'combo', label: 'COMBO', value: chart.combo ?? '—' },
    { key: 'max-score', label: 'Max Score', value: chart.maxScore ?? '—' },
  ] };
}

export function presentRizlineScore(record: RizlineRecord, title = record.title, position?: number): ScoreCardPresentation<'rizline'> {
  return { key: record.chartId, gameId: 'rizline', route: { songId: record.songId, levelIndex: record.levelIndex }, title, position,
    accessibilityLabel: `查看谱面 ${title} ${record.difficulty}`,
    primaryMetric: { key: 'accuracy', label: '达成率', text: formatRizlineAccuracy(record.achievements) },
    secondaryMetrics: [{ key: 'rks', label: 'RKS', text: formatRizlineRks(record.rks) }],
    difficulty: { key: 'difficulty', label: record.difficulty, value: record.chart?.level ?? '—', tone: record.difficulty },
    grade: presentRizlineGrade(record), achievementRows: [],
  };
}

export function presentRizlineSong(song: RizlineSong): SongRowPresentation<'rizline'> {
  return { key: song.id, gameId: 'rizline', route: { songId: song.id }, title: song.title, subtitle: song.artist ?? '—',
    accessibilityLabel: `查看歌曲 ${song.title}`, chartBadges: sortedRizlineCharts(song.charts).map((chart) => ({
      key: chart.id, label: chart.difficulty, value: formatRizlineConstant(chart.constant), tone: chart.difficulty,
    })) };
}

export function presentRizlineChart(chart: RizlineChart, record?: RizlineRecord): ChartCardPresentation<'rizline'> {
  return { key: chart.id, gameId: 'rizline', route: { songId: chart.songId, levelIndex: rizlineDifficultyIndex(chart.difficulty) },
    difficulty: { key: 'difficulty', label: chart.difficulty, value: chart.level, tone: chart.difficulty },
    primaryMetric: { key: 'accuracy', label: '达成率', text: formatRizlineAccuracy(record?.achievements) },
    secondaryMetrics: [{ key: 'score', label: 'Score', text: record?.score == null ? '—' : record.score.toLocaleString('en-US') },
      { key: 'rks', label: 'RKS', text: formatRizlineRks(record?.rks) }],
    grade: presentRizlineGrade(record),
    achievementRows: [], charter: chart.designer ?? '—', notes: [presentRizlineNotes(chart)] };
}

function presentRizlineGrade(record?: RizlineRecord) {
  const status = rizlineRecordStatus(record);
  return status === 'normal' ? undefined : { key: status, label: status.toUpperCase(), tone: status };
}
