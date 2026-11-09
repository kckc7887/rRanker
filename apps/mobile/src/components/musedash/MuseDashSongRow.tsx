import { memo } from 'react';
import { MuseDashDifficultyBadge } from './MuseDashDifficultyBadge';
import { GameSongRow, SongRowBadges } from '@/components/game-content/GameSongRow';
import { museDashCoverUrl, type MuseDashSong } from '@/domain/muse-dash';
import { presentMuseDashSong } from '@/features/game-content/adapters';

export const MuseDashSongRow = memo(function MuseDashSongRow({
  song,
  albumTitle,
  constants,
}: {
  song: MuseDashSong;
  albumTitle: string;
  constants?: readonly (number | undefined)[];
}) {
  const presentation = presentMuseDashSong({ song, albumTitle }, constants);
  const coverUrl = museDashCoverUrl(song.cover);
  const slots = song.difficulty.flatMap((level, difficultyIndex) =>
    level === '0' ? [] : [{ difficultyIndex, level }]);
  return (
    <GameSongRow
      presentation={presentation}
      wholeRowPressable coverSource={coverUrl} coverRadius={31} coverLabel={`歌曲封面 ${song.name}`}
      badges={(
        <SongRowBadges>
          {slots.map(({ difficultyIndex, level }) => (
            <MuseDashDifficultyBadge
              constant={constants?.[difficultyIndex]}
              key={`${song.uid}-${difficultyIndex}`}
              level={level}
              levelIndex={difficultyIndex}
            />
          ))}
        </SongRowBadges>
      )}
    />
  );
});
