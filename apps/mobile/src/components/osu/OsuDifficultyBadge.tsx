import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';
import { formatOsuStar, resolveOsuStarTheme } from '@/domain/osu-star-theme';

/** osu! 难度标签：仅星数「N★」，六档星带配色经公共 GameDifficultyBadge 渲染。 */
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
