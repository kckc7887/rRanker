import { memo } from 'react';
import { TufLevelImage } from './TufLevelImage';
import { TufDifficultyBadge } from './TufDifficultyBadge';
import { GameSongRow } from '@/components/game-content/GameSongRow';
import type { TufLevel } from '@/domain/tuf';
import { presentTufLevel } from '@/features/game-content/adapters';

export const TufSongRow = memo(function TufSongRow({ level }: { level: TufLevel }) {
  const presentation = presentTufLevel(level);
  const badge = presentation.chartBadges[0];

  return <GameSongRow presentation={presentation} wholeRowPressable
    cover={<TufLevelImage level={level} thumbnail />}
    badges={badge ? <TufDifficultyBadge difficulty={badge} source={level.difficulty} /> : null} />;
});
