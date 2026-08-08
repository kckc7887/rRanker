import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import {
  CHUNITHM_COLLECTION_KIND_LABELS,
  CHUNITHM_COLLECTION_KINDS,
  isChunithmCollectionComputable,
  summarizeChunithmCollectionProgress,
  type ChunithmCollection,
  type ChunithmCollectionKind,
  type ChunithmCollectionRequired,
  type ChunithmCollectionRequiredSong,
} from '@/domain/chunithm-collections';
import { useChunithmCollectionProgress, useChunithmCollections } from '@/hooks/use-chunithm-collections';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

const DIFFICULTY_LABELS = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'ULTIMA', "WORLD'S END"] as const;

function Chevron({ expanded }: { expanded: boolean }) {
  const theme = useAppTheme();
  return <Text style={[styles.chevron, { color: theme.textMuted }]}>{expanded ? '▲' : '▼'}</Text>;
}

function progressPercent(completed: number, total: number): number {
  return total ? Math.min(100, (completed / total) * 100) : 0;
}

type CollectionSongRow = {
  key: string;
  song: ChunithmCollectionRequiredSong;
  group: ChunithmCollectionRequired;
  groupIndex: number;
};

function collectionSongRows(collection: ChunithmCollection): CollectionSongRow[] {
  return (collection.required ?? []).flatMap((group, groupIndex) => (
    group.songs.map((song) => ({ key: `${groupIndex}:${song.id}`, song, group, groupIndex }))
  ));
}

function CollectionProgressCard({ collection }: { collection: ChunithmCollection }) {
  const theme = useAppTheme();
  const summary = summarizeChunithmCollectionProgress(collection.required);
  const percent = progressPercent(summary.completedSongs, summary.songRequirements);
  const computable = isChunithmCollectionComputable(collection);

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
        <Text style={[styles.progressMeta, { color: theme.textSecondary }]}>
          {computable
            ? `条件组 ${summary.completedGroups}/${summary.groups}`
            : '无可计算条件'}
        </Text>
        <Text style={[styles.progressCount, { color: theme.textSecondary }]}>
          {summary.completedSongs} / {summary.songRequirements}
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

export default function ChunithmCollectionsToolScreen() {
  const theme = useAppTheme();
  const session = useSession((state) => state.session);
  const [kind, setKind] = useState<ChunithmCollectionKind>('trophy');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data, isLoading, isError, error, refetch } = useChunithmCollections(kind);

  const items = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.items;
    return data.items.filter((item) => (
      item.name.toLowerCase().includes(q)
      || (item.description ?? '').toLowerCase().includes(q)
    ));
  }, [data, query]);

  const selected = data?.items.find((item) => item.id === selectedId) ?? null;
  const progressQuery = useChunithmCollectionProgress(kind, selectedId);
  const progressCollection = progressQuery.data?.collection.required
    ? progressQuery.data.collection
    : selected;
  const rows = useMemo(
    () => (selected ? collectionSongRows(selected) : []),
    [selected],
  );
  const liveRows = useMemo(
    () => (progressCollection ? collectionSongRows(progressCollection) : []),
    [progressCollection],
  );
  const needsLogin = session?.mode !== 'lxns-oauth';

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
                          {isChunithmCollectionComputable(item) ? (
                            <Text style={[styles.computable, { color: theme.accent }]}>有条件</Text>
                          ) : null}
                        </Pressable>
                      )}
                    />
                  </View>
                ) : null}
              </Card>

              {selected ? <CollectionProgressCard collection={progressCollection ?? selected} /> : null}

              <Text style={[styles.hint, { color: theme.textMuted }]}>
                {needsLogin
                  ? '未绑定落雪账号：可浏览列表，绑定后选择收藏品查看逐件达成进度。'
                  : progressQuery.isLoading
                    ? '正在读取达成进度…'
                    : progressQuery.isError
                      ? '无法读取进度，请稍后重试。'
                      : '已连接落雪账号：选择收藏品可查看达成条件与完成状态。'}
              </Text>

              {selected ? (
                <Text style={[styles.heading, { color: theme.text }]}>
                  曲目要求
                  {liveRows.length ? ` · ${liveRows.length}` : ''}
                </Text>
              ) : null}
            </View>

            <FlatList
              data={liveRows}
              keyExtractor={(item) => item.key}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                selected ? (
                  <Card style={styles.emptyCard}>
                    <Text style={[styles.done, { color: theme.success }]}>
                      {rows.length === 0 ? '该收藏品没有曲目要求' : '全部完成'}
                    </Text>
                  </Card>
                ) : null
              }
              renderItem={({ item }) => (
                <View style={[styles.song, { backgroundColor: theme.surface }]}>
                  <View style={styles.songCopy}>
                    <Text style={[styles.songTitle, { color: theme.text }]} numberOfLines={1}>
                      {item.song.title || `#${item.song.id}`}
                    </Text>
                    <View style={styles.songMetaRow}>
                      <Text style={[styles.songMeta, { color: theme.textMuted }]}>条件组 {item.groupIndex + 1}</Text>
                      {item.group.difficulties.length > 0 ? (
                        <Text style={[styles.songMeta, { color: theme.textMuted }]}>
                          难度 {item.group.difficulties.map((d) => DIFFICULTY_LABELS[d] ?? d).join('/')}
                        </Text>
                      ) : null}
                      {item.group.rank ? (
                        <Text style={[styles.songMeta, { color: theme.textMuted }]}>评级 {item.group.rank.toUpperCase()}</Text>
                      ) : null}
                      {item.group.fullCombo ? (
                        <Text style={[styles.songMeta, { color: theme.textMuted }]}>全连 {item.group.fullCombo.toUpperCase()}</Text>
                      ) : null}
                      {item.group.fullChain ? (
                        <Text style={[styles.songMeta, { color: theme.textMuted }]}>全链 {item.group.fullChain.toUpperCase()}</Text>
                      ) : null}
                    </View>
                  </View>
                  <Text style={[styles.songState, { color: item.song.completed ? theme.accent : theme.textMuted }]}>
                    {item.song.completed ? '已完成' : '未完成'}
                  </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  pickerItemName: { color: '#111827', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  computable: { color: '#246BFD', fontSize: 11, fontWeight: '700', flexShrink: 0 },
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
  hint: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
  heading: { color: '#111827', fontSize: 17, fontWeight: '700', marginTop: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  emptyCard: { alignItems: 'center', paddingVertical: 18 },
  done: { color: '#166534', fontWeight: '700' },
  song: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  songCopy: { flex: 1, gap: 4, minWidth: 0 },
  songTitle: { color: '#111827', fontSize: 15, fontWeight: '600' },
  songMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  songMeta: { color: '#6B7280', fontSize: 11 },
  songState: { color: '#4B5563', fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.86 },
});
