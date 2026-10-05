import { encodeDetailTarget } from '@/domain/detail-target';
import {
  MUSE_DASH_DIFFICULTY_LABELS,
  museDashAccTone,
  museDashGrade,
  museDashSongAuthor,
  museDashSongTitle,
  resolveMuseDashAchievement,
  type MuseDashPlayDetail,
  type MuseDashRawScore,
  type MuseDashSong,
} from '@/domain/muse-dash';
import type {
  ChartCardPresentation,
  ScoreCardPresentation,
  SongRowPresentation,
} from '../presentation';

/** constant 取 diffdiff 社区定数。 */
export type MuseDashRawChart = {
  song: MuseDashSong;
  albumTitle: string;
  difficultyIndex: number;
  constant?: number;
};

export type MuseDashRawSong = { song: MuseDashSong; albumTitle: string };

/** 谱师选择规则沿用官方 music.vue；单谱师可跨难度回退。 */
function museDashCharter(levelDesigner: readonly (string | null)[], difficultyIndex?: number): string {
  const nonNull = (name: string | null): name is string => !!name && name.trim() !== '';
  if (difficultyIndex !== undefined) {
    const perLevel = levelDesigner[difficultyIndex];
    if (perLevel && perLevel.trim()) return perLevel.trim();
    const unique = [...new Set(levelDesigner.filter(nonNull))];
    if (unique.length === 1) return unique[0];
    return levelDesigner.filter(nonNull).join('、');
  }
  return levelDesigner.filter(nonNull).join('、');
}

export function formatMuseDashAcc(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatMuseDashScore(value: number): string {
  return Math.max(0, Math.trunc(value)).toLocaleString('en-US');
}

export function isNumericMuseDashLevel(level: string): boolean {
  return /^\d+(\.\d+)?$/.test(level.trim());
}

export function presentMuseDashScore(
  raw: MuseDashRawScore,
  options?: { detail?: MuseDashPlayDetail; position?: number },
): ScoreCardPresentation<'musedash'> {
  const play = raw.play;
  const title = raw.song ? museDashSongTitle(raw.song) : play.uid;
  const currentRank = play.i ?? play.history?.lastRank ?? 0;
  const achievement = resolveMuseDashAchievement(play.acc, options?.detail?.play.miss);
  const grade = museDashGrade(play.acc);
  const officialLevel = raw.song?.difficulty[play.difficulty];
  return {
    key: `${play.uid}:${play.difficulty}`,
    gameId: 'musedash',
    route: encodeDetailTarget({ game: 'musedash', songId: play.uid, levelIndex: play.difficulty }),
    position: options?.position,
    title,
    accessibilityLabel: `查看谱面 ${title}，ACC ${formatMuseDashAcc(play.acc)}，评价 ${grade}，排名 ${currentRank}`,
    primaryMetric: { key: 'acc', label: 'ACC', text: formatMuseDashAcc(play.acc), tone: museDashAccTone(play.acc) },
    secondaryMetrics: [
      { key: 'rating', label: 'Rating', text: play.sum == null ? '—' : String(play.sum), tone: 'accent' },
      ...(currentRank > 0 ? [{ key: 'rank', label: '排名', text: `#${currentRank}` }] : []),
    ],
    difficulty: {
      key: 'difficulty',
      label: MUSE_DASH_DIFFICULTY_LABELS[play.difficulty],
      value: raw.constant?.toFixed(2)
        ?? (officialLevel && officialLevel !== '0' ? officialLevel : undefined),
      tone: String(play.difficulty),
    },
    grade: { key: 'grade', label: grade, tone: museDashAccTone(play.acc) },
    achievementRows: [[
      ...(achievement ? [{ key: 'achievement', label: achievement, tone: achievement === 'AP' ? 'achievement-ap' : 'achievement-fc' }] : []),
      ...(raw.characterName ? [{ key: 'character', label: raw.characterName, tone: 'character' }] : []),
      ...(raw.elfinName ? [{ key: 'elfin', label: raw.elfinName, tone: 'elfin' }] : []),
    ]],
  };
}

export function presentMuseDashSong(
  raw: MuseDashRawSong,
  constants?: readonly (number | undefined)[],
): SongRowPresentation<'musedash'> {
  const chartBadges = raw.song.difficulty.flatMap((level, difficultyIndex) => {
    if (level === '0') return [];
    const constant = constants?.[difficultyIndex];
    const value = constant != null
      ? (isNumericMuseDashLevel(level) ? constant.toFixed(2) : `${level} ${constant.toFixed(2)}`)
      : level;
    return [{
      key: `${raw.song.uid}:${difficultyIndex}`,
      label: MUSE_DASH_DIFFICULTY_LABELS[difficultyIndex],
      value,
      tone: String(difficultyIndex),
    }];
  });
  return {
    key: raw.song.uid,
    gameId: 'musedash',
    route: encodeDetailTarget({ game: 'musedash', songId: raw.song.uid }),
    title: museDashSongTitle(raw.song),
    subtitle: `${museDashSongAuthor(raw.song)} · ${raw.albumTitle}`,
    accessibilityLabel: `打开歌曲 ${museDashSongTitle(raw.song)}`,
    chartBadges,
  };
}

export function presentMuseDashChart(
  raw: MuseDashRawChart,
  score?: MuseDashRawScore,
  detail?: MuseDashPlayDetail,
): ChartCardPresentation<'musedash'> {
  const presented = score ? presentMuseDashScore(score, { detail }) : undefined;
  const officialLevel = raw.song.difficulty[raw.difficultyIndex] ?? '0';
  return {
    key: `${raw.song.uid}:${raw.difficultyIndex}`,
    gameId: 'musedash',
    route: encodeDetailTarget({ game: 'musedash', songId: raw.song.uid, levelIndex: raw.difficultyIndex }),
    difficulty: {
      key: 'difficulty',
      label: MUSE_DASH_DIFFICULTY_LABELS[raw.difficultyIndex],
      value: raw.constant != null
        ? raw.constant.toFixed(2)
        : officialLevel === '0' ? undefined : officialLevel,
      tone: String(raw.difficultyIndex),
    },
    primaryMetric: presented?.primaryMetric ?? { key: 'acc', label: 'ACC', text: '—' },
    secondaryMetrics: presented?.secondaryMetrics ?? [],
    grade: presented?.grade,
    achievementRows: presented?.achievementRows ?? [],
    charter: museDashCharter(raw.song.levelDesigner, raw.difficultyIndex) || '未提供',
    notes: [],
  };
}
