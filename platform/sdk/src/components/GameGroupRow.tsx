import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';

export function GameGroupRow({ icon, title, detail, expanded, onPress, label, badges, compact, locked }: {
  icon: ImageSourcePropType; title: string; detail: string; expanded: boolean; onPress: () => void;
  label?: string; badges?: ReactNode; compact?: boolean; locked?: boolean;
}) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: locked ? undefined : expanded }}
    onPress={onPress} style={({ pressed }) => [styles.row, compact && styles.compact, (pressed || locked) && styles.dim]}>
    <Image source={icon} style={compact ? styles.smallIcon : styles.icon} />
    <View style={styles.copy}>
      <View style={styles.heading}>
        <Text style={[styles.title, compact && styles.smallTitle, { color: locked ? theme.textMuted : theme.text }]}>{title}</Text>{badges}
      </View>
      <Text style={[styles.detail, { color: theme.textMuted }]}>{detail}</Text>
    </View>
    <SymbolView name={locked ? 'lock.fill' : expanded ? 'chevron.down' : 'chevron.right'} size={14} weight="semibold" tintColor={theme.textMuted}
      fallback={<Ionicons name={locked ? 'lock-closed' : expanded ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.textMuted} />} />
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  compact: { padding: 10, gap: 10 },
  icon: { width: 52, height: 52, borderRadius: 14 },
  smallIcon: { width: 36, height: 36, borderRadius: 10 },
  copy: { flex: 1, gap: 2 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  smallTitle: { fontSize: 15 },
  detail: { fontSize: 13, lineHeight: 18 },
  dim: { opacity: 0.65 },
});
