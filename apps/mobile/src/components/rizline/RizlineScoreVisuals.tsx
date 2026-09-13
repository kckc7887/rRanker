import { StyleSheet, Text, View } from 'react-native';
import { rizlineDifficultyColors, type RizlineDifficulty } from '@/domain/rizline';
import { useAppTheme } from '@/theme/app-theme';

export function RizlineDifficultyBadge({ difficulty, level }: { difficulty: RizlineDifficulty; level?: string }) {
  const theme = useAppTheme();
  const colors = rizlineDifficultyColors(difficulty, theme.dark);
  return <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: difficulty === 'SP' ? theme.border : colors.bg }]}>
    <Text style={[styles.text, { color: colors.fg }]}>{difficulty}{level === undefined ? '' : ` ${level}`}</Text>
  </View>;
}

export function RizlineApBadge() {
  return <View accessibilityLabel="AP" style={[styles.badge, styles.ap]}><Text style={[styles.text, styles.apText]}>AP</Text></View>;
}

const styles = StyleSheet.create({
  badge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth },
  text: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
  ap: { backgroundColor: '#FFF3C4', borderColor: '#C9A33E' }, apText: { color: '#79581C' },
});
