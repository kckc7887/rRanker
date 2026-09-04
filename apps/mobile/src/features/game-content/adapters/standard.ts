import type {
  GameChart,
  GameNoteGroup,
  GameScore,
  GameSong,
} from '@/domain/game-content';
import type { Chart, PhigrosChartNotes, ScoreRecord, Song } from '@/domain/models';
import type { SongRowPresentation } from '../presentation';

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

export function standardChart<TGameId extends StandardGameId>(
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

export function standardSong<TGameId extends StandardGameId>(
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

export function standardScore<TGameId extends StandardGameId>(
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
