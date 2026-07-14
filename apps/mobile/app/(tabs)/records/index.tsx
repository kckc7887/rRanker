import { useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyDataView } from '@/components/EmptyDataView';
import { QueryStateView } from '@/components/QueryStateView';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { SourceStatus } from '@/components/SourceStatus';
import type { ChartType, Difficulty, ScoreRecord } from '@/domain/models';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useRecordsFilter } from '@/state/records-filter';
import { useSession } from '@/state/session-store';

const DIFFICULTIES: (Difficulty | 'all')[] = ['all', 'basic', 'advanced', 'expert', 'master', 'remaster'];
const TYPES: (ChartType | 'all')[] = ['all', 'SD', 'DX'];

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function Chip({ label, active, onPress }: ChipProps) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function RecordsScreen() {
  const activeGameId = useSession((s) => s.activeGameId);
  const { data, isLoading, isError, error, refetch } = useScoreSnapshot();
  const tabBottomInset = useNativeTabBottomInset();
  const {
    difficulty, version, type,
    setDifficulty, setVersion, setType,
  } = useRecordsFilter();

  const versions = useMemo<string[]>(() => {
    if (!data) return [];
    return Array.from(new Set(data.records.map((r) => r.version))).sort();
  }, [data]);

  const filtered = useMemo<ScoreRecord[]>(() => {
    if (!data) return [];
    let list = data.records.slice();
    if (difficulty !== 'all') list = list.filter((r) => r.difficulty === difficulty);
    if (version !== 'all') list = list.filter((r) => r.version === version);
    if (type !== 'all') list = list.filter((r) => r.type === type);
    return list.sort((a, b) => b.rating - a.rating || b.achievements - a.achievements);
  }, [data, difficulty, version, type]);

  const viewData = filtered.length > 0 ? filtered : undefined;
  const isEmpty = !!data && filtered.length === 0;

  if (activeGameId !== 'maimai') {
    return <EmptyDataView title="暂无成绩" detail="空空空" />;
  }

  return (
    <View style={styles.page}>
      <View style={styles.filterBar}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>难度</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {DIFFICULTIES.map((d) => (
              <Chip key={d} label={d === 'all' ? '全部' : d} active={difficulty === d} onPress={() => setDifficulty(d)} />
            ))}
          </ScrollView>
        </View>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>版本</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="全部" active={version === 'all'} onPress={() => setVersion('all')} />
            {versions.map((v) => (
              <Chip key={v} label={v} active={version === v} onPress={() => setVersion(v)} />
            ))}
          </ScrollView>
        </View>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>类型</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {TYPES.map((t) => (
              <Chip key={t} label={t === 'all' ? '全部' : t} active={type === t} onPress={() => setType(t)} />
            ))}
          </ScrollView>
        </View>
      </View>
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
  filterBar: { padding: 16, gap: 8, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 36 },
  chipRow: { gap: 6, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#FFF' },
  chipActive: { backgroundColor: '#246BFD', borderColor: '#246BFD' },
  chipText: { color: '#374151', fontSize: 12 },
  chipTextActive: { color: '#FFF', fontWeight: '600' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  note: { color: '#6B7280', marginBottom: 6 },
  header: { gap: 9 },
});
