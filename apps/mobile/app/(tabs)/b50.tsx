import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import type { ScoreRecord } from '@/domain/models';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';

type Row = { group: 'B35' | 'B15'; record: ScoreRecord };

export default function Best50Screen() {
  const { data, isLoading, isError, isDataStale, error, refetch } = useScoreSnapshot();
  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    return [
      ...data.best50.b35.map((record) => ({ group: 'B35' as const, record })),
      ...data.best50.b15.map((record) => ({ group: 'B15' as const, record })),
    ];
  }, [data]);
  const viewData = rows.length > 0 ? rows : undefined;
  const isEmpty = !!data && rows.length === 0;
  return (
    <View style={styles.page}>
      <QueryStateView<Row[]>
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        isStale={isDataStale}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="暂无 B50 数据"
        data={viewData}
        renderData={(list) => (
          <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={list}
            keyExtractor={({ group, record }) => `${group}-${record.songId}-${record.levelIndex}`}
            ListHeaderComponent={<View style={styles.header}><SourceStatus items={data ? [
              { key: 'scores', label: data.source.label, updatedAt: data.source.updatedAt, state: data.source.isStale ? 'cache' : 'live' },
              { key: 'catalog', label: data.catalogSource.label, updatedAt: data.catalogSource.updatedAt, state: data.catalogSource.isStale ? 'cache' : 'live' },
            ] : []} /><Text style={styles.note}>当前版本：{data?.best50.currentVersion.title}；无法匹配的 {data?.best50.unmatchedRecordCount ?? 0} 条成绩未计入。</Text></View>}
            renderItem={({ item, index }) => (
              <View style={styles.row}>
                <Text style={styles.rank}>{index + 1}</Text>
                <View style={styles.main}>
                  <Text numberOfLines={1} style={styles.title}>{item.record.title}</Text>
                  <Text style={styles.meta}>{item.group} · {item.record.type} · {item.record.level}</Text>
                </View>
                <Text style={styles.rating}>{item.record.rating}</Text>
              </View>
            )}
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
  row: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { color: '#9CA3AF', width: 24, fontWeight: '700' }, main: { flex: 1, gap: 3 },
  title: { color: '#111827', fontWeight: '600' }, meta: { color: '#6B7280', fontSize: 12 },
  rating: { color: '#246BFD', fontWeight: '800', fontSize: 18 },
});
