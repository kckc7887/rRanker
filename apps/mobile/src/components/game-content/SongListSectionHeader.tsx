import { Text, View } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';
import { SIMAI_BEST_LIST_STYLES as styles } from './SimaiListStyles';

export function SongListSectionHeader({ title, count }: { title: string; count: number }) {
  const theme = useAppTheme();
  return <View style={styles.sectionHeader}>
    <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
    <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{count} 张谱面</Text>
  </View>;
}
