import { CollectionPickerCard, CollectionPinButton } from '@/components/CollectionProgress';
import { useEffect, useMemo, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { useNotification } from '@/components/AppNotification';
import { PlateImage } from '@/components/PlateImage';
import { PlateProgressCard } from '@/components/PlateProgressCard';
import { QueryStateView } from '@/components/QueryStateView';
import { DifficultyBadge } from '@/components/ScoreVisuals';
import { difficultyFromIndex } from '@/domain/catalog';
import {
  calculatePlateProgress,
  groupPlatesForPicker,
  parseVersionPlateName,
  type VersionPlateGroup,
} from '@/domain/plates';
import type { Plate } from '@/domain/models';
import { usePlates } from '@/hooks/use-plates';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { detailTargetHref, encodeDetailTarget } from '@/domain/detail-target';
import { useSession } from '@/state/session-store';
import { useToolboxPins } from '@/state/toolbox-pins';
import { useAppTheme } from '@/theme/app-theme';

function firstPlateInGroups(groups: VersionPlateGroup[]): Plate | undefined {
  return groups[0]?.entries[0]?.plate;
}

function parsePlateIdParam(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const plateId = Number(value);
  return Number.isSafeInteger(plateId) && plateId > 0 ? plateId : undefined;
}

export default function PlatesToolScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const { plateId: plateIdParam } = useLocalSearchParams<{ plateId?: string }>();
  const routePlateId = parsePlateIdParam(plateIdParam);
  const plates = usePlates();
  const scores = useScoreSnapshot();
  const songs = useDetailedCatalog();
  const activeGameId = useSession((state) => state.activeGameId);
  const pinnedPlateIds = useToolboxPins((state) => state.pinnedPlateIdsByGame[activeGameId]);
  const hydratePins = useToolboxPins((state) => state.hydrate);
  const togglePinnedPlate = useToolboxPins((state) => state.togglePinnedPlate);
  const [selectedId, setSelectedId] = useState<number | undefined>(routePlateId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openPrefix, setOpenPrefix] = useState<string | null>(null);
  const [pinPending, setPinPending] = useState(false);

  useEffect(() => {
    void hydratePins();
  }, [hydratePins]);

  useEffect(() => {
    if (routePlateId) setSelectedId(routePlateId);
  }, [routePlateId]);

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
    for (const song of songs.data?.songs ?? []) map.set(song.id, song.title);
    return map;
  }, [songs.data]);
  const activeGroup = groups.find((group) => group.prefix === openPrefix) ?? null;
  const viewData = plateSnapshot && groups.length
    ? { groups }
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

  const toggleHomePlate = async () => {
    if (!selected) return;
    setPinPending(true);
    try {
      await togglePinnedPlate(activeGameId, selected.id);
    } catch {
      showNotification({
        title: '保存失败',
        message: '无法保存牌子主页状态，请稍后重试。',
        variant: 'error',
      });
    } finally {
      setPinPending(false);
    }
  };

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '牌子进度' }} />
      <QueryStateView<{ groups: VersionPlateGroup[] }>
        isLoading={plates.isLoading || scores.isLoading}
        isError={plates.isError || scores.isError}
        isEmpty={!!plateSnapshot && groups.length === 0}
        error={plates.error ?? scores.error}
        onRetry={() => { void plates.refetch(); void scores.refetch(); }}
        data={viewData}
        renderData={({ groups: pickerGroups }) => (
          <FlatList
            data={progress?.missingSongs ?? []}
            keyExtractor={(item) => item.songId}
            contentContainerStyle={styles.content}
            ListHeaderComponent={(
              <View style={styles.header}>
                <CollectionPickerCard label="牌子" name={selected?.name} expanded={pickerOpen}
                  onToggle={() => { if (pickerOpen) closePicker(); else openPicker(); }} preview={selected && <PlateImage plateId={selected.id} />}>
                      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>版本</Text>
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
                                { backgroundColor: theme.surface, borderColor: theme.border },
                                selectedHere && { borderColor: theme.accent, backgroundColor: theme.accentSoft },
                                active && { borderColor: theme.accent, backgroundColor: theme.accent },
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={[
                                styles.versionChipText,
                                { color: theme.text },
                                selectedHere && { color: theme.accent },
                                active && { color: theme.onAccent },
                              ]}>
                                {group.prefix}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {activeGroup ? (
                        <>
                          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{activeGroup.prefix}代档位</Text>
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
                                    { backgroundColor: theme.surface, borderColor: theme.border },
                                    current && { backgroundColor: theme.accent, borderColor: theme.accent },
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <Text style={[styles.tierChipText, { color: theme.textSecondary }, current && { color: theme.onAccent }]}>
                                    {entry.label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </>
                      ) : null}
                </CollectionPickerCard>

                {selected && progress ? (
                  <PlateProgressCard
                    plate={selected}
                    progress={progress}
                    footer={(
                      <CollectionPinButton name={selected.name} pinned={pinnedPlateIds.includes(selected.id)}
                        pending={pinPending} onPress={() => void toggleHomePlate()} />
                    )}
                  />
                ) : null}

                <Text style={[styles.heading, { color: theme.text }]}>
                  缺失曲目
                  {progress?.missingSongs.length ? ` · ${progress.missingSongs.length}` : ''}
                </Text>
              </View>
            )}
            ListEmptyComponent={(
              <Card style={styles.emptyCard}>
                <Text style={[styles.done, { color: theme.success }]}>{progress?.total ? '全部完成' : '该姓名框没有歌曲要求'}</Text>
              </Card>
            )}
            renderItem={({ item }) => {
              const title = songTitleById.get(item.songId);
              return (
                <Pressable
                  style={({ pressed }) => [styles.song, { backgroundColor: theme.surface }, pressed && styles.pressed]}
                  onPress={() => router.push(detailTargetHref(encodeDetailTarget({ game: 'maimai', songId: item.songId })))}
                >
                  <View style={styles.songCopy}>
                    <Text style={[styles.songId, { color: theme.textMuted }]}>#{item.songId}</Text>
                    <Text style={[styles.songTitle, { color: theme.text }]}>{title ?? `歌曲 ${item.songId}`}</Text>
                    <View style={styles.songDiffs}>
                      {item.missingDifficulties.map((levelIndex) => (
                        levelIndex < 0 ? (
                          <Text key="any" style={[styles.anyDiffMini, { color: theme.textMuted }]}>任意难度</Text>
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
                  <Text style={[styles.link, { color: theme.accent }]}>详情</Text>
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
  versionChipText: { color: '#111827', fontSize: 16, fontWeight: '800' },
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
  tierChipText: { color: '#374151', fontSize: 15, fontWeight: '700' },
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
