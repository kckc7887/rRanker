import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ScoreSnapshot } from '@/domain/models';
import { wireframeSnapshotPromise } from '@/features/wireframe-data';

export default function OverviewScreen() {
  const [snapshot, setSnapshot] = useState<ScoreSnapshot | null>(null);
  useEffect(() => { void wireframeSnapshotPromise.then(setSnapshot); }, []);
  if (!snapshot) return <ActivityIndicator style={styles.loading} />;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>M0 功能线框 · {snapshot.source.label}</Text>
      <Text style={styles.name}>{snapshot.player.displayName}</Text>
      <View style={styles.ratingCard}>
        <Text style={styles.cardLabel}>DX RATING</Text>
        <Text style={styles.rating}>{snapshot.best50.rating.toString().padStart(5, '0')}</Text>
        <Text style={styles.meta}>B35 {snapshot.best50.b35.length} · B15 {snapshot.best50.b15.length}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>数据状态</Text>
        <Text style={styles.body}>来源：{snapshot.source.label}</Text>
        <Text style={styles.body}>更新时间：{new Date(snapshot.source.updatedAt).toLocaleString()}</Text>
        <Text style={styles.note}>当前仅使用脱敏 fixture；真实水鱼 provider 需通过双端登录契约验证后启用。</Text>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  loading: { flex: 1 }, page: { padding: 20, gap: 16, backgroundColor: '#F7F8FA', flexGrow: 1 },
  eyebrow: { color: '#5B6472', fontSize: 13 }, name: { color: '#111827', fontSize: 28, fontWeight: '700' },
  ratingCard: { backgroundColor: '#111827', borderRadius: 18, padding: 22, gap: 6 },
  cardLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },
  rating: { color: '#FFFFFF', fontSize: 42, fontWeight: '800', letterSpacing: 2 }, meta: { color: '#CBD5E1' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, gap: 8 },
  cardTitle: { color: '#111827', fontSize: 18, fontWeight: '700' }, body: { color: '#374151' },
  note: { color: '#6B7280', lineHeight: 20, marginTop: 4 },
});
