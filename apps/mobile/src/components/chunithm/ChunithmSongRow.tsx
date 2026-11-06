import { memo } from 'react';
import {
  type ChunithmDifficulty,
  type ChunithmSong,
} from '@/domain/chunithm';
import { chunithmJacketUrl } from '@/domain/chunithm-assets';
import { formatChunithmWorldsEndLabel } from '@/domain/chunithm-score-presentation';
import { GameSongRow, SongRowBadges } from '@/components/game-content/GameSongRow';
import { presentChunithmSong } from '@/features/game-content/adapters';
import { ChunithmDifficultyBadge } from './ChunithmDifficultyBadge';

export { chunithmJacketUrl } from '@/domain/chunithm-assets';

export const ChunithmSongRow = memo(function ChunithmSongRow({
  song,
  displayedDifficulties,
  displayedVersionTitle,
  matchedAlias,
}: {
  song: ChunithmSong;
  displayedDifficulties?: readonly ChunithmDifficulty[];
  displayedVersionTitle?: string;
  matchedAlias?: string;
}) {
  const presentation = presentChunithmSong(song);
  const difficulties = [...(displayedDifficulties ?? song.difficulties)].sort(
    (left, right) => left.difficulty - right.difficulty,
  );

  return (
    <GameSongRow
      presentation={presentation}
      testID={`chunithm-song-${song.id}`}
      wholeRowPressable matchedAlias={matchedAlias}
      subtitleContent={<>{song.artist ?? '艺术家未知'} · {displayedVersionTitle ?? song.versionTitle}</>}
      coverSource={chunithmJacketUrl(song)} coverLabel={`歌曲封面 ${song.title}`}
      badges={(
        <SongRowBadges>
          {difficulties.map((difficulty) => (
            <ChunithmDifficultyBadge
              constant={difficulty.levelValue}
              key={`${song.id}-${difficulty.difficulty}`}
              level={difficulty.level}
              levelIndex={difficulty.difficulty}
              worldsEndLabel={difficulty.difficulty === 5
                ? formatChunithmWorldsEndLabel({
                  kanji: difficulty.kanji,
                  star: difficulty.star,
                })
                : undefined}
            />
          ))}
        </SongRowBadges>
      )}
    />
  );
});
