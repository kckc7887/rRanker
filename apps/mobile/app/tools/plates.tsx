import { useMemo, useState } from 'react';
import { router, Stack, type Href } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { Card } from '@/components/Card';
import { PlateImage } from '@/components/PlateImage';
import { QueryStateView } from '@/components/QueryStateView';
import { DifficultyBadge, ScoreStatusBadges } from '@/components/ScoreVisuals';
import { SourceStatus } from '@/components/SourceStatus';
import { difficultyFromIndex } from '@/domain/catalog';
import {
  calculatePlateProgress,
  groupPlatesForPicker,
  parseVersionPlateName,
  plateRequirementSpec,
  type PlateTierLabel,
  type VersionPlateGroup,
} from '@/domain/plates';
import type { DataSource, Plate } from '@/domain/models';
import { usePlates } from '@/hooks/use-plates';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useSongs } from '@/hooks/use-songs';

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <SymbolView
      name={expanded ? 'chevron.up' : 'chevron.down'}
      size={16}
      tintColor="#6B7280"
      weight="semibold"
      fallback={<Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />}
    />
  );
}

function firstPlateInGroups(groups: VersionPlateGroup[]): Plate | undefined {
  return groups[0]?.entries[0]?.plate;
}

function progressPercent(completed: number, total: number): number {
  return total ? Math.min(100, (completed / total) * 100) : 0;
}

function RequirementHint({ label }: { label: PlateTierLabel }) {
  const spec = plateRequirementSpec(label);
  return (
    <View style={styles.requirementHint}>
      <Text style={styles.requirementText}>达成</Text>
      <ScoreStatusBadges rate={spec.rate} fc={spec.fc} fs={spec.fs} />
      <Text style={styles.requirementText}>及以上{spec.suffix}</Text>
    </View>
  );
}

export default function PlatesToolScreen() {
  const plates = usePlates();
  const scores = useScoreSnapshot();
  const songs = useSongs();
  const [selectedId, setSelectedId] = useState<number>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openPrefix, setOpenPrefix] = useState<string | null>(null);

  const plateSnapshot = plates.data;
  const groups = useMemo(
    () => groupPlatesForPicker((plateSnapshot?.plates ?? []).filter((plate) => plate.requirements.length > 0)),
    [plateSnapshot?.plates],
  );
  const selectablePlates = useMemo(
    () => groups.flatMap((group) => group.entries.map((entry) => entry.plate)),
    [groups],
  );
  const selected = selectablePlates.find((item) => item.id === selectedId) ?? firstPlateInGroups(groups);
  const selectedMeta = selected ? parseVersionPlateName(selected.name) : null;
  const progress = useMemo(
    () => (selected ? calculatePlateProgress(selected, scores.data?.records ?? []) : null),
    [scores.data?.records, selected],
  );
  const songTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const song of songs.data ?? []) map.set(song.id, song.title);
    return map;
  }, [songs.data]);
  const activeGroup = groups.find((group) => group.prefix === openPrefix) ?? null;
  const percent = progress ? progressPercent(progress.completed, progress.total) : 0;
  const viewData = plateSnapshot && groups.length
    ? { groups, source: plateSnapshot.source }
    : undefined;

  const closePicker = () => {
    setPickerOpen(false);
    setOpenPrefix(null);
  };

  const openPicker = () => {
    setPickerOpen(true);
    setOpenPrefix(selectedMeta?.prefix ?? groups[0]?.prefix ?? null);
  };

  const selectPlate = (plate: Plate) => {
    setSelectedId(plate.id);
    closePicker();
  };

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: '牌子进度' }} />
      <QueryStateView<{ groups: VersionPlateGroup[]; source: DataSource }>
        isLoading={plates.isLoading || scores.isLoading}
        isError={plates.isError || scores.isError}
        isEmpty={!!plateSnapshot && groups.length === 0}
        error={plates.error ?? scores.error}
        onRetry={() => { void plates.refetch(); void scores.refetch(); }}
        data={viewData}
        renderData={({ groups: pickerGroups, source }) => (
          <FlatList
            data={progress?.missingSongs ?? []}
            keyExtractor={(item) => item.songId}
            contentContainerStyle={styles.content}
            ListHeaderComponent={(
              <View style={styles.header}>
                <SourceStatus items={[
                  { key: 'plates', label: source.label, updatedAt: source.updatedAt, state: source.isStale ? 'cache' : 'live' },
                  { key: 'scores', label: scores.data?.source?.label ?? '成绩不可用', updatedAt: scores.data?.source?.updatedAt, state: !scores.data ? 'unavailable' : scores.data.source?.isStale ? 'cache' : 'live' },
                ]} />

                <Card style={styles.pickerCard}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: pickerOpen }}
                    accessibilityLabel={selected ? `当前牌子 ${selected.name}` : '选择牌子'}
                    onPress={() => { if (pickerOpen) closePicker(); else openPicker(); }}
                    style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
                  >
                    <View style={styles.triggerCopy}>
                      <Text style={styles.triggerLabel}>当前牌子</Text>
                      <Text style={styles.triggerName}>{selected?.name ?? '请选择'}</Text>
                    </View>
                    {selected ? (
                      <View style={styles.platePreview}>
                        <PlateImage plateId={selected.id} />
                      </View>
                    ) : null}
                    <Chevron expanded={pickerOpen} />
                  </Pressable>

                  {pickerOpen ? (
                    <View style={styles.pickerBody}>
                      <Text style={styles.sectionLabel}>版本</Text>
                      <View style={styles.versionGrid}>
                        {pickerGroups.map((group) => {
                          const active = openPrefix === group.prefix;
                          const selectedHere = group.entries.some((entry) => entry.plate.id === selected?.id);
                          return (
                            <Pressable
                              key={group.prefix}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active || selectedHere }}
                              onPress={() => setOpenPrefix(group.prefix)}
                              style={({ pressed }) => [
                                styles.versionChip,
                                selectedHere && styles.versionChipSelected,
                                active && styles.versionChipActive,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={[
                                styles.versionChipText,
                                selectedHere && styles.versionChipTextSelected,
                                active && styles.versionChipTextActive,
                              ]}>
                                {group.prefix}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {activeGroup ? (
                        <>
                          <Text style={styles.sectionLabel}>{activeGroup.prefix}代档位</Text>
                          <View style={styles.tierRow}>
                            {activeGroup.entries.map((entry) => {
                              const current = entry.plate.id === selected?.id;
                              return (
                                <Pressable
                                  key={entry.plate.id}
                                  accessibilityRole="button"
                                  accessibilityLabel={entry.plate.name}
                                  accessibilityState={{ selected: current }}
                                  onPress={() => selectPlate(entry.plate)}
                                  style={({ pressed }) => [
                                    styles.tierChip,
                                    current && styles.tierChipActive,
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <Text style={[styles.tierChipText, current && styles.tierChipTextActive]}>
                                    {entry.label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </>
                      ) : null}
                    </View>
                  ) : null}
                </Card>

                {selected && progress ? (
                  <Card style={styles.progressCard}>
                    <View style={styles.progressHeader}>
                      <Text style={styles.progressTitle}>{selected.name}</Text>
                      <Text style={styles.progressPct}>{percent.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${percent}%` }]} />
                    </View>
                    <View style={styles.progressMetaRow}>
                      {selectedMeta ? <RequirementHint label={selectedMeta.label} /> : <View style={styles.requirementHint} />}
                      <Text style={styles.progressCount}>
                        {progress.completed} / {progress.total}
                      </Text>
                    </View>
                    {Object.entries(progress.byDifficulty)
                      .sort(([left], [right]) => Number(left) - Number(right))
                      .map(([difficulty, item]) => {
                        const levelIndex = Number(difficulty);
                        return (
                          <View key={difficulty} style={styles.diffRow}>
                            {levelIndex < 0 ? (
                              <Text style={styles.anyDiff}>任意难度</Text>
                            ) : (
                              <DifficultyBadge difficulty={difficultyFromIndex(levelIndex)} compact />
                            )}
                            <Text style={styles.meta}>{item.completed}/{item.total}</Text>
                          </View>
                        );
                      })}
                  </Card>
                ) : null}

                <Text style={styles.heading}>
                  缺失曲目
                  {progress?.missingSongs.length ? ` · ${progress.missingSongs.length}` : ''}
                </Text>
              </View>
            )}
            ListEmptyComponent={(
              <Card style={styles.emptyCard}>
                <Text style={styles.done}>{progress?.total ? '全部完成' : '该姓名框没有歌曲要求'}</Text>
              </Card>
            )}
            renderItem={({ item }) => {
              const title = songTitleById.get(item.songId);
              return (
                <Pressable
                  style={({ pressed }) => [styles.song, pressed && styles.pressed]}
                  onPress={() => router.push(`/songs/${encodeURIComponent(item.songId)}` as Href)}
                >
                  <View style={styles.songCopy}>
                    <Text style={styles.songId}>#{item.songId}</Text>
                    <Text style={styles.songTitle}>{title ?? `歌曲 ${item.songId}`}</Text>
                    <View style={styles.songDiffs}>
                      {item.missingDifficulties.map((levelIndex) => (
                        levelIndex < 0 ? (
                          <Text key="any" style={styles.anyDiffMini}>任意难度</Text>
                        ) : (
                          <DifficultyBadge
                            key={levelIndex}
                            difficulty={difficultyFromIndex(levelIndex)}
                            mini
                          />
                        )
                      ))}
                    </View>
                  </View>
                  <Text style={styles.link}>详情</Text>
                </Pressable>
              );
            }}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 16, gap: 10, paddingBottom: 28 },
  header: { gap: 12 },
  heading: { color: '#111827', fontSize: 17, fontWeight: '700', marginTop: 4 },
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
  triggerName: { color: '#111827', fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  platePreview: { marginTop: 10 },
  pickerBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
    backgroundColor: '#FAFBFC',
  },
  sectionLabel: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  versionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  versionChip: {
    minWidth: 44,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionChipSelected: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  versionChipActive: {
    borderColor: '#246BFD',
    backgroundColor: '#246BFD',
  },
  versionChipText: { color: '#111827', fontSize: 16, fontWeight: '800' },
  versionChipTextSelected: { color: '#1D4ED8' },
  versionChipTextActive: { color: '#FFFFFF' },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tierChip: {
    flexGrow: 1,
    flexBasis: 56,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  tierChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  tierChipText: { color: '#374151', fontSize: 15, fontWeight: '700' },
  tierChipTextActive: { color: '#FFFFFF' },
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
  requirementHint: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  requirementText: {
    color: '#6B7280',
    fontSize: 11,
    lineHeight: 16,
  },
  progressCount: { color: '#4B5563', fontSize: 12, fontWeight: '600', flexShrink: 0 },
  diffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  anyDiff: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  meta: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
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
