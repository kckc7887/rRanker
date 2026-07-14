import { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { QueryStateView } from '@/components/QueryStateView';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { SourceStatus } from '@/components/SourceStatus';
import type { ScoreRecord } from '@/domain/models';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';

interface BestSection {
  key: 'B35' | 'B15';
  title: string;
  data: ScoreRecord[];
}

function byRating(left: ScoreRecord, right: ScoreRecord): number {
  return right.rating - left.rating || right.achievements - left.achievements;
}

export default function Best50Screen() {
  const { data, isLoading, isError, error, refetch } = useScoreSnapshot();
  const tabBottomInset = useNativeTabBottomInset();
  const sections = useMemo<BestSection[]>(() => {
    if (!data) return [];
    return [
      { key: 'B35', title: '过往版本 Best35', data: [...data.best50.b35].sort(byRating) },
      { key: 'B15', title: '当前版本 Best15', data: [...data.best50.b15].sort(byRating) },
    ];
  }, [data]);
  const recordCount = sections.reduce((sum, section) => sum + section.data.length, 0);
  const viewData = recordCount > 0 ? sections : undefined;
  const isEmpty = !!data && recordCount === 0;
  return (
    <View style={styles.page}>
      <QueryStateView<BestSection[]>
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="暂无 B50 数据"
        data={viewData}
        renderData={(list) => (
          <SectionList
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: tabBottomInset + 16 }]}
            scrollIndicatorInsets={{ bottom: tabBottomInset }}
            sections={list}
            stickySectionHeadersEnabled={false}
            keyExtractor={(record) => `${record.songId}-${record.type}-${record.levelIndex}-${record.version}`}
            ListHeaderComponent={<View style={styles.header}><SourceStatus items={data ? [
              { key: 'scores', label: data.source.label, updatedAt: data.source.updatedAt, state: data.source.isStale ? 'cache' : 'live' },
              { key: 'catalog', label: data.catalogSource.label, updatedAt: data.catalogSource.updatedAt, state: data.catalogSource.isStale ? 'cache' : 'live' },
            ] : []} /><Text style={styles.note}>当前版本：{data?.best50.currentVersion.title}；无法匹配的 {data?.best50.unmatchedRecordCount ?? 0} 条成绩未计入。</Text></View>}
            renderSectionHeader={({ section }) => <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length} 张谱面</Text>
            </View>}
            renderItem={({ item, index }) => <ScoreRecordCard record={item} rank={index + 1} />}
          />
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  note: { color: '#6B7280', marginBottom: 6 },
  header: { gap: 9, marginBottom: 2 },
  sectionHeader: { marginTop: 10, marginBottom: 2, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '800' }, sectionCount: { color: '#8A93A3', fontSize: 11 },
});
