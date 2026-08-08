import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, type Href } from 'expo-router';
import { Card } from '@/components/Card';
import { ChunithmDifficultyBadge } from '@/components/chunithm/ChunithmDifficultyBadge';
import { ChunithmCollectionImage } from '@/components/chunithm/ChunithmCollectionImage';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import {
  calculateChunithmCollectionProgress,
  CHUNITHM_COLLECTION_KIND_LABELS,
  CHUNITHM_PROGRESS_TRACKED_KINDS,
  isChunithmCollectionComputable,
  type ChunithmCollection,
  type ChunithmCollectionKind,
} from '@/domain/chunithm-collections';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useChunithmCollections } from '@/hooks/use-chunithm-collections';
import { useGameData } from '@/hooks/use-game-data';
import {
  normalizeTrophyTone,
  TROPHY_BADGE_THEMES,
} from '@/features/best-image/best-image-badge-theme';
import { useAppTheme } from '@/theme/app-theme';

function Chevron({ expanded }: { expanded: boolean }) {
  const theme = useAppTheme();
  return <Text style={[styles.chevron, { color: theme.textMuted }]}>{expanded ? '▲' : '▼'}</Text>;
}

function progressPercent(completed: number, total: number): number {
  return total ? Math.min(100, (completed / total) * 100) : 0;
}

/** 称号颜色徽章（normal/铜/银/金 → 实体徽章；彩虹 → 渐变徽章；image → 图片预览）。 */
function TrophyBadge({ collection }: { collection: ChunithmCollection }) {
  const tone = normalizeTrophyTone(collection.color);
  if (collection.color === 'image') {
    return <ChunithmCollectionImage kind="trophy-image" collectionId={collection.id} height={34} />;
  }
  if (tone === 'rainbow') {
    return (
      <LayeredGradientBadge
        label={collection.name || `#${collection.id}`}
        numberOfLines={1}
        style={styles.trophyFrame}
        textStyle={styles.trophyText}
        tone="rainbow"
      />
    );
  }
  const theme = TROPHY_BADGE_THEMES[tone];
  return (
    <View style={[styles.trophyFrame, styles.trophySolid, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <Text numberOfLines={1} style={[styles.trophyText, { color: theme.text }]}>
        {collection.name || `#${collection.id}`}
      </Text>
    </View>
  );
}

/** 收藏品预览：称号用徽章/图片，角色/名牌/头像用 CDN 图片。 */
function CollectionPreview({ kind, collection }: { kind: ChunithmCollectionKind; collection: ChunithmCollection }) {
  if (kind === 'trophy') {
    return <TrophyBadge collection={collection} />;
  }
  return (
    <ChunithmCollectionImage
      kind={kind}
      collectionId={collection.id}
      height={40}
      borderRadius={10}
    />
  );
}

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
}: {
  kind: ChunithmCollectionKind;
  collection: ChunithmCollection;
  scores: Parameters<typeof calculateChunithmCollectionProgress>[1];
}) {
  const theme = useAppTheme();
  const computable = isChunithmCollectionComputable(collection);
  const progress = calculateChunithmCollectionProgress(collection, scores);
  const percent = progressPercent(progress.completed, progress.total);
  const difficultyRows = Object.entries(progress.byDifficulty)
    .sort(([left], [right]) => Number(left) - Number(right));

  return (
    <Card style={styles.progressCard}>
      <View style={styles.progressHeader}>
        <View style={styles.progressTitleBlock}>
          <CollectionPreview kind={kind} collection={collection} />
          <Text style={[styles.progressTitle, { color: theme.text }]}>
            {collection.name || `#${collection.id}`}
          </Text>
        </View>
        <Text style={[styles.progressPct, { color: theme.accent }]}>{percent.toFixed(1)}%</Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
        <View style={[styles.barFill, { width: `${percent}%`, backgroundColor: theme.accent }]} />
      </View>
      <View style={styles.progressMetaRow}>
        <RequirementHint collection={collection} />
        <Text style={[styles.progressCount, { color: theme.textSecondary }]}>
          {progress.completed} / {progress.total}
        </Text>
      </View>
      {difficultyRows.map(([difficulty, item]) => {
        const levelIndex = Number(difficulty);
        return (
          <View key={difficulty} style={styles.diffRow}>
            {levelIndex < 0 ? (
              <Text style={[styles.anyDiff, { color: theme.textMuted }]}>任意难度</Text>
            ) : (
              <ChunithmDifficultyBadge display="label" levelIndex={levelIndex as never} />
            )}
            <Text style={[styles.meta, { color: theme.textMuted }]}>{item.completed}/{item.total}</Text>
          </View>
        );
      })}
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
    </Card>
  );
}

export default function ChunithmCollectionsToolScreen() {
  const theme = useAppTheme();
  const [kind, setKind] = useState<ChunithmCollectionKind>('trophy');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
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
                  {selected && kind !== 'trophy' ? (
                    <ChunithmCollectionImage kind={kind} collectionId={selected.id} height={36} borderRadius={6} />
                  ) : null}
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
                  </View>
                ) : null}
              </Card>

              {selected ? (
                <CollectionProgressCard kind={kind} collection={selected} scores={scores} />
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
                    onPress={() => router.push(`/songs/${encodeURIComponent(item.songId)}` as Href)}
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
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  progressTitleBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  progressTitle: { color: '#111827', fontSize: 17, fontWeight: '800', flexShrink: 1 },
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
  progressCount: { color: '#4B5563', fontSize: 12, fontWeight: '600', flexShrink: 0 },
  diffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  anyDiff: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  meta: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  note: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
  description: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
  trophyFrame: { alignSelf: 'flex-start', maxWidth: '100%' },
  trophySolid: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, height: 26, alignItems: 'center', justifyContent: 'center' },
  trophyText: { fontSize: 11, lineHeight: 15, fontWeight: '700', textAlign: 'center', includeFontPadding: false },
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
