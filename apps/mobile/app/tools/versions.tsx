import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, type Href } from 'expo-router';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import { VersionLogo } from '@/components/VersionLogo';
import type { CatalogSnapshot, GameVersion } from '@/domain/models';
import { versionLogoSource } from '@/domain/version-logo-assets';
import { VERSION_NAME_MAPPINGS } from '@/domain/version-names';
import { calculateVersionStats, type VersionStats } from '@/domain/version-stats';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useRecordsFilter } from '@/state/records-filter';
import { useCatalogFilter } from '@/state/catalog-filter';
import { useAppTheme } from '@/theme/app-theme';

interface VersionSummary { version: GameVersion; stats: VersionStats }

export default function VersionsToolScreen() {
  const catalog = useDetailedCatalog();
  const scores = useScoreSnapshot();
  const theme = useAppTheme();
  const summaries = useMemo<VersionSummary[]>(() => {
    if (!catalog.data) return [];
    return [...catalog.data.versions]
      .sort((left, right) => right.id - left.id)
      .map((version) => ({
        version,
        stats: calculateVersionStats(version.id, catalog.data!, scores.data?.records ?? [], scores.data?.best50),
      }));
  }, [catalog.data, scores.data]);

  return <View style={[styles.page, { backgroundColor: theme.background }]}><Stack.Screen options={{ title: '版本对照与总结' }} />
    <QueryStateView<CatalogSnapshot> isLoading={catalog.isLoading} isError={catalog.isError}
      isEmpty={false}
      error={catalog.error} onRetry={() => { void catalog.refetch(); void scores.refetch(); }} data={catalog.data}
      renderData={(data) => <ScrollView contentContainerStyle={styles.content}>
        <SourceStatus items={[
          { key: 'catalog', label: data.source.label, updatedAt: data.source.updatedAt, state: data.source.isStale ? 'cache' : 'live' },
          { key: 'scores', label: scores.data?.source?.label ?? '成绩不可用，仅展示曲库统计', updatedAt: scores.data?.source?.updatedAt, state: !scores.data ? 'unavailable' : scores.data.source?.isStale ? 'cache' : 'live' },
        ]} />
        <Text style={[styles.heading, { color: theme.text }]}>版本名称对照</Text>
        <Card style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: theme.surfaceMuted, borderBottomColor: theme.border }]}>
            <Text style={[styles.chinaHeader, { color: theme.textSecondary }]}>国服</Text>
            <Text style={[styles.japanHeader, { color: theme.textSecondary }]}>日服</Text>
            <Text style={[styles.codeHeader, { color: theme.textSecondary }]}>版本代号</Text>
          </View>
          {VERSION_NAME_MAPPINGS.map((item) => (
            <View key={item.versionId} style={[styles.tableRow, { borderBottomColor: theme.border }]}>
              <View style={styles.chinaCell}>
                <VersionLogo
                  accessibilityLabel={`${item.china} 国服 Logo`}
                  source={versionLogoSource(item.versionId, 'china')}
                />
                <Text style={[styles.name, { color: theme.text }]}>{item.china}</Text>
              </View>
              <View style={styles.japanCell}>
                <VersionLogo
                  accessibilityLabel={`${item.japan} 日服 Logo`}
                  source={versionLogoSource(item.versionId, 'japan')}
                />
                <Text style={[styles.name, { color: theme.text }]}>{item.japan}</Text>
              </View>
              <View
                accessibilityLabel={`${item.china} 版本代号 ${item.code}`}
                style={styles.codeCell}
              >
                <Text style={[styles.code, { color: theme.textSecondary }]}>{item.code}</Text>
              </View>
            </View>
          ))}
        </Card>
        <Text style={[styles.heading, { color: theme.text }]}>各版本游玩总结</Text>
        {summaries.map(({ version, stats }) => <StatsCard key={version.id} version={version} value={stats} />)}
      </ScrollView>} />
  </View>;
}

function StatsCard({ version, value }: { version: GameVersion; value: VersionStats }) {
  const theme = useAppTheme();
  const openRecords = () => {
    useRecordsFilter.getState().reset();
    useRecordsFilter.getState().setVersion(version.title);
    router.dismissTo('/(tabs)/records' as Href);
  };
  const openCatalog = () => {
    useCatalogFilter.getState().reset();
    useCatalogFilter.getState().setVersion(String(version.id));
    router.dismissTo('/(tabs)/search' as Href);
  };
  return <Card style={styles.stats}><Text style={[styles.title, { color: theme.text }]}>{version.title}</Text>
    <Text style={[styles.line, { color: theme.textSecondary }]}>谱面 {value.chartCount} · 已游玩 {value.playedCount}</Text>
    <Text style={[styles.line, { color: theme.textSecondary }]}>平均达成率 {value.averageAchievement === null ? '无成绩' : `${value.averageAchievement.toFixed(4)}%`}</Text>
    <Text style={[styles.line, { color: theme.textSecondary }]}>SSS+ {value.sssPlus} · FC {value.fc} · AP {value.ap}</Text>
    <Text style={[styles.line, { color: theme.textSecondary }]}>B50 贡献 {value.b50Contribution}</Text>
    <View style={styles.statsActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`查看 ${version.title} 成绩`} onPress={openRecords} style={[styles.statsAction, { backgroundColor: theme.accentSoft }]}>
        <Text style={[styles.statsActionText, { color: theme.accent }]}>成绩 →</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`查看 ${version.title} 曲库`} onPress={openCatalog} style={[styles.statsAction, { backgroundColor: theme.accentSoft }]}>
        <Text style={[styles.statsActionText, { color: theme.accent }]}>曲库 →</Text>
      </Pressable>
    </View>
  </Card>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 16, gap: 10 },
  heading: { color: '#111827', fontSize: 17, fontWeight: '700', marginTop: 8 },
  table: { padding: 0, overflow: 'hidden' },
  tableHeader: { backgroundColor: '#EEF2F7', alignItems: 'center' },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D1D5DB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  chinaHeader: { width: '30%', color: '#374151', fontSize: 12, fontWeight: '700' },
  japanHeader: { flex: 1, color: '#374151', fontSize: 12, fontWeight: '700' },
  codeHeader: { width: '18%', color: '#374151', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  chinaCell: { width: '30%', gap: 6 },
  japanCell: { flex: 1, gap: 6 },
  codeCell: { width: '18%', alignItems: 'center', justifyContent: 'center' },
  code: { color: '#111827', fontSize: 18, fontWeight: '800' },
  name: { color: '#374151', fontSize: 12, fontWeight: '600' },
  stats: { padding: 14 },
  title: { color: '#111827', fontSize: 16, fontWeight: '700', marginBottom: 7 },
  line: { color: '#4B5563', fontSize: 12, paddingVertical: 2 },
  statsActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  statsAction: { flex: 1, minHeight: 38, borderRadius: 10, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
  statsActionText: { color: '#246BFD', fontWeight: '800', fontSize: 13 },
});
