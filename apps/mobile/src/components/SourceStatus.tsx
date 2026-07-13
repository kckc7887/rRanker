import { StyleSheet, Text, View } from 'react-native';
import type { SourceStatusItem } from '@/domain/models';

export function SourceStatus({ items }: { items: SourceStatusItem[] }) {
  return (
    <View accessibilityLabel="数据来源状态" style={styles.container}>
      {items.map((item) => (
        <View key={item.key} style={styles.row}>
          <View style={[styles.dot, item.state === 'live' ? styles.live : item.state === 'cache' ? styles.cache : styles.off]} />
          <Text style={styles.text} numberOfLines={1}>
            {item.label}{item.updatedAt ? ` · ${new Date(item.updatedAt).toLocaleString()}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#EEF2F7', borderRadius: 10, padding: 10, gap: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 }, live: { backgroundColor: '#16A34A' },
  cache: { backgroundColor: '#D97706' }, off: { backgroundColor: '#DC2626' },
  text: { color: '#4B5563', fontSize: 11, flex: 1 },
});
