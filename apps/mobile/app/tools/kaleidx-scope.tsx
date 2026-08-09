import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useNotification } from '@/components/AppNotification';
import { Card } from '@/components/Card';
import { SongCover } from '@/components/SongCover';
import { normalizeSongId } from '@/domain/catalog';
import {
  KALEIDX_GATES,
  KALEIDX_SCOPE_SOURCES,
  KALEIDX_SCOPE_VERIFIED_AT,
  resolveKaleidxSchedulePhase,
  type KaleidxGate,
  type KaleidxGateId,
  type KaleidxSchedule,
  type KaleidxSong,
} from '@/domain/kaleidx-scope';
import { emptyKaleidxGateProgress, type KaleidxRunMode } from '@/features/toolbox/kaleidx-scope-preferences';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { selectKaleidxGateProgress, useKaleidxScopeProgress } from '@/state/kaleidx-scope-progress';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

type SongResolution = {
  availability: 'available' | 'loading' | 'missing';
  catalogSongId?: string;
};

function gatePalette(gate: KaleidxGate, dark: boolean) {
  return {
    accent: dark ? gate.darkColor ?? gate.color : gate.color,
    onAccent: dark ? gate.darkOnColor ?? gate.onColor : gate.onColor,
  };
}

export default function KaleidxScopeToolScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const activeAccountId = useSession((state) => state.activeAccountId);
  const catalog = useDetailedCatalog();
  const hydrate = useKaleidxScopeProgress((state) => state.hydrate);
  const progress = useKaleidxScopeProgress((state) => state.byAccount);
  const toggleSong = useKaleidxScopeProgress((state) => state.toggleSong);
  const clearRun = useKaleidxScopeProgress((state) => state.clearRun);
  const setKeyObtained = useKaleidxScopeProgress((state) => state.setKeyObtained);
  const setGateCleared = useKaleidxScopeProgress((state) => state.setGateCleared);
  const [selectedGateId, setSelectedGateId] = useState<KaleidxGateId>('blue');
  const [runMode, setRunMode] = useState<KaleidxRunMode>('solo');
  const [expandedPools, setExpandedPools] = useState<Set<string>>(new Set());
  const [keyProgressExpanded, setKeyProgressExpanded] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const gate = KALEIDX_GATES.find((item) => item.id === selectedGateId)!;
  const { accent: gateAccent, onAccent: gateOnAccent } = gatePalette(gate, theme.dark);
  const gateProgress = selectKaleidxGateProgress({ byAccount: progress }, activeAccountId, selectedGateId);
  const catalogSongIds = useMemo(() => {
    const exact = new Map<string, string>();
    const normalized = new Map<string, string>();
    for (const song of catalog.data?.songs ?? []) {
      exact.set(song.id, song.id);
      const normalizedId = normalizeSongId(song.id);
      if (!normalized.has(normalizedId)) normalized.set(normalizedId, song.id);
    }
    return { exact, normalized };
  }, [catalog.data?.songs]);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const resolveSong = (songId: string): SongResolution => {
    if (!catalog.data) return { availability: catalog.isLoading ? 'loading' : 'missing' };
    const catalogSongId = catalogSongIds.exact.get(songId)
      ?? catalogSongIds.normalized.get(normalizeSongId(songId));
    return catalogSongId
      ? { availability: 'available', catalogSongId }
      : { availability: 'missing' };
  };

  const mutate = async (operation: () => Promise<void>) => {
    setPending(true);
    try {
      await operation();
    } catch (error) {
      showNotification({
        title: '保存失败',
        message: error instanceof Error && error.message.startsWith('本局最多')
          ? error.message
          : '无法保存万花筒进度，请稍后重试。',
        variant: 'error',
      });
    } finally {
      setPending(false);
    }
  };

  const selectedSongIds = gate.trackerKind === 'run'
    ? (runMode === 'solo' ? gateProgress.soloSongIds : gateProgress.multiSongIds)
    : gateProgress.completedSongIds;
  const targetCount = gate.trackerKind === 'run'
    ? (runMode === 'solo' ? 3 : 4)
    : gate.trackerKind === 'random-one' ? 1 : gate.keySongs.length;

  return (
    <ScrollView style={[styles.page, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'KALEIDX◈SCOPE' }} />

      <Card style={styles.hero} testID="kaleidx-hero">
        <Text style={[styles.eyebrow, { color: theme.accent }]}>国服 · 六色门</Text>
        <Text style={[styles.heroTitle, { color: theme.text }]}>KALEIDX◈SCOPE</Text>
        <Text style={[styles.heroDetail, { color: theme.textSecondary }]}>钥匙条件、单局计划、挑战曲池和 LIFE 缓和阶段集中查询</Text>
        <View style={styles.prismRail} accessibilityLabel="六色门棱镜轨道">
          {KALEIDX_GATES.map((item) => <View key={item.id} style={[styles.prismSegment, { backgroundColor: item.color }]} />)}
        </View>
        <Text style={[styles.sourceNote, { color: theme.textMuted }]}>资料核对于 {KALEIDX_SCOPE_VERIFIED_AT}；手动记录不代表机台真实解锁状态。</Text>
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gateTabs}>
        {KALEIDX_GATES.map((item) => {
          const selected = item.id === selectedGateId;
          const itemProgress = progress[activeAccountId]?.[item.id] ?? emptyKaleidxGateProgress();
          const { accent, onAccent } = gatePalette(item, theme.dark);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={`${item.label}${itemProgress.gateCleared ? '，已通关' : ''}`}
              accessibilityState={{ selected }}
              onPress={() => setSelectedGateId(item.id)}
              style={[
                styles.gateTab,
                { borderColor: selected ? accent : theme.border, backgroundColor: selected ? accent : theme.surface },
              ]}
            >
              <Text style={[styles.gateTabText, { color: selected ? onAccent : theme.textSecondary }]}>{item.shortLabel}门</Text>
              {itemProgress.gateCleared ? <Text style={{ color: selected ? onAccent : accent }}>✓</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <GateOverview gate={gate} progressCount={selectedSongIds.length} targetCount={targetCount} />

      <Card style={{ ...styles.sectionCard, borderLeftColor: gateAccent }} testID={`kaleidx-unlock-${gate.id}`}>
        <SectionTitle title="解锁步骤" />
        {gate.requirements.map((requirement, index) => (
          <View key={requirement} style={styles.requirementRow}>
            <View style={[styles.stepBadge, { backgroundColor: gateAccent }]}><Text style={[styles.stepText, { color: gateOnAccent }]}>{index + 1}</Text></View>
            <Text style={[styles.requirementText, { color: theme.textSecondary }]}>{requirement}</Text>
          </View>
        ))}
        {gate.perfectChallenge ? <View style={[styles.embeddedSection, { borderTopColor: theme.border }]}>
          <Text style={[styles.poolLabel, { color: theme.text }]}>区域完美挑战</Text>
          <InfoSongRow song={gate.perfectChallenge} role="完美挑战" resolution={resolveSong(gate.perfectChallenge.id)} accent={gateAccent} />
        </View> : null}
      </Card>

      <Card style={{ ...styles.sectionCard, borderLeftColor: gateAccent }} testID={`kaleidx-progress-${gate.id}`}>
        <CollapsibleSectionHeader
          title="钥匙进度"
          meta={`${selectedSongIds.length}/${targetCount}`}
          expanded={keyProgressExpanded}
          accent={gateAccent}
          onToggle={() => setKeyProgressExpanded((value) => !value)}
        />
        {keyProgressExpanded ? <>
          <Text style={[styles.sectionNote, { color: theme.textMuted }]}>{gate.trackerNote}</Text>
        {gate.trackerKind === 'run' ? (
          <View style={styles.runControls}>
            {(['solo', 'multi'] as const).map((mode) => {
              const active = runMode === mode;
              return <Pressable key={mode} accessibilityRole="button" accessibilityLabel={`${mode === 'solo' ? '单人 3 首' : '多人 4 首'}计划`} onPress={() => setRunMode(mode)} style={[styles.modeButton, { borderColor: active ? gateAccent : theme.border, backgroundColor: active ? `${gateAccent}22` : theme.surfaceMuted }]}>
                <Text style={[styles.modeButtonText, { color: active ? gateAccent : theme.textSecondary }]}>{mode === 'solo' ? '单人 3 首' : '多人 4 首'}</Text>
              </Pressable>;
            })}
            <Pressable disabled={pending || selectedSongIds.length === 0} accessibilityRole="button" accessibilityLabel={`清空${runMode === 'solo' ? '单人' : '多人'}本局计划`} onPress={() => void mutate(() => clearRun(activeAccountId, gate.id, runMode))} style={[styles.clearButton, { borderColor: theme.border }, (pending || selectedSongIds.length === 0) && styles.disabled]}>
              <Text style={[styles.clearButtonText, { color: theme.textMuted }]}>清空本局</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.songList}>
          {gate.keySongs.map((song) => (
            <TrackerSongRow
              key={song.id}
              song={song}
              checked={selectedSongIds.includes(song.id)}
              disabled={pending}
              resolution={resolveSong(song.id)}
              gate={gate}
              onToggle={() => void mutate(() => toggleSong(activeAccountId, gate.id, song.id, gate.trackerKind === 'run' ? runMode : undefined))}
            />
          ))}
        </View>
        <View style={[styles.statusDivider, { borderTopColor: theme.border }]}>
          <StatusToggle label="钥匙已取得" value={gateProgress.keyObtained} color={gateAccent} disabled={pending} onPress={() => void mutate(() => setKeyObtained(activeAccountId, gate.id, !gateProgress.keyObtained))} />
          <StatusToggle label="门曲已通关" value={gateProgress.gateCleared} color={gateAccent} disabled={pending} onPress={() => void mutate(() => setGateCleared(activeAccountId, gate.id, !gateProgress.gateCleared))} />
        </View>
        </> : null}
      </Card>

      <Card style={{ ...styles.sectionCard, borderLeftColor: gateAccent }} testID={`kaleidx-challenge-${gate.id}`}>
        <SectionTitle title="门内挑战" />
        <Text style={[styles.sectionNote, { color: theme.textMuted }]}>同一次挑战固定难度；TRACK 1、2 从对应池随机，TRACK 3 为门曲。</Text>
        <ChallengePool label="TRACK 1 随机池" songs={gate.track1} expanded={expandedPools.has(`${gate.id}:1`)} onToggle={() => togglePool(setExpandedPools, `${gate.id}:1`)} resolveSong={resolveSong} />
        <ChallengePool label="TRACK 2 随机池" songs={gate.track2} expanded={expandedPools.has(`${gate.id}:2`)} onToggle={() => togglePool(setExpandedPools, `${gate.id}:2`)} resolveSong={resolveSong} />
        <Text style={[styles.poolLabel, { color: theme.text }]}>TRACK 3 · 固定门曲</Text>
        <InfoSongRow song={gate.track3} role="门曲" resolution={resolveSong(gate.track3.id)} accent={gateAccent} />
      </Card>

      <Card style={{ ...styles.sectionCard, borderLeftColor: gateAccent }} testID={`kaleidx-schedule-${gate.id}`}>
        <CollapsibleSectionHeader
          title="难度与 LIFE"
          expanded={scheduleExpanded}
          accent={gateAccent}
          onToggle={() => setScheduleExpanded((value) => !value)}
        />
        {scheduleExpanded ? <>
          <ScheduleBlock schedule={gate.gateSchedule} accent={gateAccent} />
          {gate.perfectSchedule ? <ScheduleBlock schedule={gate.perfectSchedule} accent={gateAccent} /> : null}
        </> : null}
      </Card>

      <Card style={styles.sourcesCard}>
        <SectionTitle title="资料来源" />
        {KALEIDX_SCOPE_SOURCES.map((source) => (
          <Pressable key={source.url} accessibilityRole="link" onPress={() => void Linking.openURL(source.url)}>
            <Text style={[styles.sourceLink, { color: theme.accent }]}>{source.label} →</Text>
          </Pressable>
        ))}
        <Text style={[styles.sourceNote, { color: theme.textMuted }]}>条件可能随国服更新调整；若机台显示与本页不同，以机台为准。</Text>
      </Card>
    </ScrollView>
  );
}

function GateOverview({ gate, progressCount, targetCount }: { gate: KaleidxGate; progressCount: number; targetCount: number }) {
  const theme = useAppTheme();
  const current = resolveKaleidxSchedulePhase(gate.gateSchedule);
  const { accent, onAccent } = gatePalette(gate, theme.dark);
  return <Card style={{ ...styles.overview, borderColor: accent }} testID={`kaleidx-gate-${gate.id}`}>
    <View style={styles.overviewHeader}>
      <View style={[styles.gateMark, { backgroundColor: accent }]}><Text style={[styles.gateMarkText, { color: onAccent }]}>{gate.order}</Text></View>
      <View style={styles.overviewCopy}>
        <Text style={[styles.overviewTitle, { color: theme.text }]}>{gate.label}</Text>
        <Text style={[styles.overviewArea, { color: theme.textSecondary }]}>{gate.area}</Text>
      </View>
      <Text style={[styles.overviewProgress, { color: accent }]}>{progressCount}/{targetCount}</Text>
    </View>
    <View style={styles.metaRow}>
      <Text style={[styles.metaChip, { color: theme.textSecondary, backgroundColor: theme.surfaceMuted }]}>开放 {formatDate(gate.openedAt)}</Text>
      <Text style={[styles.metaChip, { color: current ? accent : theme.textMuted, backgroundColor: theme.surfaceMuted }]}>{current ? `${current.difficulty} · LIFE ${current.life}` : '尚未开放'}</Text>
    </View>
  </Card>;
}

function SectionTitle({ title }: { title: string }) {
  const theme = useAppTheme();
  return <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>;
}

function CollapsibleSectionHeader({ title, meta, expanded, accent, onToggle }: {
  title: string;
  meta?: string;
  expanded: boolean;
  accent: string;
  onToggle: () => void;
}) {
  const theme = useAppTheme();
  const action = expanded ? '收起' : '展开';
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${action} ${title}`}
    accessibilityState={{ expanded }}
    onPress={onToggle}
    style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.collapsibleHeaderPressed]}
  >
    <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
    <View style={styles.collapsibleSummary}>
      {meta ? <Text style={[styles.progressCount, { color: accent }]}>{meta}</Text> : null}
      <Text style={[styles.collapseAction, { color: accent }]}>{action} {expanded ? '⌃' : '⌄'}</Text>
    </View>
  </Pressable>;
}

function TrackerSongRow({ song, checked, disabled, resolution, gate, onToggle }: {
  song: KaleidxSong; checked: boolean; disabled: boolean; resolution: SongResolution; gate: KaleidxGate; onToggle: () => void;
}) {
  const theme = useAppTheme();
  const { accent, onAccent } = gatePalette(gate, theme.dark);
  return <View style={[styles.songRow, { borderBottomColor: theme.border }]}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={`${checked ? '取消完成' : '标记完成'} ${song.title}`} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onToggle} style={[styles.checkbox, { borderColor: checked ? accent : theme.border, backgroundColor: checked ? accent : theme.surface }, disabled && styles.disabled]}>
      <Text style={[styles.checkmark, { color: checked ? onAccent : 'transparent' }]}>✓</Text>
    </Pressable>
    <SongInfo song={song} resolution={resolution} />
  </View>;
}

function SongInfo({ song, resolution, role }: { song: KaleidxSong; resolution: SongResolution; role?: string }) {
  const theme = useAppTheme();
  const jacketSongId = resolution.catalogSongId ?? normalizeSongId(song.id);
  const content = <>
    <SongCover songId={jacketSongId} size={46} borderRadius={8} />
    <View style={styles.songCopy}>
      <Text numberOfLines={2} style={[styles.songTitle, { color: theme.text }]}>{song.title}</Text>
      <Text style={[styles.songMeta, { color: theme.textMuted }]}>#{song.id}{role ? ` · ${role}` : ''}{resolution.availability === 'missing' ? ' · 曲库尚未同步' : resolution.availability === 'loading' ? ' · 曲库加载中' : ''}</Text>
    </View>
    {resolution.availability === 'available' ? <Text style={[styles.songArrow, { color: theme.accent }]}>›</Text> : null}
  </>;
  return resolution.availability === 'available' && resolution.catalogSongId
    ? <Pressable accessibilityRole="link" accessibilityLabel={`查看歌曲 ${song.title}`} onPress={() => router.push({ pathname: '/songs/[songId]', params: { songId: resolution.catalogSongId! } })} style={styles.songInfo}>{content}</Pressable>
    : <View style={styles.songInfo}>{content}</View>;
}

function InfoSongRow({ song, role, resolution, accent }: { song: KaleidxSong; role: string; resolution: SongResolution; accent: string }) {
  const theme = useAppTheme();
  return <View style={[styles.infoSongRow, { backgroundColor: theme.surfaceMuted, borderColor: `${accent}66` }]}><SongInfo song={song} role={role} resolution={resolution} /></View>;
}

function ChallengePool({ label, songs: poolSongs, expanded, onToggle, resolveSong }: {
  label: string; songs: readonly KaleidxSong[]; expanded: boolean; onToggle: () => void; resolveSong: (songId: string) => SongResolution;
}) {
  const theme = useAppTheme();
  return <View style={[styles.pool, { borderColor: theme.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? '收起' : '展开'} ${label}`} accessibilityState={{ expanded }} onPress={onToggle} style={styles.poolHeader}>
      <Text style={[styles.poolLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.poolCount, { color: theme.textMuted }]}>{poolSongs.length} 首 · {expanded ? '收起' : '展开'}</Text>
    </Pressable>
    {expanded ? <View style={styles.poolSongs}>{poolSongs.map((song) => <View key={song.id} style={[styles.poolSong, { borderTopColor: theme.border }]}><SongInfo song={song} resolution={resolveSong(song.id)} /></View>)}</View> : null}
  </View>;
}

function ScheduleBlock({ schedule, accent }: { schedule: KaleidxSchedule; accent: string }) {
  const theme = useAppTheme();
  const current = resolveKaleidxSchedulePhase(schedule);
  return <View style={styles.scheduleBlock}>
    <View style={styles.scheduleHeader}><Text style={[styles.scheduleLabel, { color: theme.text }]}>{schedule.label}</Text><Text style={[styles.scheduleSwitch, { color: theme.textMuted }]}>{schedule.switchLabel}</Text></View>
    {schedule.phases.map((phase) => {
      const active = phase === current;
      return <View key={phase.startsAt} accessibilityLabel={`${schedule.label} ${formatDate(phase.startsAt)}起 ${phase.difficulty} LIFE ${phase.life}${active ? '，当前阶段' : ''}`} style={[styles.scheduleRow, { borderLeftColor: active ? accent : theme.border, backgroundColor: active ? `${accent}16` : 'transparent' }]}>
        <Text style={[styles.scheduleDate, { color: theme.textMuted }]}>{formatDate(phase.startsAt)}{phase.endsAt ? `—${formatDate(phase.endsAt)}` : ' 起'}</Text>
        <Text style={[styles.scheduleValue, { color: active ? accent : theme.textSecondary }]}>{phase.difficulty} · LIFE {phase.life}{active ? ' · 当前' : ''}</Text>
      </View>;
    })}
  </View>;
}

function StatusToggle({ label, value, color, disabled, onPress }: { label: string; value: boolean; color: string; disabled: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={onPress} style={[styles.statusButton, { borderColor: value ? color : theme.border, backgroundColor: value ? `${color}18` : theme.surfaceMuted }, disabled && styles.disabled]}>
    <Text style={[styles.statusIcon, { color: value ? color : theme.textMuted }]}>{value ? '✓' : '○'}</Text>
    <Text style={[styles.statusText, { color: value ? color : theme.textSecondary }]}>{label}</Text>
  </Pressable>;
}

function togglePool(setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) {
  setter((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${year}.${month}.${day}`;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  hero: { gap: 8, padding: 18 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  heroTitle: { fontSize: 25, fontWeight: '900', letterSpacing: 0.4 },
  heroDetail: { fontSize: 13, lineHeight: 20 },
  prismRail: { flexDirection: 'row', height: 5, borderRadius: 999, overflow: 'hidden', marginVertical: 4 },
  prismSegment: { flex: 1 },
  sourceNote: { fontSize: 11, lineHeight: 17 },
  gateTabs: { gap: 8, paddingVertical: 2 },
  gateTab: { minWidth: 62, minHeight: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  gateTabText: { fontSize: 14, fontWeight: '800' },
  overview: { borderWidth: 1, gap: 12 },
  overviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gateMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  gateMarkText: { fontSize: 19, fontWeight: '900' },
  overviewCopy: { flex: 1, minWidth: 0 },
  overviewTitle: { fontSize: 18, fontWeight: '800' },
  overviewArea: { fontSize: 12, marginTop: 3 },
  overviewProgress: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaChip: { borderRadius: 8, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6, fontSize: 11, fontWeight: '700' },
  sectionCard: { borderLeftWidth: 4, padding: 16, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  collapsibleHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  collapsibleHeaderPressed: { opacity: 0.62 },
  collapsibleSummary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  collapseAction: { fontSize: 11, fontWeight: '800' },
  sectionNote: { fontSize: 12, lineHeight: 18 },
  requirementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepBadge: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 11, fontWeight: '900' },
  requirementText: { flex: 1, fontSize: 13, lineHeight: 20 },
  embeddedSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 9 },
  progressCount: { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  runControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeButton: { minHeight: 38, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  modeButtonText: { fontSize: 12, fontWeight: '800' },
  clearButton: { minHeight: 38, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  clearButtonText: { fontSize: 12, fontWeight: '700' },
  songList: { marginHorizontal: -4 },
  songRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, paddingHorizontal: 4 },
  checkbox: { width: 30, height: 30, borderWidth: 1.5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  checkmark: { fontSize: 17, fontWeight: '900' },
  songInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  songCopy: { flex: 1, minWidth: 0 },
  songTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  songMeta: { fontSize: 10, marginTop: 3 },
  songArrow: { fontSize: 24, fontWeight: '600' },
  statusDivider: { flexDirection: 'row', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  statusButton: { flex: 1, minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  statusIcon: { fontSize: 16, fontWeight: '900' },
  statusText: { fontSize: 12, fontWeight: '800' },
  pool: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, overflow: 'hidden' },
  poolHeader: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  poolLabel: { fontSize: 13, fontWeight: '800' },
  poolCount: { fontSize: 11, fontWeight: '600' },
  poolSongs: { paddingHorizontal: 12 },
  poolSong: { minHeight: 62, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  infoSongRow: { minHeight: 64, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, padding: 9 },
  scheduleBlock: { gap: 5 },
  scheduleHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  scheduleLabel: { fontSize: 13, fontWeight: '800' },
  scheduleSwitch: { fontSize: 10 },
  scheduleRow: { borderLeftWidth: 3, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  scheduleDate: { fontSize: 10, fontVariant: ['tabular-nums'] },
  scheduleValue: { fontSize: 11, fontWeight: '800' },
  sourcesCard: { gap: 10 },
  sourceLink: { fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
