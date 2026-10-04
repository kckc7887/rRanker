import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';
import { formatOsuStar, resolveOsuStarTheme } from '@/domain/osu-star-theme';

export function OsuDifficultyBadge({ star, testID }: { star: number; testID?: string }) {
  const theme = resolveOsuStarTheme(star);
  return (
    <GameDifficultyBadge
      accessibilityLabel={`难度 ${formatOsuStar(star)}`}
      text={formatOsuStar(star)}
      theme={theme}
      testID={testID}
    />
  );
}
