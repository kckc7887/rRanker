import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { ScoreRecord } from '@/domain/models';
import { wireframeSnapshotPromise } from '@/features/wireframe-data';

export default function RecordsScreen() {
  const [records, setRecords] = useState<ScoreRecord[] | null>(null);
  useEffect(() => { void wireframeSnapshotPromise.then((value) => setRecords(value.records)); }, []);
  if (!records) return <ActivityIndicator style={styles.loading} />;
  return <FlatList contentContainerStyle={styles.page} data={records}
    keyExtractor={(record) => `${record.songId}-${record.levelIndex}`}
    ListHeaderComponent={<Text style={styles.note}>共 {records.length} 条脱敏成绩</Text>}
    renderItem={({ item }) => <View style={styles.row}><View style={styles.main}>
      <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
      <Text style={styles.meta}>{item.type} · {item.level} · {item.version}</Text>
    </View><View style={styles.values}><Text style={styles.achievement}>{item.achievements.toFixed(4)}%</Text>
      <Text style={styles.meta}>Ra {item.rating}</Text></View></View>} />;
}
const styles = StyleSheet.create({
  loading: { flex: 1 }, page: { padding: 16, gap: 10, backgroundColor: '#F7F8FA' }, note: { color: '#6B7280', marginBottom: 6 },
  row: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, gap: 3 }, title: { color: '#111827', fontWeight: '600' }, meta: { color: '#6B7280', fontSize: 12 },
  values: { alignItems: 'flex-end', gap: 3 }, achievement: { color: '#111827', fontWeight: '700' },
});
