import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { Best50Snapshot, ScoreRecord } from '@/domain/models';
import { wireframeSnapshotPromise } from '@/features/wireframe-data';
type Row = { group: 'B35' | 'B15'; record: ScoreRecord };

export default function Best50Screen() {
  const [best50, setBest50] = useState<Best50Snapshot | null>(null);
  useEffect(() => { void wireframeSnapshotPromise.then((value) => setBest50(value.best50)); }, []);
  if (!best50) return <ActivityIndicator style={styles.loading} />;
  const rows: Row[] = [
    ...best50.b35.map((record) => ({ group: 'B35' as const, record })),
    ...best50.b15.map((record) => ({ group: 'B15' as const, record })),
  ];
  return <FlatList contentContainerStyle={styles.page} data={rows}
    keyExtractor={({ group, record }) => `${group}-${record.songId}-${record.levelIndex}`}
    ListHeaderComponent={<Text style={styles.note}>按单曲 Rating 排序；当前版本由已验证曲库字段决定。</Text>}
    renderItem={({ item, index }) => <View style={styles.row}>
      <Text style={styles.rank}>{index + 1}</Text><View style={styles.main}>
        <Text numberOfLines={1} style={styles.title}>{item.record.title}</Text>
        <Text style={styles.meta}>{item.group} · {item.record.type} · {item.record.level}</Text>
      </View><Text style={styles.rating}>{item.record.rating}</Text>
    </View>} />;
}
const styles = StyleSheet.create({
  loading: { flex: 1 }, page: { padding: 16, gap: 10, backgroundColor: '#F7F8FA' }, note: { color: '#6B7280', marginBottom: 6 },
  row: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { color: '#9CA3AF', width: 24, fontWeight: '700' }, main: { flex: 1, gap: 3 },
  title: { color: '#111827', fontWeight: '600' }, meta: { color: '#6B7280', fontSize: 12 },
  rating: { color: '#246BFD', fontWeight: '800', fontSize: 18 },
});
