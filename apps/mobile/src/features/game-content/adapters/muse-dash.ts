import type {
  GameChart,
  GameContentAdapter,
} from '@/domain/game-content';
import {
  MUSE_DASH_DIFFICULTY_LABELS,
  museDashAccTone,
  museDashGrade,
  museDashSongAuthor,
  museDashSongTitle,
  resolveMuseDashAchievement,
  type MuseDashChartExtension,
  type MuseDashPlayDetail,
  type MuseDashRawScore,
  type MuseDashScoreExtension,
  type MuseDashSong,
  type MuseDashSongExtension,
} from '@/domain/muse-dash';
import type {
  ChartCardPresentation,
  ScoreCardPresentation,
  SongRowPresentation,
} from '../presentation';

/** Muse Dash 谱面原始输入：歌曲 + 难度档位；constant 为 /diffdiff 社区定数，无定数时为 undefined。 */
export type MuseDashRawChart = {
  song: MuseDashSong;
  albumTitle: string;
  difficultyIndex: number;
  constant?: number;
};

export type MuseDashRawSong = { song: MuseDashSong; albumTitle: string };

/**
 * 谱师解析（对齐官方前端 music.vue 语义）：
 * 传入难度档位时优先取该档谱师；该档缺失时单谱师回退歌曲级，多谱师列出全部非空；
 * 不传档位时（歌曲级信息）列出全部非空谱师。
 */
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

function museDashChart(raw: MuseDashRawChart): GameChart<'musedash', MuseDashChartExtension> {
  const officialLevel = raw.song.difficulty[raw.difficultyIndex] ?? '0';
  return {
    gameId: 'musedash',
    songId: raw.song.uid,
    chartId: `${raw.song.uid}:${raw.difficultyIndex}`,
    order: raw.difficultyIndex,
    label: MUSE_DASH_DIFFICULTY_LABELS[raw.difficultyIndex],
    level: officialLevel === '0' ? '—' : officialLevel,
    constant: raw.constant,
    charter: museDashCharter(raw.song.levelDesigner, raw.difficultyIndex) || undefined,
    notes: [],
    libraryRef: { type: 'SD', levelIndex: raw.difficultyIndex },
    extension: {
      song: raw.song,
      albumTitle: raw.albumTitle,
      difficultyIndex: raw.difficultyIndex,
      officialLevel,
      constant: raw.constant,
    },
  };
}

export const museDashContentAdapter: GameContentAdapter<
  'musedash',
  MuseDashRawSong,
  MuseDashRawChart,
  MuseDashRawScore,
  MuseDashSongExtension,
  MuseDashChartExtension,
  MuseDashScoreExtension
> = {
  gameId: 'musedash',
  normalizeSong: (raw) => ({
    gameId: 'musedash',
    songId: raw.song.uid,
    title: museDashSongTitle(raw.song),
    artist: museDashSongAuthor(raw.song),
    metadata: {
      album: raw.albumTitle,
      bpm: raw.song.bpm ? Number(raw.song.bpm) : undefined,
      cover: raw.song.cover,
      levelDesigner: museDashCharter(raw.song.levelDesigner),
    },
    charts: raw.song.difficulty.flatMap((level, difficultyIndex) =>
      level === '0' ? [] : [museDashChart({ song: raw.song, albumTitle: raw.albumTitle, difficultyIndex })]),
    extension: { song: raw.song, albumTitle: raw.albumTitle, bpm: raw.song.bpm, cover: raw.song.cover },
  }),
  normalizeChart: museDashChart,
  normalizeScore: (raw) => {
    const play = raw.play;
    const currentRank = play.i ?? play.history?.lastRank ?? 0;
    const lastRank = play.history?.lastRank ?? play.i ?? 0;
    return {
      gameId: 'musedash',
      songId: play.uid,
      chartId: `${play.uid}:${play.difficulty}`,
      order: play.difficulty,
      key: `${play.uid}:${play.difficulty}`,
      title: raw.song ? museDashSongTitle(raw.song) : play.uid,
      rating: play.sum,
      libraryRef: { type: 'SD', levelIndex: play.difficulty },
      extension: {
        play,
        acc: play.acc,
        currentRank,
        lastRank,
        sum: play.sum ?? 0,
        platform: play.platform ?? 'mobile',
        characterName: raw.characterName,
        elfinName: raw.elfinName,
      },
    };
  },
};

export function formatMuseDashAcc(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatMuseDashScore(value: number): string {
  return Math.max(0, Math.trunc(value)).toLocaleString('en-US');
}

/** 官方等级字符串是否为数字（"?"/"¿"/"E"/"H"/"L"/"N" 等特殊档位不是数字）。 */
export function isNumericMuseDashLevel(level: string): boolean {
  return /^\d+(\.\d+)?$/.test(level.trim());
}

/**
 * 展示模型：
 * - primaryMetric = ACC（色阶 tone）
 * - difficulty.value 为定数（组件层拼 "MASTER (8.2)" 带空格）
 * - achievementRows 只承载成就（AP/FC）与角色、精灵；平台与排名徽章由组件层渲染（仿 PhigrosXingBadge）。
 */
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
    route: { songId: play.uid, levelIndex: play.difficulty },
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
    route: { songId: raw.song.uid },
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
    route: { songId: raw.song.uid, levelIndex: raw.difficultyIndex },
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
