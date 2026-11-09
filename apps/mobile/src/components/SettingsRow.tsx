import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DetailPressable } from '@/components/game-content/DetailPressable';
import { useAppTheme } from '@/theme/app-theme';

export function SettingsRow({ title, detail, children, onPress }: {
  title: string; detail?: string; children?: ReactNode; onPress?: () => void;
}) {
  const theme = useAppTheme();
  const row = [styles.row, { backgroundColor: theme.surface }];
  const copy = <View style={styles.copy}>
    <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
    {detail && <Text style={[styles.detail, { color: theme.textMuted }]}>{detail}</Text>}
  </View>;
  const chevron = <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>;
  if (onPress && !children) {
    return <DetailPressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
      style={({ pressed }) => [row, pressed && styles.pressed]}>{copy}{chevron}</DetailPressable>;
  }
  return <View style={row}>
    {onPress ? <DetailPressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
      style={({ pressed }) => [styles.main, pressed && styles.pressed]}>{copy}</DetailPressable> : copy}
    {children}
    {onPress && <DetailPressable accessibilityRole="button" accessibilityLabel={'打开' + title} hitSlop={8} onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>{chevron}</DetailPressable>}
  </View>;
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 18, paddingVertical: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, gap: 4 },
  main: { flex: 1 },
  pressed: { opacity: 0.7 },
  title: { fontSize: 17, fontWeight: '700' },
  detail: { fontSize: 13, lineHeight: 18 },
  chevron: { fontSize: 28, lineHeight: 28, fontWeight: '300' },
});
