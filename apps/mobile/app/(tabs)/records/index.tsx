import { memo, useDeferredValue, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { EmptyDataView } from '@/components/EmptyDataView';
import { FocusedTabScreen } from '@/components/FocusedTabScreen';
import { MaimaiFilterBar, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { QueryStateView } from '@/components/QueryStateView';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { SourceStatus } from '@/components/SourceStatus';
import { matchesConstantRange } from '@/domain/maimai-filters';
import type { DataSource, ScoreRecord } from '@/domain/models';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useRecordsFilter } from '@/state/records-filter';
import { useSession } from '@/state/session-store';

export default function RecordsTabScreen() {
  return <FocusedTabScreen><RecordsScreen /></FocusedTabScreen>;
}

export function RecordsScreen() {
  const activeGameId = useSession((s) => s.activeGameId);
  const { data, isLoading, isError, error, refetch } = useScoreSnapshot();
  const tabBottomInset = useNativeTabBottomInset();
  const {
    difficulty, version, type, constantMin, constantMax, versionLocale,
    setDifficulty, setVersion, setType, setConstantMin, setConstantMax, setVersionLocale,
  } = useRecordsFilter();

  const versions = useMemo<VersionFilterOption[]>(() => {
    if (!data) return [];
    return Array.from(new Set(data.records.map((record) => record.version))).sort()
      .map((name) => ({ value: name, name }));
  }, [data]);

  const filterSpec = useMemo(() => ({ difficulty, version, type, constantMin, constantMax }),
    [constantMax, constantMin, difficulty, type, version]);
  const deferredFilterSpec = useDeferredValue(filterSpec);
  const filtered = useMemo<ScoreRecord[]>(() => {
    if (!data) return [];
    let list = data.records.slice();
    if (deferredFilterSpec.difficulty !== 'all') {
      list = list.filter((record) => record.difficulty === deferredFilterSpec.difficulty);
    }
    if (deferredFilterSpec.version !== 'all') {
      list = list.filter((record) => record.version === deferredFilterSpec.version);
    }
    if (deferredFilterSpec.type !== 'all') {
      list = list.filter((record) => record.type === deferredFilterSpec.type);
    }
    list = list.filter((record) => matchesConstantRange(
      record.difficultyConstant, deferredFilterSpec.constantMin, deferredFilterSpec.constantMax,
    ));
    return list.sort((a, b) => b.rating - a.rating || b.achievements - a.achievements);
  }, [data, deferredFilterSpec]);

  const viewData = data && filtered.length > 0 ? {
    records: filtered,
    source: data.source,
    catalogSource: data.catalogSource,
  } : undefined;
  const isEmpty = !!data && filtered.length === 0;

  if (activeGameId !== 'maimai') {
    return <EmptyDataView title="暂无成绩" detail="空空空" />;
  }

  return (
    <View style={styles.page}>
      <MaimaiFilterBar difficulty={difficulty} version={version} type={type}
        constantMin={constantMin} constantMax={constantMax} versionLocale={versionLocale} versions={versions}
        onDifficultyChange={setDifficulty} onVersionChange={setVersion} onTypeChange={setType}
        onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
        onVersionLocaleChange={setVersionLocale} />
      <QueryStateView<{ records: ScoreRecord[]; source: DataSource; catalogSource: DataSource }>
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="当前筛选条件下没有成绩"
        data={viewData}
        renderData={(result) => (
          <RecordResultsList records={result.records} source={result.source} catalogSource={result.catalogSource}
            tabBottomInset={tabBottomInset} />
        )}
      />
    </View>
  );
}

const RecordResultsList = memo(function RecordResultsList({
  records,
  source,
  catalogSource,
  tabBottomInset,
}: {
  records: ScoreRecord[];
  source: DataSource;
  catalogSource: DataSource;
  tabBottomInset: number;
}) {
  const header = useMemo(() => <View style={styles.header}><SourceStatus items={[
    { key: 'scores', label: source.label, updatedAt: source.updatedAt, state: source.isStale ? 'cache' : 'live' },
    { key: 'catalog', label: catalogSource.label, updatedAt: catalogSource.updatedAt, state: catalogSource.isStale ? 'cache' : 'live' },
  ]} /><Text style={styles.note}>共 {records.length} 条成绩</Text></View>,
  [catalogSource, records.length, source]);

  return <FlatList testID="records-results-list" contentInsetAdjustmentBehavior="automatic" style={styles.list}
    contentContainerStyle={[styles.listContent, { paddingBottom: tabBottomInset + 16 }]}
    scrollIndicatorInsets={{ bottom: tabBottomInset }} data={records} keyExtractor={recordKey}
    initialNumToRender={8} maxToRenderPerBatch={8} updateCellsBatchingPeriod={40} windowSize={5}
    ListHeaderComponent={header} renderItem={renderRecord} />;
});

const renderRecord: ListRenderItem<ScoreRecord> = ({ item }) => <ScoreRecordCard record={item} />;
function recordKey(record: ScoreRecord): string {
  return `${record.songId}-${record.type}-${record.levelIndex}`;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  note: { color: '#6B7280', marginBottom: 6 },
  header: { gap: 9 },
});
