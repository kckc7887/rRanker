import { useMemo } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { EmptyDataView } from '@/components/EmptyDataView';
import { LazyTabScreen } from '@/components/LazyTabScreen';
import { QueryStateView } from '@/components/QueryStateView';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { SourceStatus } from '@/components/SourceStatus';
import type { BestListSection } from '@/domain/game-data';
import type { ScoreRecord } from '@/domain/models';
import { useGameData } from '@/hooks/use-game-data';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';

function byRating(left: ScoreRecord, right: ScoreRecord): number {
  return right.rating - left.rating || right.achievements - left.achievements;
}

export default function Best50TabScreen() {
  return <LazyTabScreen><Best50Screen /></LazyTabScreen>;
}

export function Best50Screen() {
  const { data, isLoading, isError, error, refetch } = useGameData();
  const tabBottomInset = useNativeTabBottomInset();
  const sections = useMemo(() => {
    if (!data || data.payload.kind !== 'maimai') return [];
    return data.payload.bestSections.map((section) => ({
      ...section,
      data: [...section.records].sort(byRating),
    }));
  }, [data]);
  const recordCount = sections.reduce((sum, section) => sum + section.data.length, 0);
  const maimai = data?.payload.kind === 'maimai' ? data.payload : null;

  if (!isLoading && data && data.payload.kind !== 'maimai') {
    return <EmptyDataView title="暂无最佳成绩" detail="空空空" />;
  }

  return (
    <View style={styles.page}>
      <QueryStateView<(BestListSection & { data: ScoreRecord[] })[]>
        isLoading={isLoading}
        isError={isError}
        isEmpty={!!maimai && recordCount === 0}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="空空空"
        data={recordCount > 0 ? sections : undefined}
        renderData={(list) => (
          <SectionList
            contentInsetAdjustmentBehavior="automatic"
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: tabBottomInset + 16 }]}
            scrollIndicatorInsets={{ bottom: tabBottomInset }}
            sections={list}
            stickySectionHeadersEnabled={false}
            keyExtractor={(record) => `${record.songId}-${record.type}-${record.levelIndex}-${record.version}`}
            ListHeaderComponent={<View style={styles.header}>
              <Pressable
                accessibilityLabel="生成成绩图片"
                accessibilityRole="button"
                onPress={() => router.push('/best-image' as Href)}
                style={styles.generateButton}
              >
                <Text style={styles.generateButtonText}>生成成绩图片</Text>
              </Pressable>
              <SourceStatus items={maimai ? [
                { key: 'scores', label: maimai.source.label, updatedAt: maimai.source.updatedAt, state: maimai.source.isStale ? 'cache' : 'live' },
                { key: 'catalog', label: maimai.catalogSource.label, updatedAt: maimai.catalogSource.updatedAt, state: maimai.catalogSource.isStale ? 'cache' : 'live' },
              ] : []} />
              <Text style={styles.note}>当前版本：{maimai?.currentVersionTitle}；无法匹配的 {maimai?.unmatchedRecordCount ?? 0} 条成绩未计入。</Text>
            </View>}
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
  generateButton: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#246BFD',
  },
  generateButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  sectionHeader: { marginTop: 10, marginBottom: 2, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '800' }, sectionCount: { color: '#8A93A3', fontSize: 11 },
});
