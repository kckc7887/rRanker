import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';
import { resolveOsuRankTheme } from '@/domain/osu-rank-theme';

/** osu! 评价标签：SS/S/A/B/C/D/F 胶囊，经公共 GameDifficultyBadge 渲染（同 OsuDifficultyBadge）。 */
export function OsuRankTag({ rank, testID }: { rank: string; testID?: string }) {
  const theme = resolveOsuRankTheme(rank);
  if (!theme) return null;
  return (
    <GameDifficultyBadge
      accessibilityLabel={`评价 ${theme.label}`}
      testID={testID}
      text={theme.label}
      theme={{ background: theme.background, border: theme.border, text: theme.text }}
    />
  );
}
