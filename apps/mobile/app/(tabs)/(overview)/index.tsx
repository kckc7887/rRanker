import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import type { ScoreSnapshot } from '@/domain/models';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useSession } from '@/state/session-store';

export default function OverviewScreen() {
  const { data, isLoading, isError, error, refetch } = useScoreSnapshot();
  const library = useUserLibrary();
  const tabBottomInset = useNativeTabBottomInset();
  const session = useSession((s) => s.session);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const favorites = library.data?.filter((item) => item.kind === 'song' && item.favorite).length ?? 0;
  const practice = library.data?.filter((item) => item.kind === 'chart' && item.practice).length ?? 0;
  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try { await refetch(); }
    finally { refreshingRef.current = false; setRefreshing(false); }
  }, [refetch]);
  return (
    <View style={styles.page}>
      <QueryStateView<ScoreSnapshot>
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        data={data}
        renderData={(snapshot) => (
          <ScrollView
            style={styles.scroll}
            testID="overview-scroll"
            alwaysBounceVertical
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()}
              tintColor="#246BFD" colors={['#246BFD']} />}
            contentContainerStyle={[styles.content, { paddingBottom: tabBottomInset + 20 }]}
            scrollIndicatorInsets={{ bottom: tabBottomInset }}
          >
            <Text style={styles.eyebrow}>玩家概览</Text>
            <Text style={styles.name}>{snapshot.player.displayName}</Text>
            <SourceStatus items={[
              { key: 'scores', label: snapshot.source.label, updatedAt: snapshot.source.updatedAt, state: snapshot.source.isStale ? 'cache' : 'live' },
              { key: 'catalog', label: snapshot.catalogSource.label, updatedAt: snapshot.catalogSource.updatedAt, state: snapshot.catalogSource.isStale ? 'cache' : 'live' },
            ]} />
            <View style={styles.ratingCard}>
              <Text style={styles.cardLabel}>DX RATING</Text>
              <Text style={styles.rating}>{snapshot.best50.rating.toString().padStart(5, '0')}</Text>
              <Text style={styles.meta}>B35 {snapshot.best50.b35.length} · B15 {snapshot.best50.b15.length}</Text>
            </View>
            <Pressable onPress={() => router.push('/tools' as Href)}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>工具箱</Text>
                <Text style={styles.body}>Rating · 达成率/容错 · 牌子进度 · 版本对照</Text>
                <Text style={styles.toolLink}>打开工具箱 →</Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/library' as Href)}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>我的曲库</Text>
                <Text style={styles.body}>{library.isError ? '个人数据暂不可用' : `收藏 ${favorites} 首 · 练习 ${practice} 张`}</Text>
                <Text style={styles.toolLink}>打开收藏与练习清单 →</Text>
              </View>
            </Pressable>
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
  eyebrow: { color: '#5B6472', fontSize: 13 }, name: { color: '#111827', fontSize: 28, fontWeight: '700' },
  ratingCard: { backgroundColor: '#111827', borderRadius: 18, padding: 22, gap: 6 },
  cardLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },
  rating: { color: '#FFFFFF', fontSize: 42, fontWeight: '800', letterSpacing: 2 }, meta: { color: '#CBD5E1' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, gap: 8 },
  cardTitle: { color: '#111827', fontSize: 18, fontWeight: '700' }, body: { color: '#374151' },
  note: { color: '#6B7280', lineHeight: 20, marginTop: 4 },
  warning: { color: '#B45309', lineHeight: 20 },
  toolLink: { color: '#246BFD', fontWeight: '600', marginTop: 5 },
});
