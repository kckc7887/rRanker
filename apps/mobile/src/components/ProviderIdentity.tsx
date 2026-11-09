import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

export function ProviderIdentity({ icon, title, gameTitle }: { icon: ImageSourcePropType; title: string; gameTitle: string }) {
  const theme = useAppTheme();
  return <View style={styles.identity}>
    <Image source={icon} style={styles.icon} />
    <Text style={[styles.provider, { color: theme.text }]}>{title}</Text>
    <Text style={[styles.game, { color: theme.textMuted }]}>用于绑定 {gameTitle}</Text>
  </View>;
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: 6, paddingVertical: 4 },
  icon: { width: 64, height: 64, borderRadius: 16 },
  provider: { fontSize: 20, fontWeight: '700' },
  game: { fontSize: 13 },
});
