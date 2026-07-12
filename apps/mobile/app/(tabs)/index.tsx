import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { QueryStateView } from '@/components/QueryStateView';
import type { ScoreSnapshot } from '@/domain/models';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useSession } from '@/state/session-store';

export default function OverviewScreen() {
  const { data, isLoading, isError, isDataStale, error, refetch } = useScoreSnapshot();
  const session = useSession((s) => s.session);
  return (
    <View style={styles.page}>
      <QueryStateView<ScoreSnapshot>
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        isStale={isDataStale}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        data={data}
        renderData={(snapshot) => (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <View style={styles.headerRow}>
              <Text style={styles.eyebrow}>M0 功能线框 · {snapshot.source.label}</Text>
              <Pressable onPress={() => void refetch()} style={styles.refresh}>
                <Text style={styles.refreshText}>刷新</Text>
              </Pressable>
            </View>
            <Text style={styles.name}>{snapshot.player.displayName}</Text>
            <View style={styles.ratingCard}>
              <Text style={styles.cardLabel}>DX RATING</Text>
              <Text style={styles.rating}>{snapshot.best50.rating.toString().padStart(5, '0')}</Text>
              <Text style={styles.meta}>B35 {snapshot.best50.b35.length} · B15 {snapshot.best50.b15.length}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>数据状态</Text>
              <Text style={styles.body}>来源：{snapshot.source.label}</Text>
              <Text style={styles.body}>曲库：{snapshot.catalogSource.label}</Text>
              <Text style={styles.body}>当前版本：{snapshot.best50.currentVersion.title}</Text>
              <Text style={styles.body}>数据源：{session ? '水鱼查分器' : '脱敏测试数据'}</Text>
              <Text style={styles.body}>更新时间：{new Date(snapshot.source.updatedAt).toLocaleString()}</Text>
              {snapshot.best50.unmatchedRecordCount > 0 ? (
                <Text style={styles.warning}>有 {snapshot.best50.unmatchedRecordCount} 条成绩无法匹配谱面版本，未计入 B50。</Text>
              ) : null}
              <Text style={styles.note}>登录后可在设置页切换至水鱼查分器数据源；未登录时使用脱敏 fixture。</Text>
            </View>
          </ScrollView>
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 16, flexGrow: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refresh: { borderWidth: 1, borderColor: '#246BFD', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  refreshText: { color: '#246BFD', fontSize: 13, fontWeight: '600' },
  eyebrow: { color: '#5B6472', fontSize: 13 }, name: { color: '#111827', fontSize: 28, fontWeight: '700' },
  ratingCard: { backgroundColor: '#111827', borderRadius: 18, padding: 22, gap: 6 },
  cardLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },
  rating: { color: '#FFFFFF', fontSize: 42, fontWeight: '800', letterSpacing: 2 }, meta: { color: '#CBD5E1' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, gap: 8 },
  cardTitle: { color: '#111827', fontSize: 18, fontWeight: '700' }, body: { color: '#374151' },
  note: { color: '#6B7280', lineHeight: 20, marginTop: 4 },
  warning: { color: '#B45309', lineHeight: 20 },
});
