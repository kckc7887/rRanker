import { PhiraDifficultyBadge } from './PhiraScoreVisuals';
import { memo } from 'react';
import { GameSongRow, SongRowBadges } from '@/components/game-content/GameSongRow';
import type { PhiraChart } from '@/domain/phira';
import { presentPhiraSong } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export const PhiraSongRow = memo(function PhiraSongRow({ chart }: { chart: PhiraChart }) {
  const theme = useAppTheme();
  return <GameSongRow presentation={presentPhiraSong(chart)} coverSource={chart.illustration}
    coverLabel="曲绘" placeholderColor={theme.input}
    badges={<SongRowBadges><PhiraDifficultyBadge constant={chart.difficulty} label={chart.level} /></SongRowBadges>} />;
});
