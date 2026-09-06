import { StyleSheet } from 'react-native';
import { GameDifficultyBadge, type GameDifficultyBadgeTheme } from './GameDifficultyBadge';

/** 舞萌原有难度胶囊的完整尺寸档；值由游戏适配，不归一化字符串难度。 */
export function SimaiDifficultyBadge({ text, theme, compact = false, mini = false, accessibilityLabel, testID }: {
  text: string;
  theme: GameDifficultyBadgeTheme;
  compact?: boolean;
  mini?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return <GameDifficultyBadge
    accessibilityLabel={accessibilityLabel}
    testID={testID}
    text={text}
    theme={theme}
    badgeVariants={[styles.difficultyBadge, compact && !mini && styles.difficultyBadgeCompact, mini && styles.difficultyBadgeMini]}
    textVariants={[styles.difficultyText, compact && !mini && styles.difficultyTextCompact, mini && styles.difficultyTextMini]}
  />;
}

const styles = StyleSheet.create({
  difficultyBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  difficultyBadgeCompact: { paddingHorizontal: 8, paddingVertical: 5 },
  difficultyBadgeMini: { paddingHorizontal: 5, paddingVertical: 2 },
  difficultyText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  difficultyTextCompact: { fontSize: 9, letterSpacing: 0.25 },
  difficultyTextMini: { fontSize: 8, letterSpacing: 0.1, fontWeight: '800' },
});
