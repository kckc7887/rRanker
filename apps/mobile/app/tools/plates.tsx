import { useMemo, useState } from 'react';
import { router, Stack, type Href } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import { calculatePlateProgress } from '@/domain/plates';
import type { Plate } from '@/domain/models';
import { usePlates } from '@/hooks/use-plates';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';

export default function PlatesToolScreen() {
  const plates = usePlates(); const scores = useScoreSnapshot(); const [selectedId, setSelectedId] = useState<number>();
  const plateSnapshot = plates.data;
  const plateItems = (plateSnapshot?.plates ?? []).filter((plate) => plate.requirements.length > 0);
  const selected = plateItems.find((item) => item.id === selectedId) ?? plateItems[0];
  const progress = useMemo(() => selected ? calculatePlateProgress(selected, scores.data?.records ?? []) : null, [scores.data?.records, selected]);
  const viewData = plateSnapshot && plateItems.length ? { items: plateItems, source: plateSnapshot.source } : undefined;
  return <View style={styles.page}><Stack.Screen options={{ title: '牌子进度' }} /><QueryStateView<{ items: Plate[]; source: import('@/domain/models').DataSource }> isLoading={plates.isLoading || scores.isLoading}
    isError={plates.isError || scores.isError} isEmpty={!!plateSnapshot && plateItems.length === 0}
    isStale={!!plateSnapshot?.source.isStale || !!scores.data?.source.isStale} error={plates.error ?? scores.error}
    onRetry={() => { void plates.refetch(); void scores.refetch(); }} data={viewData}
    renderData={({ items, source }) => <FlatList data={progress?.missingSongIds ?? []} keyExtractor={(item) => item} contentContainerStyle={styles.content}
      ListHeaderComponent={<><SourceStatus items={[
        { key: 'plates', label: source.label, updatedAt: source.updatedAt, state: source.isStale ? 'cache' : 'live' },
        { key: 'scores', label: scores.data?.source.label ?? '成绩不可用', updatedAt: scores.data?.source.updatedAt, state: !scores.data ? 'unavailable' : scores.data.source.isStale ? 'cache' : 'live' },
      ]} /><Text style={styles.heading}>选择有成绩要求的姓名框</Text><View style={styles.chips}>{items.map((item) => <Pressable key={item.id} onPress={() => setSelectedId(item.id)} style={[styles.chip, item.id === selected?.id && styles.active]}><Text style={item.id === selected?.id ? styles.activeText : styles.chipText}>{item.name}</Text></Pressable>)}</View>
      {selected && progress ? <Card><Text style={styles.title}>{selected.name}</Text><Text style={styles.progress}>{progress.completed} / {progress.total}（{progress.total ? (progress.completed / progress.total * 100).toFixed(1) : '0.0'}%）</Text>
        {Object.entries(progress.byDifficulty).map(([difficulty, item]) => <Text key={difficulty} style={styles.meta}>{difficulty === '-1' ? '任意难度' : `难度 ${Number(difficulty) + 1}`}：{item.completed}/{item.total}</Text>)}</Card> : null}
      <Text style={styles.heading}>缺失曲目</Text></>}
      ListEmptyComponent={<Text style={styles.done}>{progress?.total ? '全部完成' : '该姓名框没有歌曲要求'}</Text>}
      renderItem={({ item }) => <Pressable style={styles.song} onPress={() => router.push(`/songs/${encodeURIComponent(item)}` as Href)}><Text style={styles.songText}>歌曲 {item}</Text><Text style={styles.link}>查看详情 →</Text></Pressable>} />}/></View>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 16, gap: 9 }, heading: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { backgroundColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 }, active: { backgroundColor: '#246BFD' }, chipText: { color: '#374151', fontSize: 11 }, activeText: { color: '#FFF', fontSize: 11 }, title: { fontSize: 18, fontWeight: '700', color: '#111827' }, progress: { fontSize: 23, fontWeight: '800', color: '#246BFD', marginVertical: 7 }, meta: { color: '#6B7280' }, song: { backgroundColor: '#FFF', padding: 13, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between' }, songText: { color: '#374151' }, link: { color: '#246BFD' }, done: { color: '#166534', textAlign: 'center', padding: 20 } });
