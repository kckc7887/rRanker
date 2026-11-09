import { memo } from 'react';
import { GameSongRow, SongRowBadges } from '@/components/game-content/GameSongRow';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import type { Song } from '@/domain/models';
import { presentStandardSong } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export const PhigrosSongRow = memo(function PhigrosSongRow({
  song,
  blurUrl,
  favorite = false,
  favoritePending = false,
  onFavoriteChange,
  matchedAlias,
}: {
  song: Song;
  blurUrl: string | null;
  favorite?: boolean;
  favoritePending?: boolean;
  onFavoriteChange?: (songId: string, favorite: boolean) => void;
  matchedAlias?: string;
}) {
  const theme = useAppTheme();
  const presentation = presentStandardSong('phigros', song);

  return (
    <GameSongRow
      presentation={presentation}
      matchedAlias={matchedAlias} coverSource={blurUrl} coverLabel="曲绘" placeholderColor={theme.input}
      favorite={favorite} favoritePending={favoritePending} onFavoriteChange={onFavoriteChange}
      badges={(
        <SongRowBadges>
            {[...(song.charts ?? [])]
              .sort((a, b) => a.levelIndex - b.levelIndex)
              .map((chart) => (
                <PhigrosDifficultyBadge
                  key={`${chart.songId}-${chart.levelIndex}`}
                  levelIndex={chart.levelIndex}
                  constant={chart.difficultyConstant}
                  showLabel={false}
                />
              ))}
        </SongRowBadges>
      )}
    />
  );
});
