import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import {
  calculateChunithmCollectionProgress,
  CHUNITHM_COLLECTION_KIND_LABELS,
  CHUNITHM_COLLECTION_KINDS,
  isChunithmCollectionComputable,
  type ChunithmCollection,
  type ChunithmCollectionKind,
} from '@/domain/chunithm-collections';
import { useChunithmCollections } from '@/hooks/use-chunithm-collections';
import { useGameData } from '@/hooks/use-game-data';
import { useAppTheme } from '@/theme/app-theme';

function Chevron({ expanded }: { expanded: boolean }) {
  const theme = useAppTheme();
  return <Text style={[styles.chevron, { color: theme.textMuted }]}>{expanded ? '▲' : '▼'}</Text>;
}

function progressPercent(completed: number, total: number): number {
  return total ? Math.min(100, (completed / total) * 100) : 0;
}

function CollectionProgressCard({ collection, scores }: { collection: ChunithmCollection; scores: unknown[] }) {
  const theme = useAppTheme();
  const progress = calculateChunithmCollectionProgress(collection, scores as Parameters<typeof calculateChunithmCollectionProgress>[1]);
  const percent = progressPercent(progress.completed, progress.total);

  return (
    <Card style={styles.progressCard}>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressTitle, { color: theme.text }]}>
          {collection.name || `#${collection.id}`}
        </Text>
        <Text style={[styles.progressPct, { color: theme.accent }]}>{percent.toFixed(1)}%</Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
        <View style={[styles.barFill, { width: `${percent}%`, backgroundColor: theme.accent }]} />
      </View>
      <View style={styles.progressMetaRow}>
        <Text style={[styles.progressMeta, { color: theme.textSecondary }]}>本地成绩计算</Text>
        <Text style={[styles.progressCount, { color: theme.textSecondary }]}>
          {progress.completed} / {progress.total}
        </Text>
      </View>
      {collection.description ? (
        <Text style={[styles.description, { color: theme.textMuted }]} numberOfLines={2}>
          {collection.description}
        </Text>
      ) : null}
      {collection.color ? (
        <Text style={[styles.badge, { color: theme.textSecondary }]}>颜色 {collection.color}</Text>
      ) : null}
    </Card>
  );
}

const DIFFICULTY_LABELS = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'ULTIMA', "WORLD'S END"] as const;

export default function ChunithmCollectionsToolScreen() {
  const theme = useAppTheme();
  const [kind, setKind] = useState<ChunithmCollectionKind>('trophy');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data, isLoading, isError, error, refetch } = useChunithmCollections(kind);
  const gameData = useGameData();
  const scores = useMemo(
    () => (gameData.data?.payload.kind === 'chunithm' ? gameData.data.payload.scores : []),
    [gameData.data],
  );

  const items = useMemo(() => {
    if (!data) return [];
    const computable = data.items.filter(isChunithmCollectionComputable);
    const q = query.trim().toLowerCase();
    if (!q) return computable;
    return computable.filter((item) => (
      item.name.toLowerCase().includes(q)
      || (item.description ?? '').toLowerCase().includes(q)
    ));
  }, [data, query]);

  const selected = data?.items.find((item) => item.id === selectedId) ?? null;
  const selectedComputable = selected ? isChunithmCollectionComputable(selected) : false;
  const progress = useMemo(
    () => (selected && selectedComputable ? calculateChunithmCollectionProgress(selected, scores) : null),
    [selected, selectedComputable, scores],
  );
  const missingRows = progress?.missingSongs ?? [];

  const pickItem = (item: ChunithmCollection) => {
    setSelectedId(item.id);
    setPickerOpen(false);
    setQuery('');
  };

  const switchKind = (candidate: ChunithmCollectionKind) => {
    setKind(candidate);
    setSelectedId(null);
    setPickerOpen(false);
    setQuery('');
  };

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '收藏品进度' }} />
      <QueryStateView
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && !isError && (data?.items.length ?? 0) === 0}
        error={error}
        onRetry={() => { void refetch(); }}
        data={data}
        renderData={(snapshot) => (
          <View style={styles.body}>
            <View style={styles.header}>
              <SourceStatus items={[
                {
                  key: 'collections',
                  label: snapshot.source.label,
                  updatedAt: snapshot.source.updatedAt,
                  state: snapshot.source.isStale ? 'cache' : 'live',
                },
                {
                  key: 'scores',
                  label: gameData.data?.payload.kind === 'chunithm'
                    ? gameData.data.payload.source.label
                    : '成绩不可用',
                  updatedAt: gameData.data?.payload.kind === 'chunithm'
                    ? gameData.data.payload.source.updatedAt
                    : undefined,
                  state: gameData.data?.payload.kind === 'chunithm'
                    ? (gameData.data.payload.source.isStale ? 'cache' : 'live')
                    : 'unavailable',
                },
              ]} />

              <View style={styles.kindBar}>
                {CHUNITHM_COLLECTION_KINDS.map((candidate) => (
                  <Pressable
                    key={candidate}
                    accessibilityRole="button"
                    accessibilityLabel={`收藏品类型 ${CHUNITHM_COLLECTION_KIND_LABELS[candidate]}`}
                    accessibilityState={{ selected: kind === candidate }}
                    onPress={() => switchKind(candidate)}
                    style={[styles.kindChip, {
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                    }, kind === candidate && {
                      borderColor: theme.accent,
                      backgroundColor: theme.accentSoft,
                    }]}
                  >
                    <Text style={[styles.kindChipText, {
                      color: theme.textSecondary,
                    }, kind === candidate && { color: theme.accent }]}>
                      {CHUNITHM_COLLECTION_KIND_LABELS[candidate]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Card style={styles.pickerCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: pickerOpen }}
                  accessibilityLabel={selected ? `当前收藏品 ${selected.name}` : '选择收藏品'}
                  onPress={() => setPickerOpen((open) => !open)}
                  style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
                >
                  <View style={styles.triggerCopy}>
                    <Text style={[styles.triggerLabel, { color: theme.textMuted }]}>当前收藏品</Text>
                    <Text style={[styles.triggerName, { color: theme.text }]}>
                      {selected?.name ?? '请选择'}
                    </Text>
                  </View>
                  <Chevron expanded={pickerOpen} />
                </Pressable>

                {pickerOpen ? (
                  <View style={[styles.pickerBody, { borderTopColor: theme.border, backgroundColor: theme.surfaceMuted }]}>
                    <TextInput
                      accessibilityLabel="搜索收藏品名称或描述"
                      autoCorrect={false}
                      value={query}
                      onChangeText={setQuery}
                      placeholder="搜索名称或描述"
                      placeholderTextColor={theme.textMuted}
                      style={[styles.search, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                    />
                    <FlatList
                      data={items}
                      keyExtractor={(item) => `${kind}:${item.id}`}
                      style={styles.pickerList}
                      testID="chunithm-collection-picker-list"
                      keyboardShouldPersistTaps="handled"
                      ListEmptyComponent={(
                        <Text style={[styles.pickerEmpty, { color: theme.textMuted }]}>
                          {query.trim() ? '没有匹配的收藏品' : '该类暂无有条件的收藏品'}
                        </Text>
                      )}
                      renderItem={({ item }) => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`选择 ${item.name || `#${item.id}`}`}
                          accessibilityState={{ selected: selectedId === item.id }}
                          onPress={() => pickItem(item)}
                          style={({ pressed }) => [
                            styles.pickerItem,
                            { backgroundColor: theme.surface, borderColor: theme.border },
                            selectedId === item.id && { borderColor: theme.accent, backgroundColor: theme.accentSoft },
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={[styles.pickerItemName, { color: theme.text }]} numberOfLines={1}>
                            {item.name || `#${item.id}`}
                          </Text>
                        </Pressable>
                      )}
                    />
                  </View>
                ) : null}
              </Card>

              {selected ? (
                <CollectionProgressCard collection={selected} scores={scores} />
              ) : null}

              {selected ? (
                <Text style={[styles.heading, { color: theme.text }]}>
                  缺失曲目
                  {progress?.missingSongs.length ? ` · ${progress.missingSongs.length}` : ''}
                </Text>
              ) : null}
            </View>

            <FlatList
              data={missingRows}
              keyExtractor={(item) => item.songId}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                selected ? (
                  <Card style={styles.emptyCard}>
                    <Text style={[styles.done, { color: theme.success }]}>
                      {progress?.total ? '全部完成' : '该收藏品没有曲目要求'}
                    </Text>
                  </Card>
                ) : null
              }
              renderItem={({ item }) => (
                <View style={[styles.song, { backgroundColor: theme.surface }]}>
                  <View style={styles.songCopy}>
                    <Text style={[styles.songId, { color: theme.textMuted }]}>#{item.songId}</Text>
                    <Text style={[styles.songTitle, { color: theme.text }]} numberOfLines={1}>
                      歌曲 {item.songId}
                    </Text>
                    <View style={styles.songMetaRow}>
                      {item.missingDifficulties.map((difficulty) => (
                        <Text
                          key={difficulty}
                          style={[styles.songMeta, { color: theme.textMuted }]}
                        >
                          {difficulty < 0 ? '任意难度' : (DIFFICULTY_LABELS[difficulty] ?? `难度${difficulty}`)}
                        </Text>
                      ))}
                    </View>
                  </View>
                </View>
              )}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  body: { flex: 1 },
  header: { padding: 16, paddingBottom: 8, gap: 12 },
  kindBar: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  kindChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  kindChipText: { color: '#374151', fontSize: 13, fontWeight: '700' },
  pickerCard: { padding: 0, overflow: 'hidden' },
  trigger: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  triggerCopy: { flex: 1, gap: 3, minWidth: 0 },
  triggerLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  triggerName: { color: '#111827', fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  chevron: { fontSize: 10, fontWeight: '700' },
  pickerBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
    backgroundColor: '#FAFBFC',
  },
  search: {
    backgroundColor: '#FFF',
    borderColor: '#D1D5DB',
    borderWidth: 1,
    borderRadius: 9,
    padding: 10,
    color: '#111827',
  },
  pickerList: { maxHeight: 260 },
  pickerItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  pickerItemName: { color: '#111827', fontSize: 14, fontWeight: '600' },
  pickerEmpty: { color: '#6B7280', fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  progressCard: { gap: 8 },
  progressHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  progressTitle: { color: '#111827', fontSize: 18, fontWeight: '800', flex: 1 },
  progressPct: { color: '#246BFD', fontSize: 22, fontWeight: '800' },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#246BFD',
  },
  progressMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  progressMeta: { color: '#4B5563', fontSize: 12, fontWeight: '600' },
  progressCount: { color: '#4B5563', fontSize: 12, fontWeight: '600' },
  description: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
  badge: { color: '#4B5563', fontSize: 11, fontWeight: '700' },
  heading: { color: '#111827', fontSize: 17, fontWeight: '700', marginTop: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  emptyCard: { alignItems: 'center', paddingVertical: 18 },
  done: { color: '#166534', fontWeight: '700' },
  song: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  songCopy: { gap: 4 },
  songId: { color: '#9CA3AF', fontSize: 11, fontWeight: '600' },
  songTitle: { color: '#111827', fontSize: 15, fontWeight: '600' },
  songMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  songMeta: { color: '#6B7280', fontSize: 11 },
  pressed: { opacity: 0.86 },
});
