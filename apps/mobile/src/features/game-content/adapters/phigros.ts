import type {
  GameContentAdapter,
} from '@/domain/game-content';
import type { Chart, ScoreRecord, Song } from '@/domain/models';
import {
  formatPhigrosSongRks,
  PHIGROS_MAX_SCORE,
  phigrosScoreToRate,
} from '@/domain/phigros';
import { phigrosLevelLabel } from '@/domain/phigros-level-theme';
import { PHIGROS_RATE_LABELS, type PhigrosRateKind } from '@/domain/phigros-rate-theme';
import type { ScoreCardPresentation } from '../presentation';
import { standardChart, standardScore, standardSong } from './standard';

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
