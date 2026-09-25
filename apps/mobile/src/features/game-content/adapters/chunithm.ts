import type { ChunithmSong } from '@/domain/chunithm';
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
