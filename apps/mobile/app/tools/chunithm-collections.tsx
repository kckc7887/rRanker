import type { ChunithmLevelIndex } from '@/domain/chunithm';
import { CollectionPickerCard, CollectionPinButton, CollectionProgress } from '@/components/CollectionProgress';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/Card';
import { ChunithmDifficultyBadge } from '@/components/chunithm/ChunithmDifficultyBadge';
import { ChunithmCollectionImage, ChunithmCollectionPreview } from '@/components/chunithm/ChunithmCollectionImage';
import { QueryStateView } from '@/components/QueryStateView';
import { useNotification } from '@/components/AppNotification';
import {
  calculateChunithmCollectionProgress,
  CHUNITHM_COLLECTION_KIND_LABELS,
  CHUNITHM_PROGRESS_TRACKED_KINDS,
  isChunithmCollectionComputable,
  isChunithmCollectionKind,
  type ChunithmCollection,
  type ChunithmCollectionKind,
} from '@/domain/chunithm-collections';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useChunithmCollections } from '@/hooks/use-chunithm-collections';
import { useGameData } from '@/hooks/use-game-data';
import { detailTargetHref, encodeDetailTarget } from '@/domain/detail-target';
import { useSession } from '@/state/session-store';
import { useToolboxPins } from '@/state/toolbox-pins';
import { useAppTheme } from '@/theme/app-theme';

function RequirementHint({ collection }: { collection: ChunithmCollection }) {
  const theme = useAppTheme();
  const hints: string[] = [];
  for (const group of collection.required ?? []) {
    if (group.rank) hints.push(`评级 ${group.rank.toUpperCase()}`);
    if (group.fullCombo) hints.push(`全连 ${group.fullCombo.toUpperCase()}`);
    if (group.fullChain) hints.push(`全链 ${group.fullChain.toUpperCase()}`);
  }
  if (hints.length === 0) return null;
  return (
    <View style={styles.requirementHint}>
      <Text style={[styles.requirementText, { color: theme.textMuted }]}>达成</Text>
      {[...new Set(hints)].map((hint) => (
        <View key={hint} style={[styles.requirementChip, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}>
          <Text style={[styles.requirementChipText, { color: theme.textSecondary }]}>{hint}</Text>
        </View>
      ))}
      <Text style={[styles.requirementText, { color: theme.textMuted }]}>及以上</Text>
    </View>
  );
}

function CollectionProgressCard({
  kind,
  collection,
  scores,
  pinned,
  pinPending,
  onTogglePin,
}: {
  kind: ChunithmCollectionKind;
  collection: ChunithmCollection;
  scores: Parameters<typeof calculateChunithmCollectionProgress>[1];
  pinned: boolean;
  pinPending: boolean;
  onTogglePin: () => void;
}) {
  const theme = useAppTheme();
  const computable = isChunithmCollectionComputable(collection);
  const progress = calculateChunithmCollectionProgress(collection, scores);
  const name = collection.name || `#${collection.id}`;
  return (
    <CollectionProgress title={name} progress={progress}
      preview={<ChunithmCollectionPreview borderRadius={10} kind={kind} collection={collection} />}
      requirement={<RequirementHint collection={collection} />}
      difficulty={level => <ChunithmDifficultyBadge display="label" levelIndex={level as ChunithmLevelIndex} />}>
      {!computable ? (
        <Text style={[styles.note, { color: theme.textMuted }]}>
          该收藏品没有可计算的达成条件，仅展示名称与描述。
        </Text>
      ) : null}
      {collection.description ? (
        <Text style={[styles.description, { color: theme.textMuted }]} numberOfLines={2}>
          {collection.description}
        </Text>
      ) : null}
      <CollectionPinButton name={name} pinned={pinned} pending={pinPending} onPress={onTogglePin} />
    </CollectionProgress>
  );
}

export default function ChunithmCollectionsToolScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const { kind: kindParam, id: idParam } = useLocalSearchParams<{ kind?: string; id?: string }>();
  const routeKind = kindParam && isChunithmCollectionKind(kindParam)
    && CHUNITHM_PROGRESS_TRACKED_KINDS.includes(kindParam as ChunithmCollectionKind)
    ? (kindParam as ChunithmCollectionKind)
    : null;
  const routeId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;
  const [kind, setKind] = useState<ChunithmCollectionKind>(routeKind ?? 'trophy');
  const [selectedId, setSelectedId] = useState<number | null>(routeId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pinPending, setPinPending] = useState(false);
  const activeGameId = useSession((state) => state.activeGameId);
  const pinnedIds = useToolboxPins((state) => state.pinnedCollectionIdsByGame[activeGameId]);
  const hydratePins = useToolboxPins((state) => state.hydrate);
  const togglePinnedCollection = useToolboxPins((state) => state.togglePinnedCollection);
  const { data, isLoading, isError, error, refetch } = useChunithmCollections(kind);
  const gameData = useGameData();
  const catalog = useChunithmCatalog();
  const scores = useMemo(
    () => (gameData.data?.payload.kind === 'chunithm' ? gameData.data.payload.scores : []),
    [gameData.data],
  );
  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const song of catalog.data?.songs ?? []) map.set(String(song.id), song.title);
    return map;
  }, [catalog.data?.songs]);

  useEffect(() => {
    void hydratePins();
  }, [hydratePins]);

  useEffect(() => {
    if (routeKind) setKind(routeKind);
    if (routeId) setSelectedId(routeId);
  }, [routeKind, routeId]);

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

  const toggleHomePin = async () => {
    if (!selected) return;
    setPinPending(true);
    try {
      await togglePinnedCollection(activeGameId, kind, selected.id);
    } catch {
      showNotification({
        title: '保存失败',
        message: '无法保存收藏品主页状态，请稍后重试。',
        variant: 'error',
      });
    } finally {
      setPinPending(false);
    }
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
              <View style={styles.kindBar}>
                {CHUNITHM_PROGRESS_TRACKED_KINDS.map((candidate) => (
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

              <CollectionPickerCard label="收藏品" name={selected?.name} expanded={pickerOpen}
                  onToggle={() => setPickerOpen(open => !open)} preview={selected && kind !== 'trophy' && <ChunithmCollectionImage kind={kind} collectionId={selected.id} height={36} borderRadius={6} />}>
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
                          {query.trim() ? '没有匹配的收藏品' : '该类暂无收藏品'}
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
                </CollectionPickerCard>

              {selected ? (
                <CollectionProgressCard
                  kind={kind}
                  collection={selected}
                  scores={scores}
                  pinned={pinnedIds.some((item) => item.kind === kind && item.id === selected.id)}
                  pinPending={pinPending}
                  onTogglePin={() => void toggleHomePin()}
                />
              ) : null}

              {selected && selectedComputable ? (
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
                selected && selectedComputable ? (
                  <Card style={styles.emptyCard}>
                    <Text style={[styles.done, { color: theme.success }]}>
                      {progress?.total ? '全部完成' : '该收藏品没有曲目要求'}
                    </Text>
                  </Card>
                ) : null
              }
              renderItem={({ item }) => {
                const title = titleById.get(item.songId);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`查看歌曲 ${title ?? item.songId}`}
                    onPress={() => router.push(detailTargetHref(encodeDetailTarget({ game: 'chunithm', songId: item.songId })))}
                    style={({ pressed }) => [styles.song, { backgroundColor: theme.surface }, pressed && styles.pressed]}
                  >
                    <View style={styles.songCopy}>
                      <Text style={[styles.songId, { color: theme.textMuted }]}>#{item.songId}</Text>
                      <Text style={[styles.songTitle, { color: theme.text }]} numberOfLines={1}>
                        {title ?? `歌曲 ${item.songId}`}
                      </Text>
                      <View style={styles.songDiffs}>
                        {item.missingDifficulties.map((levelIndex) => (
                          levelIndex < 0 ? (
                            <Text key="any" style={[styles.anyDiffMini, { color: theme.textMuted }]}>任意难度</Text>
                          ) : (
                            <ChunithmDifficultyBadge
                              key={levelIndex}
                              display="label"
                              levelIndex={levelIndex as never}
                            />
                          )
                        ))}
                      </View>
                    </View>
                    <Text style={[styles.link, { color: theme.accent }]}>详情</Text>
                  </Pressable>
                );
              }}
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
  requirementHint: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  requirementText: { color: '#6B7280', fontSize: 11, lineHeight: 16 },
  requirementChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  requirementChipText: { color: '#4B5563', fontSize: 10, fontWeight: '700' },
  note: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
  description: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
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
  songId: { color: '#9CA3AF', fontSize: 11, fontWeight: '600' },
  songTitle: { color: '#111827', fontSize: 15, fontWeight: '600' },
  songDiffs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  anyDiffMini: { color: '#6B7280', fontSize: 10, fontWeight: '700' },
  link: { color: '#246BFD', fontWeight: '700', fontSize: 13 },
  pressed: { opacity: 0.86 },
});
