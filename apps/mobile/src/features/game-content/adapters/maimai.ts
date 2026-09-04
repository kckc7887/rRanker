import type {
  GameContentAdapter,
} from '@/domain/game-content';
import type { Chart, ScoreRecord, Song } from '@/domain/models';
import { formatAchievement, scoreRateEffect, scoreRateLabel } from '@/domain/score-presentation';
import type {
  BadgePresentation,
  ScoreCardPresentation,
} from '../presentation';
import { standardChart, standardScore, standardSong } from './standard';

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
