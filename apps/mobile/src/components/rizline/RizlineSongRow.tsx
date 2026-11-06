import { memo } from 'react';
import { GameSongRow, SongRowBadges } from '@/components/game-content/GameSongRow';
import { rizlineCoverUrl, sortedRizlineCharts, type RizlineSong } from '@/domain/rizline';
import { presentRizlineSong } from '@/features/game-content/adapters/rizline';
import { useAppTheme } from '@/theme/app-theme';
import { RizlineDifficultyBadge } from './RizlineScoreVisuals';

export const RizlineSongRow = memo(function RizlineSongRow({ song, favorite = false, favoritePending = false, onFavoriteChange }: {
  song: RizlineSong; favorite?: boolean; favoritePending?: boolean; onFavoriteChange?: (songId: string, favorite: boolean) => void;
}) {
  const theme = useAppTheme();
  return <GameSongRow presentation={presentRizlineSong(song)} coverSource={rizlineCoverUrl(song)}
    coverLabel="曲绘" placeholderColor={theme.input} favorite={favorite} favoritePending={favoritePending} onFavoriteChange={onFavoriteChange}
    badges={<SongRowBadges>{sortedRizlineCharts(song.charts).map((chart) =>
      <RizlineDifficultyBadge key={chart.id} difficulty={chart.difficulty} constant={chart.constant} showLabel={false} />)}</SongRowBadges>} />;
});
