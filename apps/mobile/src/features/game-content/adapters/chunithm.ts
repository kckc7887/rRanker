import type {
  GameChart,
  GameContentAdapter,
  GameNoteGroup,
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
import type {
  ScoreCardPresentation,
  SongRowPresentation,
} from '../presentation';

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
