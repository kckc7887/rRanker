import { memo, useDeferredValue, useMemo } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View, type ListRenderItem } from 'react-native';
import { EmptyDataView } from '@/components/EmptyDataView';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { MaimaiFilterBar, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { QueryStateView } from '@/components/QueryStateView';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { SourceStatus } from '@/components/SourceStatus';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { matchesConstantRange } from '@/domain/maimai-filters';
import type { DataSource, ScoreRecord } from '@/domain/models';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useRecordsFilter } from '@/state/records-filter';
import { useSession } from '@/state/session-store';
import { buildSearchDocument, buildSongSearchIndex, searchDocumentMatches } from '@/utils/search';
import { useAppTheme } from '@/theme/app-theme';

export default function RecordsTabScreen() {
  return <CachedTabScreen><RecordsScreen /></CachedTabScreen>;
}

export function RecordsScreen() {
  const activeGameId = useSession((s) => s.activeGameId);
  const { data, isLoading, isError, error, refetch } = useScoreSnapshot();
  const catalog = useDetailedCatalog();
  const theme = useAppTheme();
  const tabBottomInset = useNativeTabBottomInset();
  const {
    keyword, collapsed, difficulty, version, type, constantMin, constantMax, versionLocale,
    setKeyword, setCollapsed,
    setDifficulty, setVersion, setType, setConstantMin, setConstantMax, setVersionLocale,
  } = useRecordsFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const searchBySongId = useMemo(() => new Map(buildSongSearchIndex(catalog.data?.songs ?? [])
    .map(({ song, text, compact }) => [song.id, { text, compact }] as const)), [catalog.data?.songs]);

  const versions = useMemo<VersionFilterOption[]>(() => {
    if (!data) return [];
    return Array.from(new Set(data.records.map((record) => record.version))).sort()
      .map((name) => ({ value: name, name }));
  }, [data]);

  const filterSpec = useMemo(() => ({ keyword: debouncedKeyword, difficulty, version, type, constantMin, constantMax }),
    [constantMax, constantMin, debouncedKeyword, difficulty, type, version]);
  const deferredFilterSpec = useDeferredValue(filterSpec);
  const filtered = useMemo<ScoreRecord[]>(() => {
    if (!data) return [];
    let list = data.records.slice();
    if (deferredFilterSpec.keyword.trim()) list = list.filter((record) => searchDocumentMatches(
      searchBySongId.get(record.songId) ?? buildSearchDocument([record.songId, record.title]),
      deferredFilterSpec.keyword,
    ));
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
  }, [data, deferredFilterSpec, searchBySongId]);

  const viewData = data && filtered.length > 0 ? {
    records: filtered,
    source: data.source,
    catalogSource: data.catalogSource,
  } : undefined;
  const isEmpty = !!data && filtered.length === 0;

  if (activeGameId !== 'maimai') {
    return <EmptyDataView title="暂无成绩" detail="当前游戏暂未接入成绩数据" />;
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput accessibilityLabel="成绩搜索" autoCapitalize="none" autoCorrect={false}
          placeholder="曲名 / ID / 别名 / 曲师 / 谱师 / 罗马音" placeholderTextColor={theme.textMuted}
          value={keyword} onChangeText={setKeyword}
          style={[styles.searchBox, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
      </View>
      <MaimaiFilterBar collapsed={collapsed} onCollapsedChange={setCollapsed}
        difficulty={difficulty} version={version} type={type}
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
    {...TAB_LIST_CACHE_PROPS}
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
  searchArea: { padding: 12, paddingBottom: 8 },
  searchBox: { borderWidth: 1, borderRadius: 10, padding: 11 },
});
