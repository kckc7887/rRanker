import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import type { CatalogSnapshot, GameVersion } from '@/domain/models';
import { VERSION_NAME_MAPPINGS } from '@/domain/version-names';
import { calculateVersionStats, type VersionStats } from '@/domain/version-stats';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';

interface VersionSummary { version: GameVersion; stats: VersionStats }

export default function VersionsToolScreen() {
  const catalog = useDetailedCatalog();
  const scores = useScoreSnapshot();
  const summaries = useMemo<VersionSummary[]>(() => {
    if (!catalog.data) return [];
    return [...catalog.data.versions]
      .sort((left, right) => right.id - left.id)
      .map((version) => ({
        version,
        stats: calculateVersionStats(version.id, catalog.data!, scores.data?.records ?? [], scores.data?.best50),
      }));
  }, [catalog.data, scores.data]);

  return <View style={styles.page}><Stack.Screen options={{ title: '版本对照与总结' }} />
    <QueryStateView<CatalogSnapshot> isLoading={catalog.isLoading} isError={catalog.isError}
      isEmpty={false} isStale={!!catalog.data?.source.isStale || !!scores.data?.source.isStale}
      error={catalog.error} onRetry={() => { void catalog.refetch(); void scores.refetch(); }} data={catalog.data}
      renderData={(data) => <ScrollView contentContainerStyle={styles.content}>
        <SourceStatus items={[
          { key: 'catalog', label: data.source.label, updatedAt: data.source.updatedAt, state: data.source.isStale ? 'cache' : 'live' },
          { key: 'scores', label: scores.data?.source.label ?? '成绩不可用，仅展示曲库统计', updatedAt: scores.data?.source.updatedAt, state: !scores.data ? 'unavailable' : scores.data.source.isStale ? 'cache' : 'live' },
        ]} />
        <Text style={styles.heading}>版本名称对照</Text>
        <Card style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}><Text style={styles.china}>国服 / LXNS</Text><Text style={styles.japan}>日服 / 水鱼</Text></View>
          {VERSION_NAME_MAPPINGS.map((item) => <View key={item.versionId} style={styles.tableRow}>
            <Text style={styles.china}>{item.china}</Text><Text style={styles.japan}>{item.japan}</Text>
          </View>)}
        </Card>
        <Text style={styles.heading}>各版本游玩总结</Text>
        {summaries.map(({ version, stats }) => <StatsCard key={version.id} title={version.title} value={stats} />)}
      </ScrollView>} />
  </View>;
}

function StatsCard({ title, value }: { title: string; value: VersionStats }) {
  return <Card style={styles.stats}><Text style={styles.title}>{title}</Text>
    <Text style={styles.line}>谱面 {value.chartCount} · 已游玩 {value.playedCount}</Text>
    <Text style={styles.line}>平均达成率 {value.averageAchievement === null ? '无成绩' : `${value.averageAchievement.toFixed(4)}%`}</Text>
    <Text style={styles.line}>SSS+ {value.sssPlus} · FC {value.fc} · AP {value.ap}</Text>
    <Text style={styles.line}>B50 贡献 {value.b50Contribution}</Text>
  </Card>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 16, gap: 10 },
  heading: { color: '#111827', fontSize: 17, fontWeight: '700', marginTop: 8 },
  table: { padding: 0, overflow: 'hidden' }, tableHeader: { backgroundColor: '#EEF2F7' },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D5DB', paddingHorizontal: 12, paddingVertical: 9, gap: 10 },
  china: { width: '38%', color: '#374151', fontSize: 12, fontWeight: '600' },
  japan: { flex: 1, color: '#374151', fontSize: 12 }, stats: { padding: 14 },
  title: { color: '#111827', fontSize: 16, fontWeight: '700', marginBottom: 7 },
  line: { color: '#4B5563', fontSize: 12, paddingVertical: 2 },
});
