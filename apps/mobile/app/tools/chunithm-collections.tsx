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
} from '@/domain/chunithm-collections';
import { useChunithmCollectionProgress, useChunithmCollections } from '@/hooks/use-chunithm-collections';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

function SelectedProgressCard({
  kind,
  collection,
}: {
  kind: ChunithmCollectionKind;
  collection: ChunithmCollection;
}) {
  const theme = useAppTheme();
  const progress = useChunithmCollectionProgress(kind, collection.id);
  const withLive = progress.data?.collection.required
    ? progress.data.collection
    : collection;
  const summary = summarizeChunithmCollectionProgress(withLive.required);
  const groups = withLive.required ?? [];

  return (
    <Card style={styles.detailCard}>
      <Text style={[styles.detailName, { color: theme.text }]}>{collection.name || `#${collection.id}`}</Text>
      <Text style={[styles.detailProgress, { color: theme.accent }]}>
        {summary.groups === 0
          ? '该收藏品没有可计算条件'
          : `达成 ${summary.completedGroups}/${summary.groups} 组 · 曲目 ${summary.completedSongs}/${summary.songRequirements}`}
      </Text>
      {progress.isLoading ? (
        <Text style={[styles.detailHint, { color: theme.textMuted }]}>正在读取达成进度…</Text>
      ) : progress.isError ? (
        <Text style={[styles.detailHint, { color: theme.danger }]}>
          无法读取进度：{progress.error instanceof Error ? progress.error.message : '未知错误'}
        </Text>
      ) : null}
      {groups.map((group, index) => (
        <View key={`${index}-${group.difficulties.join(',')}-${group.songs.length}`} style={[styles.group, { borderTopColor: theme.border }]}>
          <View style={styles.groupHeader}>
            <Text style={[styles.groupTitle, { color: theme.text }]}>条件组 {index + 1}</Text>
            {group.completed !== undefined ? (
              <Text style={[styles.groupState, {
                color: group.completed ? theme.accent : theme.textMuted,
              }]}>{group.completed ? '已完成' : '未完成'}</Text>
            ) : null}
          </View>
          <View style={styles.groupMeta}>
            {group.difficulties.length > 0 ? (
              <Text style={[styles.groupMetaText, { color: theme.textSecondary }]}>
                难度 {group.difficulties.map((d) => ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'ULTIMA', "WORLD'S END"][d]).join('/')}
              </Text>
            ) : null}
            {group.rank ? <Text style={[styles.groupMetaText, { color: theme.textSecondary }]}>评级 {group.rank.toUpperCase()}</Text> : null}
            {group.fullCombo ? <Text style={[styles.groupMetaText, { color: theme.textSecondary }]}>全连 {group.fullCombo.toUpperCase()}</Text> : null}
            {group.fullChain ? <Text style={[styles.groupMetaText, { color: theme.textSecondary }]}>全链 {group.fullChain.toUpperCase()}</Text> : null}
          </View>
          {group.songs.map((song) => (
            <View key={`${song.id}`} style={styles.songRow}>
              <Text style={[styles.songTitle, { color: theme.text }]} numberOfLines={1}>{song.title || `#${song.id}`}</Text>
              <Text style={[styles.songState, { color: song.completed ? theme.accent : theme.textMuted }]}>
                {song.completed ? '✓' : '—'}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </Card>
  );
}

function ListItem({
  item,
  kind,
  selected,
  onSelect,
}: {
  item: ChunithmCollection;
  kind: ChunithmCollectionKind;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`选择 ${item.name || `#${item.id}`}`}
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.item,
        { backgroundColor: theme.surface, borderColor: selected ? theme.accent : theme.border },
        pressed && styles.itemPressed,
      ]}
    >
      <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>{item.name || `#${item.id}`}</Text>
      <View style={styles.itemMetaRow}>
        {isChunithmCollectionComputable(item) ? (
          <Text style={[styles.computable, { color: theme.accent }]}>有条件</Text>
        ) : null}
        {item.description ? (
          <Text style={[styles.itemDesc, { color: theme.textMuted }]} numberOfLines={1}>{item.description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ChunithmCollectionsToolScreen() {
  const theme = useAppTheme();
  const session = useSession((state) => state.session);
  const [kind, setKind] = useState<ChunithmCollectionKind>('trophy');
  const [selectedId, setSelectedId] = useState<number | null>(null);
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
  const needsLogin = session?.mode !== 'lxns-oauth';

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '收藏品进度' }} />
      <View style={styles.kindBar}>
        {CHUNITHM_COLLECTION_KINDS.map((candidate) => (
          <Pressable
            key={candidate}
            accessibilityRole="button"
            accessibilityLabel={CHUNITHM_COLLECTION_KIND_LABELS[candidate]}
            accessibilityState={{ selected: kind === candidate }}
            onPress={() => {
              setKind(candidate);
              setSelectedId(null);
            }}
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
      <View style={styles.searchWrap}>
        <TextInput
          accessibilityLabel="搜索收藏品名称或描述"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
          placeholder="搜索名称或描述"
          placeholderTextColor={theme.textMuted}
          style={[styles.search, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
        />
      </View>

      <QueryStateView
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && !isError && (data?.items.length ?? 0) === 0}
        error={error}
        onRetry={() => { void refetch(); }}
        data={data}
        renderData={(snapshot) => (
          <FlatList
            data={items}
            keyExtractor={(item) => `${kind}:${item.id}`}
            renderItem={({ item }) => (
              <ListItem
                item={item}
                kind={kind}
                selected={selectedId === item.id}
                onSelect={() => setSelectedId(item.id)}
              />
            )}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.header}>
                <SourceStatus items={[
                  {
                    key: 'collections',
                    label: snapshot.source.label,
                    updatedAt: snapshot.source.updatedAt,
                    state: snapshot.source.isStale ? 'cache' : 'live',
                  },
                ]} />
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  {needsLogin
                    ? '未绑定落雪账号：可浏览列表，绑定后选择收藏品查看逐件达成进度。'
                    : '已连接落雪账号：选择收藏品可查看达成条件与完成状态。'}
                </Text>
              </View>
            }
            ListFooterComponent={
              selected ? (
                <SelectedProgressCard kind={kind} collection={selected} />
              ) : null
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  kindBar: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 4, flexWrap: 'wrap' },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 4 },
  search: {
    backgroundColor: '#FFF',
    borderColor: '#D1D5DB',
    borderWidth: 1,
    borderRadius: 9,
    padding: 10,
    color: '#111827',
  },
  kindChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  kindChipText: { color: '#374151', fontSize: 13, fontWeight: '700' },
  list: { padding: 16, gap: 10 },
  header: { gap: 8, marginBottom: 4 },
  hint: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
  item: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D5DB',
    padding: 12,
    gap: 4,
  },
  itemPressed: { opacity: 0.7 },
  itemName: { color: '#111827', fontSize: 15, fontWeight: '700' },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  computable: { color: '#246BFD', fontSize: 11, fontWeight: '700' },
  itemDesc: { color: '#6B7280', fontSize: 12, flexShrink: 1 },
  detailCard: { gap: 8, marginTop: 4 },
  detailName: { color: '#111827', fontSize: 17, fontWeight: '700' },
  detailProgress: { color: '#246BFD', fontSize: 14, fontWeight: '700' },
  detailHint: { color: '#6B7280', fontSize: 12 },
  group: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB', paddingTop: 8, gap: 4 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  groupTitle: { color: '#111827', fontSize: 13, fontWeight: '700' },
  groupState: { color: '#4B5563', fontSize: 12, fontWeight: '700' },
  groupMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupMetaText: { color: '#4B5563', fontSize: 11 },
  songRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  songTitle: { color: '#111827', fontSize: 12, flexShrink: 1 },
  songState: { color: '#4B5563', fontSize: 12, fontWeight: '700' },
});
