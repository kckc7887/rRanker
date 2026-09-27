import type { GameNoteGroup } from '@/domain/game-content';
import type {
  TufLevel,
  TufPass,
} from '@/domain/tuf';
import type {
  BadgePresentation,
  ChartCardPresentation,
  ScoreCardPresentation,
  SongRowPresentation,
} from '../presentation';

function tufLevelLabel(level: TufLevel): string {
  return level.difficulty?.name ?? 'Unranked';
}

function tufLevelTone(level: TufLevel): string {
  const type = level.difficulty?.type?.trim().toUpperCase();
  const name = level.difficulty?.name?.trim().toUpperCase();
  if (name && /^P\d/.test(name)) return 'tuf-p';
  if (name && /^G\d/.test(name)) return 'tuf-g';
  if (name && /^U\d/.test(name)) return 'tuf-u';
  if (type === 'LEGACY' || name?.includes('LEGACY')) return 'tuf-legacy';
  if (!level.difficulty || name === 'UNRANKED') return 'tuf-unranked';
  return 'tuf-special';
}

function tufNotes(level: TufLevel): GameNoteGroup[] {
  const tileCount = level.tilecount ?? level.autoTileCount;
  return tileCount == null ? [] : [{
    key: 'tiles',
    values: [{ key: 'tiles', label: '物量', value: tileCount }],
  }];
}

function tufJudgementBadges(pass: TufPass): BadgePresentation[] {
  if (!pass.judgements) return [];
  const labels: [keyof typeof pass.judgements, string][] = [
    ['earlyDouble', 'Early×2'], ['earlySingle', 'Early'], ['ePerfect', 'E-Perfect'],
    ['perfect', 'Perfect'], ['lPerfect', 'L-Perfect'], ['lateSingle', 'Late'], ['lateDouble', 'Late×2'],
  ];
  return labels.flatMap(([key, label]) => {
    const value = pass.judgements?.[key];
    return typeof value === 'number' ? [{ key, label, value: String(value), tone: key }] : [];
  });
}

export function presentTufScore(pass: TufPass, position?: number): ScoreCardPresentation<'adofai'> {
  const specialBadges: BadgePresentation[] = [
    ...(pass.isWorldsFirst ? [{ key: 'wf', label: 'WF', tone: 'world-first' }] : []),
    ...(pass.isWorldsFirstPP ? [{ key: 'pp', label: 'PP', tone: 'personal-progress' }] : []),
    ...(pass.isDuplicate ? [{ key: 'duplicate', label: '重复', tone: 'muted' }] : []),
  ];
  return {
    key: String(pass.id), gameId: 'adofai', route: { songId: String(pass.levelId) },
    position, title: pass.level.song,
    accessibilityLabel: `查看关卡 ${pass.level.song}，Score V2 ${pass.scoreV2.toFixed(2)}`,
    primaryMetric: { key: 'score-v2', label: 'Score V2', text: pass.scoreV2.toFixed(2), tone: 'adofai-score' },
    secondaryMetrics: [
      { key: 'accuracy', label: 'XACC', text: formatTufAccuracy(pass.accuracy) },
      { key: 'speed', label: '速度', text: `${pass.speed.toFixed(2)}x` },
      { key: 'impact', label: 'Impact', text: pass.impact == null ? '—' : pass.impact.toFixed(2), tone: 'accent' },
    ],
    difficulty: { key: 'difficulty', label: tufLevelLabel(pass.level), value: pass.level.baseScore?.toFixed(2), tone: tufLevelTone(pass.level) },
    achievementRows: [specialBadges, tufJudgementBadges(pass)],
    supportingText: pass.vidUploadTime ?? undefined,
  };
}

export function formatTufAccuracy(value: number): string {
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent.toFixed(2)}%`;
}

export function presentTufLevel(level: TufLevel): SongRowPresentation<'adofai'> {
  return {
    key: String(level.id), gameId: 'adofai', route: { songId: String(level.id) },
    title: level.song, subtitle: level.artist || '艺术家未知',
    accessibilityLabel: `打开 TUF 关卡 ${level.song}`,
    chartBadges: [{
      key: String(level.id), label: tufLevelLabel(level),
      value: level.baseScore?.toFixed(2), tone: tufLevelTone(level),
    }],
  };
}

export function presentTufChart(level: TufLevel, pass?: TufPass): ChartCardPresentation<'adofai'> {
  const score = pass ? presentTufScore(pass) : undefined;
  return {
    key: String(level.id), gameId: 'adofai', route: { songId: String(level.id) },
    difficulty: { key: 'difficulty', label: tufLevelLabel(level), value: level.baseScore?.toFixed(2), tone: tufLevelTone(level) },
    primaryMetric: score?.primaryMetric ?? { key: 'score-v2', label: 'Score V2', text: '—' },
    secondaryMetrics: score?.secondaryMetrics ?? [], grade: score?.grade,
    achievementRows: score?.achievementRows ?? [],
    charter: level.levelCredits.map((credit) => `${credit.creator.name} (${credit.role})`).join('、') || '未知',
    notes: tufNotes(level),
  };
}
