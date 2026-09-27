import type { Chart, Song } from '@/domain/models';
import type { SongRowPresentation } from '../presentation';

function standardChartId(chart: Pick<Chart, 'type' | 'levelIndex'>): string {
  return `${chart.type}:${chart.levelIndex}`;
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
