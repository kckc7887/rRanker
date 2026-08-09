import type {
  GameChart,
  GameContentAdapter,
  GameNoteGroup,
  GameScore,
  GameSong,
} from '@/domain/game-content';
import type { ChunithmDifficulty, ChunithmSong } from '@/domain/chunithm';
import { CHUNITHM_DIFFICULTY_LABELS } from '@/domain/chunithm';
import {
  chunithmAchievementBadges,
  chunithmRankFromScore,
  chunithmRankUsesGradient,
  formatChunithmScore,
  formatChunithmWorldsEndLabel,
  type ChunithmScoreCardData,
} from '@/domain/chunithm-score-presentation';
import type { Chart, PhigrosChartNotes, ScoreRecord, Song } from '@/domain/models';
import { formatAchievement, scoreRateEffect, scoreRateLabel } from '@/domain/score-presentation';
import {
  formatPhigrosSongRks,
  PHIGROS_MAX_SCORE,
  phigrosScoreToRate,
} from '@/domain/phigros';
import { phigrosLevelLabel } from '@/domain/phigros-level-theme';
import { PHIGROS_RATE_LABELS, type PhigrosRateKind } from '@/domain/phigros-rate-theme';
import type {
  BadgePresentation,
  ChartCardPresentation,
  ScoreCardPresentation,
  SongRowPresentation,
} from './presentation';
import type {
  TufChartExtension,
  TufLevel,
  TufPass,
  TufScoreExtension,
  TufSongExtension,
} from '@/domain/tuf';

type StandardGameId = 'maimai' | 'phigros';

function standardChartId(chart: Pick<Chart, 'type' | 'levelIndex'>): string {
  return `${chart.type}:${chart.levelIndex}`;
}

function standardNotes(chart: Chart): GameNoteGroup[] {
  const notes = chart.notes;
  if (!notes) return [];
  if ('left' in notes && 'right' in notes) {
    return [
      noteGroup('left', '1P', notes.left),
      noteGroup('right', '2P', notes.right),
    ];
  }
  if ('drag' in notes) return [phigrosNoteGroup(notes)];
  return [noteGroup('notes', undefined, notes)];
}

function noteGroup(
  key: string,
  label: string | undefined,
  notes: { tap: number; hold: number; slide: number; touch: number; break: number; total: number },
): GameNoteGroup {
  return {
    key,
    label,
    values: [
      { key: 'tap', label: 'TAP', value: notes.tap },
      { key: 'hold', label: 'HOLD', value: notes.hold },
      { key: 'slide', label: 'SLIDE', value: notes.slide },
      { key: 'touch', label: 'TOUCH', value: notes.touch },
      { key: 'break', label: 'BREAK', value: notes.break },
      { key: 'total', label: '总计', value: notes.total },
    ],
  };
}

function phigrosNoteGroup(notes: PhigrosChartNotes): GameNoteGroup {
  return {
    key: 'notes',
    values: [
      { key: 'tap', label: 'TAP', value: notes.tap },
      { key: 'hold', label: 'HOLD', value: notes.hold },
      { key: 'drag', label: 'DRAG', value: notes.drag },
      { key: 'flick', label: 'FLICK', value: notes.flick },
      { key: 'total', label: '总计', value: notes.total },
    ],
  };
}

function standardChart<TGameId extends StandardGameId>(
  gameId: TGameId,
  chart: Chart,
): GameChart<TGameId, Chart> {
  return {
    gameId,
    songId: String(chart.songId),
    chartId: standardChartId(chart),
    order: chart.levelIndex,
    libraryRef: { type: chart.type, levelIndex: chart.levelIndex },
    label: chart.level,
    level: chart.level,
    constant: chart.difficultyConstant,
    charter: chart.charter,
    notes: standardNotes(chart),
    extension: chart,
  };
}

function standardSong<TGameId extends StandardGameId>(
  gameId: TGameId,
  song: Song,
): GameSong<TGameId, GameChart<TGameId, Chart>, Song> {
  return {
    gameId,
    songId: song.id,
    title: song.title,
    artist: song.artist,
    metadata: {
      version: song.version,
      bpm: song.bpm,
      genre: song.genre,
      region: song.region,
      rights: song.rights,
      locked: song.locked,
      disabled: song.disabled,
    },
    charts: song.charts.map((chart) => standardChart(gameId, chart)),
    extension: song,
  };
}

function standardScore<TGameId extends StandardGameId>(
  gameId: TGameId,
  score: ScoreRecord,
): GameScore<TGameId, ScoreRecord> {
  return {
    gameId,
    songId: String(score.songId),
    chartId: standardChartId(score),
    order: score.levelIndex,
    libraryRef: { type: score.type, levelIndex: score.levelIndex },
    key: `${score.songId}:${score.type}:${score.levelIndex}`,
    title: score.title,
    rating: score.rating,
    extension: score,
  };
}

export const maimaiContentAdapter: GameContentAdapter<
  'maimai',
  Song,
  Chart,
  ScoreRecord,
  Song,
  Chart,
  ScoreRecord
> = {
  gameId: 'maimai',
  normalizeSong: (song) => standardSong('maimai', song),
  normalizeChart: (chart) => standardChart('maimai', chart),
  normalizeScore: (score) => standardScore('maimai', score),
};

export const phigrosContentAdapter: GameContentAdapter<
  'phigros',
  Song,
  Chart,
  ScoreRecord,
  Song,
  Chart,
  ScoreRecord
> = {
  gameId: 'phigros',
  normalizeSong: (song) => standardSong('phigros', song),
  normalizeChart: (chart) => standardChart('phigros', chart),
  normalizeScore: (score) => standardScore('phigros', score),
};

function chunithmNotes(difficulty: ChunithmDifficulty): GameNoteGroup[] {
  if (!difficulty.notes) return [];
  const showFlick = difficulty.difficulty >= 3;
  return [{
    key: 'notes',
    values: [
      { key: 'tap', label: 'TAP', value: difficulty.notes.tap },
      { key: 'hold', label: 'HOLD', value: difficulty.notes.hold },
      { key: 'slide', label: 'SLIDE', value: difficulty.notes.slide },
      { key: 'air', label: 'AIR', value: difficulty.notes.air },
      ...(showFlick
        ? [{ key: 'flick', label: 'FLICK', value: difficulty.notes.flick }]
        : []),
      { key: 'total', label: '总计', value: difficulty.notes.total },
    ],
  }];
}

function chunithmChart(songId: string, difficulty: ChunithmDifficulty): GameChart<'chunithm', ChunithmDifficulty> {
  return {
    gameId: 'chunithm',
    songId,
    chartId: `SD:${difficulty.difficulty}`,
    order: difficulty.difficulty,
    libraryRef: { type: 'SD', levelIndex: difficulty.difficulty },
    label: CHUNITHM_DIFFICULTY_LABELS[difficulty.difficulty],
    level: difficulty.level,
    constant: difficulty.difficulty === 5 ? undefined : difficulty.levelValue,
    charter: difficulty.noteDesigner,
    version: difficulty.versionTitle,
    notes: chunithmNotes(difficulty),
    extension: difficulty,
  };
}

export const chunithmContentAdapter: GameContentAdapter<
  'chunithm',
  ChunithmSong,
  { songId: string; difficulty: ChunithmDifficulty },
  ChunithmScoreCardData,
  ChunithmSong,
  ChunithmDifficulty,
  ChunithmScoreCardData
> = {
  gameId: 'chunithm',
  normalizeSong: (song) => ({
    gameId: 'chunithm',
    songId: String(song.id),
    title: song.title,
    artist: song.artist,
    metadata: {
      version: song.versionTitle,
      bpm: song.bpm,
      genre: song.genre,
      rights: song.rights,
      locked: song.locked,
      disabled: song.disabled,
    },
    charts: song.difficulties.map((difficulty) => chunithmChart(String(song.id), difficulty)),
    extension: song,
  }),
  normalizeChart: ({ songId, difficulty }) => chunithmChart(songId, difficulty),
  normalizeScore: (score) => ({
    gameId: 'chunithm',
    songId: score.songId,
    chartId: `SD:${score.levelIndex}`,
    order: score.levelIndex,
    libraryRef: { type: 'SD', levelIndex: score.levelIndex },
    key: score.key,
    title: score.title,
    rating: score.rating,
    extension: score,
  }),
};

function scoreEffectToPresentation(effect: ReturnType<typeof scoreRateEffect>) {
  return effect === 'flowing-gold' || effect === 'flowing-rainbow'
    ? 'flowing-gradient' as const
    : effect === 'gold' || effect === 'rainbow'
      ? 'gradient' as const
      : 'plain' as const;
}

export type MaimaiScorePresentationInput = Pick<
  ScoreRecord,
  'songId' | 'title' | 'type' | 'levelIndex' | 'difficulty' | 'difficultyConstant'
> & {
  achievements?: number;
  dxScore?: number | null;
  rating?: number;
  fc?: string | null;
  fs?: string | null;
  rate?: string | null;
};

export function presentMaimaiScore(
  record: MaimaiScorePresentationInput,
  position?: number,
): ScoreCardPresentation<'maimai'> {
  const rate = record.rate ? scoreRateLabel(record.rate) : '';
  const badges: BadgePresentation[] = [
    ...(record.rate ? [{
      key: 'rate',
      label: rate,
      tone: record.rate,
      effect: scoreEffectToPresentation(scoreRateEffect(record.rate)),
    }] : []),
    ...(record.fc ? [{ key: 'fc', label: record.fc.toUpperCase(), tone: record.fc }] : []),
    ...(record.fs ? [{ key: 'fs', label: record.fs.toUpperCase(), tone: record.fs }] : []),
  ];
  return {
    key: `${record.songId}:${record.type}:${record.levelIndex}`,
    gameId: 'maimai',
    route: { songId: record.songId, chartType: record.type, levelIndex: record.levelIndex },
    position,
    title: record.title,
    accessibilityLabel: `查看谱面 ${record.title} ${record.type} ${record.difficulty}`,
    primaryMetric: {
      key: 'achievement',
      label: '达成率',
      text: record.achievements === undefined ? '—' : formatAchievement(record.achievements),
      effect: record.achievements !== undefined && record.achievements >= 100.5
        ? 'flowing-gradient'
        : record.achievements !== undefined && record.achievements >= 99.9999
          ? 'gradient'
          : 'plain',
    },
    secondaryMetrics: [{
      key: 'rating',
      label: 'Rating',
      text: record.rating === undefined ? '—' : String(record.rating),
      tone: record.rating === undefined ? 'muted' : 'accent',
    }],
    difficulty: {
      key: 'difficulty',
      label: record.difficulty,
      value: record.difficultyConstant.toFixed(1),
      tone: record.difficulty,
    },
    grade: record.rate ? badges[0] : undefined,
    achievementRows: [badges.slice(record.rate ? 1 : 0)],
  };
}

export function presentPhigrosScore(
  record: ScoreRecord,
  title = record.title,
  position?: number,
): ScoreCardPresentation<'phigros'> {
  const score = record.dxScore ?? 0;
  const isPhi = score === PHIGROS_MAX_SCORE;
  const isFc = record.fc === 'ap' && !isPhi;
  const rawRate = phigrosScoreToRate(score, record.fc === 'ap') as PhigrosRateKind;
  const rate = rawRate in PHIGROS_RATE_LABELS ? rawRate : 'f';
  const acc = record.achievements;
  return {
    key: `${record.songId}:SD:${record.levelIndex}`,
    gameId: 'phigros',
    route: { songId: record.songId, levelIndex: record.levelIndex },
    position,
    title,
    accessibilityLabel: `查看谱面 ${title}`,
    primaryMetric: {
      key: 'score',
      label: 'Score',
      text: Math.max(0, Math.trunc(score)).toLocaleString('en-US'),
      effect: isPhi || isFc ? 'flowing-gradient' : 'plain',
      tone: isPhi ? 'phi' : isFc ? 'fc' : 'normal',
    },
    secondaryMetrics: [
      {
        key: 'accuracy',
        text: acc % 1 === 0 ? `${acc.toFixed(0)}%` : `${acc.toFixed(2)}%`,
      },
      {
        key: 'rks',
        text: formatPhigrosSongRks(record.rating),
        tone: 'accent',
      },
    ],
    difficulty: {
      key: 'difficulty',
      label: phigrosLevelLabel(record.levelIndex),
      value: record.difficultyConstant.toFixed(1),
      tone: String(record.levelIndex),
    },
    grade: { key: 'rate', label: rate, tone: rate },
    achievementRows: [],
  };
}

export function presentChunithmScore(
  record: ChunithmScoreCardData,
  position?: number,
): ScoreCardPresentation<'chunithm'> {
  const achievements = chunithmAchievementBadges(record).map((badge) => ({
    key: badge.id,
    label: badge.label,
    tone: badge.tone,
    effect: badge.tone === 'rainbow' || badge.tone === 'gold'
      ? 'gradient' as const
      : 'plain' as const,
  }));
  const rank = chunithmRankFromScore(record.score);
  return {
    key: record.key,
    gameId: 'chunithm',
    route: { songId: record.songId, levelIndex: record.levelIndex },
    position,
    title: record.title,
    accessibilityLabel: `${record.title}，分数 ${formatChunithmScore(record.score)}，评价 ${rank}，Rating ${
      record.rating === undefined ? '—' : record.rating.toFixed(2)
    }`,
    primaryMetric: {
      key: 'score',
      label: 'Score',
      text: formatChunithmScore(record.score),
      effect: chunithmRankUsesGradient(rank)
        ? rank === 'SSS+' ? 'flowing-gradient' : 'gradient'
        : 'plain',
      tone: rank,
    },
    secondaryMetrics: [{
      key: 'rating',
      label: 'Rating',
      text: record.rating === undefined ? '—' : record.rating.toFixed(2),
      tone: record.rating === undefined ? 'muted' : 'accent',
    }],
    difficulty: {
      key: 'difficulty',
      label: CHUNITHM_DIFFICULTY_LABELS[record.levelIndex],
      value: record.levelIndex === 5
        ? record.worldsEndLabel
        : record.difficultyConstant?.toFixed(1),
      tone: String(record.levelIndex),
    },
    grade: {
      key: 'rank',
      label: rank,
      tone: rank,
      effect: chunithmRankUsesGradient(rank)
        ? rank === 'SSS+' ? 'flowing-gradient' : 'gradient'
        : 'plain',
    },
    achievementRows: [achievements],
  };
}

export function presentStandardSong<TGameId extends 'maimai' | 'phigros'>(
  gameId: TGameId,
  song: Song,
): SongRowPresentation<TGameId> {
  return {
    key: song.id,
    gameId,
    route: { songId: song.id },
    title: song.title,
    subtitle: gameId === 'phigros'
      ? song.artist ?? '曲师未知'
      : `${song.artist ?? '曲师未知'} · ${song.version}`,
    accessibilityLabel: `查看歌曲 ${song.title}`,
    chartBadges: song.charts.map((chart) => ({
      key: standardChartId(chart),
      label: chart.level,
      value: chart.difficultyConstant.toFixed(1),
      tone: chart.difficulty,
    })),
  };
}

export function presentChunithmSong(song: ChunithmSong): SongRowPresentation<'chunithm'> {
  return {
    key: String(song.id),
    gameId: 'chunithm',
    route: { songId: String(song.id) },
    title: song.title,
    subtitle: `${song.artist ?? '艺术家未知'} · ${song.versionTitle}`,
    accessibilityLabel: `打开歌曲详情 ${song.title}`,
    chartBadges: song.difficulties.map((difficulty) => ({
      key: String(difficulty.difficulty),
      label: CHUNITHM_DIFFICULTY_LABELS[difficulty.difficulty],
      value: difficulty.difficulty === 5
        ? formatChunithmWorldsEndLabel({
          kanji: difficulty.kanji,
          star: difficulty.star,
          scoreLevel: difficulty.level,
        })
        : difficulty.levelValue.toFixed(1),
      tone: String(difficulty.difficulty),
    })),
  };
}

function tufLevelLabel(level: TufLevel): string {
  return level.difficulty?.name ?? 'Unranked';
}

function tufLevelTone(level: TufLevel): string {
  return level.difficulty?.type?.toLowerCase() ?? 'unranked';
}

function tufChart(level: TufLevel): GameChart<'adofai', TufChartExtension> {
  const tileCount = level.tilecount ?? level.autoTileCount;
  return {
    gameId: 'adofai',
    songId: String(level.id),
    chartId: String(level.id),
    order: 0,
    label: tufLevelLabel(level),
    level: tufLevelLabel(level),
    constant: level.baseScore ?? level.difficulty?.baseScore ?? undefined,
    charter: level.levelCredits.map((credit) => `${credit.creator.name} (${credit.role})`).join('、') || undefined,
    notes: tileCount == null ? [] : [{
      key: 'tiles',
      values: [{ key: 'tiles', label: '物量', value: tileCount }],
    }],
    extension: { level, upstreamSongId: level.songId ?? null },
  };
}

export const adofaiContentAdapter: GameContentAdapter<
  'adofai',
  TufLevel,
  TufLevel,
  TufPass,
  TufSongExtension,
  TufChartExtension,
  TufScoreExtension
> = {
  gameId: 'adofai',
  normalizeSong: (level) => ({
    gameId: 'adofai',
    songId: String(level.id),
    title: level.song,
    artist: level.artist || undefined,
    metadata: {
      bpm: level.bpm ?? undefined,
      durationMs: level.levelLengthInMs ?? undefined,
      tiles: level.tilecount ?? level.autoTileCount ?? undefined,
      hidden: level.isHidden,
      deleted: level.isDeleted,
    },
    charts: [tufChart(level)],
    extension: { level, upstreamSongId: level.songId ?? null },
  }),
  normalizeChart: tufChart,
  normalizeScore: (pass) => ({
    gameId: 'adofai',
    songId: String(pass.levelId),
    chartId: String(pass.levelId),
    order: 0,
    key: String(pass.id),
    title: pass.level.song,
    rating: pass.impact ?? undefined,
    extension: {
      pass,
      scoreV2: pass.scoreV2,
      accuracy: pass.accuracy,
      speed: pass.speed,
      judgements: pass.judgements ?? null,
      isWorldsFirst: pass.isWorldsFirst ?? null,
      isWorldsFirstPP: pass.isWorldsFirstPP ?? null,
      isDuplicate: pass.isDuplicate ?? false,
      impact: pass.impact ?? null,
    },
  }),
};

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
    notes: tufChart(level).notes,
  };
}
