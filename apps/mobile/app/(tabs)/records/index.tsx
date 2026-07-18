import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { EmptyDataView } from '@/components/EmptyDataView';
import { MaimaiFilterBar, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { QueryStateView } from '@/components/QueryStateView';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { SourceStatus } from '@/components/SourceStatus';
import { matchesConstantRange } from '@/domain/maimai-filters';
import type { ScoreRecord } from '@/domain/models';
import type { VersionNameLocale } from '@/domain/version-names';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useRecordsFilter } from '@/state/records-filter';
import { useSession } from '@/state/session-store';

export default function RecordsScreen() {
  const activeGameId = useSession((s) => s.activeGameId);
  const { data, isLoading, isError, error, refetch } = useScoreSnapshot();
  const tabBottomInset = useNativeTabBottomInset();
  const [versionLocale, setVersionLocale] = useState<VersionNameLocale>('china');
  const {
    difficulty, version, type, constantMin, constantMax,
    setDifficulty, setVersion, setType, setConstantMin, setConstantMax,
  } = useRecordsFilter();

  const versions = useMemo<VersionFilterOption[]>(() => {
    if (!data) return [];
    return Array.from(new Set(data.records.map((record) => record.version))).sort()
      .map((name) => ({ value: name, name }));
  }, [data]);

  const filtered = useMemo<ScoreRecord[]>(() => {
    if (!data) return [];
    let list = data.records.slice();
    if (difficulty !== 'all') list = list.filter((r) => r.difficulty === difficulty);
    if (version !== 'all') list = list.filter((r) => r.version === version);
    if (type !== 'all') list = list.filter((r) => r.type === type);
    list = list.filter((record) => matchesConstantRange(record.difficultyConstant, constantMin, constantMax));
    return list.sort((a, b) => b.rating - a.rating || b.achievements - a.achievements);
  }, [constantMax, constantMin, data, difficulty, type, version]);

  const viewData = filtered.length > 0 ? filtered : undefined;
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
      <QueryStateView<ScoreRecord[]>
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="当前筛选条件下没有成绩"
        data={viewData}
        renderData={(list) => (
          <FlatList
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: tabBottomInset + 16 }]}
            scrollIndicatorInsets={{ bottom: tabBottomInset }}
            data={list}
            keyExtractor={(record) => `${record.songId}-${record.type}-${record.levelIndex}`}
            ListHeaderComponent={<View style={styles.header}><SourceStatus items={data ? [
              { key: 'scores', label: data.source.label, updatedAt: data.source.updatedAt, state: data.source.isStale ? 'cache' : 'live' },
              { key: 'catalog', label: data.catalogSource.label, updatedAt: data.catalogSource.updatedAt, state: data.catalogSource.isStale ? 'cache' : 'live' },
            ] : []} /><Text style={styles.note}>共 {list.length} 条成绩</Text></View>}
            renderItem={({ item }) => <ScoreRecordCard record={item} />}
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
  header: { gap: 9 },
});
