import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useNotification } from '@/components/AppNotification';
import { Card } from '@/components/Card';
import { SongCover } from '@/components/SongCover';
import { normalizeSongId } from '@/domain/catalog';
import { detailTargetHref, encodeDetailTarget } from '@/domain/detail-target';
import type { Song } from '@/domain/models';
import {
  KALEIDX_GATES,
  KALEIDX_FINALES,
  KALEIDX_STAGES_BY_ID,
  kaleidxStageChallenge,
  resolveKaleidxSchedulePhase,
  type KaleidxGate,
  type KaleidxStage,
  type KaleidxStageId,
  type KaleidxSchedule,
  type KaleidxSong,
} from '@/domain/kaleidx-scope';
import type { KaleidxAccountProgress, KaleidxRunMode } from '@/features/toolbox/kaleidx-scope-preferences';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { selectKaleidxGateProgress, useKaleidxScopeProgress } from '@/state/kaleidx-scope-progress';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

type SongResolution = { catalogSongId?: string };

function gatePalette(gate: KaleidxStage, dark: boolean) {
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
  const [selectedGateId, setSelectedGateId] = useState<KaleidxStageId>('blue');
  const [runMode, setRunMode] = useState<KaleidxRunMode>('solo');
  const [keyProgressExpanded, setKeyProgressExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const gate = KALEIDX_STAGES_BY_ID[selectedGateId];
  const { accent, onAccent } = gatePalette(gate, theme.dark);
  const accountProgress = progress[activeAccountId];
  const gateProgress = selectKaleidxGateProgress({ byAccount: progress }, activeAccountId, selectedGateId);
  const catalogSongIds = useMemo(() => {
    const exact = new Map<string, Song>();
    const normalized = new Map<string, Song>();
    for (const song of catalog.data?.songs ?? []) {
      exact.set(song.id, song);
      const normalizedId = normalizeSongId(song.id);
      if (!normalized.has(normalizedId)) normalized.set(normalizedId, song);
    }
    return { exact, normalized };
  }, [catalog.data?.songs]);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const resolveSong = (song: KaleidxSong): SongResolution => {
    const catalogSong = catalogSongIds.exact.get(song.id)
      ?? catalogSongIds.normalized.get(normalizeSongId(song.id));
    return catalogSong && (!song.chartType || catalogSong.charts.some((chart) => chart.type === song.chartType))
      ? { catalogSongId: catalogSong.id }
      : {};
  };

  const selectedSongIds = gate.trackerKind === 'run'
    ? (runMode === 'solo' ? gateProgress.soloSongIds : gateProgress.multiSongIds)
    : gateProgress.completedSongIds;
  const targetCount = gate.trackerKind === 'run'
    ? (runMode === 'solo' ? 3 : 4)
    : gate.trackerKind === 'random-one' ? 1 : gate.trackerKind === 'completion' ? 0 : gate.keySongs.length;

  const mutate = async (operation: () => Promise<void>) => {
    setPending(true);
    try {
      await operation();
    } catch {
      const limit = runMode === 'solo' ? 3 : 4;
      showNotification({
        title: '保存失败',
        message: gate.trackerKind === 'run' && selectedSongIds.length >= limit
          ? '本局最多选择 ' + limit + ' 首不重复曲目。'
          : '无法保存万花筒进度，请稍后重试。',
        variant: 'error',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <ScrollView style={[styles.page, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'KALEIDX◈SCOPE' }} />
      <View style={styles.body}>
        <StageNavigation selectedId={selectedGateId} progress={accountProgress} onSelect={setSelectedGateId} />

        <GateOverview gate={gate}>
          <View style={styles.statusRow}>
            {gate.trackerKind !== 'completion' ? <StatusToggle label="钥匙已取得" value={gateProgress.keyObtained} color={accent} onColor={onAccent} disabled={pending} onPress={() => void mutate(() => setKeyObtained(activeAccountId, gate.id, !gateProgress.keyObtained))} /> : null}
            <StatusToggle label={gate.trackerKind === 'completion' ? gate.completionLabel : '门曲已通关'} value={gateProgress.gateCleared} color={accent} onColor={onAccent} disabled={pending} onPress={() => void mutate(() => setGateCleared(activeAccountId, gate.id, !gateProgress.gateCleared))} />
          </View>
        </GateOverview>

        <Card style={styles.sectionCard} testID={'kaleidx-unlock-' + gate.id}>
          <SectionTitle title="解锁条件" />
          <View style={styles.requirements}>
            {gate.requirements.map((requirement) => <View key={requirement} style={styles.requirementRow}>
              <View style={[styles.requirementDot, { backgroundColor: accent }]} />
              <Text style={[styles.requirementText, { color: theme.textSecondary }]}>{requirement}</Text>
            </View>)}
          </View>
          {gate.trackerKind === 'completion' ? <View style={styles.prerequisites}>
            {gate.prerequisites.map((id) => <View key={id} style={[styles.prerequisite, { backgroundColor: theme.surfaceMuted }]}>
              <Text style={[styles.prerequisiteText, { color: accountProgress?.[id]?.gateCleared ? theme.success : theme.textMuted }]}>
                {(accountProgress?.[id]?.gateCleared ? '✓ ' : '○ ') + KALEIDX_STAGES_BY_ID[id].shortLabel}
              </Text>
            </View>)}
          </View> : <View style={[styles.embeddedSection, { borderTopColor: theme.border }]} testID={'kaleidx-progress-' + gate.id}>
            <CollapsibleSectionHeader title="钥匙曲" meta={selectedSongIds.length + '/' + targetCount} expanded={keyProgressExpanded} onToggle={() => setKeyProgressExpanded((value) => !value)} />
            <View style={[styles.progressRail, { backgroundColor: theme.surfaceMuted }]}>
              <View style={[styles.progressFill, { backgroundColor: accent, width: `${selectedSongIds.length / targetCount * 100}%` }]} />
            </View>
            {keyProgressExpanded ? <>
              {gate.trackerKind === 'run' ? <View style={styles.runControls}>
                <View style={[styles.modeGroup, { backgroundColor: theme.surfaceMuted }]}>
                  {(['solo', 'multi'] as const).map((mode) => <Pressable key={mode} accessibilityRole="button" accessibilityLabel={(mode === 'solo' ? '单人 3 首' : '多人 4 首') + '计划'} onPress={() => setRunMode(mode)} style={[styles.modeButton, runMode === mode && { backgroundColor: accent }]}>
                    <Text style={[styles.modeButtonText, { color: runMode === mode ? onAccent : theme.textSecondary }]}>{mode === 'solo' ? '单人 3 首' : '多人 4 首'}</Text>
                  </Pressable>)}
                </View>
                <Pressable disabled={pending || selectedSongIds.length === 0} accessibilityRole="button" accessibilityLabel={'清空' + (runMode === 'solo' ? '单人' : '多人') + '本局计划'} onPress={() => void mutate(() => clearRun(activeAccountId, gate.id, runMode))} style={[styles.clearButton, (pending || selectedSongIds.length === 0) && styles.disabled]}>
                  <Text style={[styles.clearButtonText, { color: theme.textMuted }]}>清空</Text>
                </Pressable>
              </View> : null}
              {gate.keySongs.map((song) => <TrackerSongRow
                key={song.id} song={song} checked={selectedSongIds.includes(song.id)} disabled={pending}
                resolution={resolveSong(song)} gate={gate}
                onToggle={() => void mutate(() => toggleSong(activeAccountId, gate.id, song.id, gate.trackerKind === 'run' ? runMode : undefined))}
              />)}
            </> : null}
          </View>}
          {gate.perfectChallenge ? <View style={[styles.embeddedSection, { borderTopColor: theme.border }]}>
            <InfoSongRow song={gate.perfectChallenge} role="完美挑战" resolution={resolveSong(gate.perfectChallenge)} />
          </View> : null}
        </Card>

        <StageChallenge key={gate.id} gate={gate} resolveSong={resolveSong} />
        <StageSchedule key={gate.id + ':schedule'} gate={gate} />
      </View>
    </ScrollView>
  );
}

function StageNavigation({ selectedId, progress, onSelect }: {
  selectedId: KaleidxStageId;
  progress: KaleidxAccountProgress | undefined;
  onSelect: (id: KaleidxStageId) => void;
}) {
  const theme = useAppTheme();
  return <View style={styles.navigation}>
    {[KALEIDX_GATES, KALEIDX_FINALES].map((group, index) => <View key={index} style={styles.navigationRow}>
      {group.map((stage) => {
        const selected = selectedId === stage.id;
        const cleared = progress?.[stage.id]?.gateCleared;
        const { accent, onAccent } = gatePalette(stage, theme.dark);
        return <Pressable
          key={stage.id} accessibilityRole="tab" accessibilityLabel={stage.label + (cleared ? '，已通关' : '')}
          accessibilityState={{ selected }} onPress={() => onSelect(stage.id)}
          style={[styles.stageTab, index === 1 && styles.finaleTab, { backgroundColor: selected ? theme.surface : 'transparent', borderColor: selected ? accent : 'transparent' }]}
        >
          <View style={[index === 0 ? styles.gateSymbol : styles.finaleSymbol, { borderColor: stage.id === 'white' ? theme.textMuted : accent, backgroundColor: selected || cleared ? accent : theme.surface }]}>
            {cleared ? <Text style={[styles.gateCheck, { color: onAccent }]}>✓</Text> : <View style={[styles.gateCenter, { backgroundColor: selected ? onAccent : accent }]} />}
          </View>
          <Text numberOfLines={1} style={[styles.stageTabText, { color: selected ? theme.text : theme.textSecondary }]}>{stage.shortLabel + (index === 0 ? '门' : '')}</Text>
        </Pressable>;
      })}
    </View>)}
  </View>;
}

function GateOverview({ gate, children }: { gate: KaleidxStage; children: ReactNode }) {
  const theme = useAppTheme();
  const current = gate.gateSchedule ? resolveKaleidxSchedulePhase(gate.gateSchedule) : null;
  const { accent } = gatePalette(gate, theme.dark);
  return <Card style={styles.overview} testID={'kaleidx-gate-' + gate.id}>
    <View style={[styles.overviewAccent, { backgroundColor: accent }]} />
    <View style={styles.overviewHeading}>
      <View style={styles.overviewCopy}>
        <Text style={[styles.overviewTitle, { color: theme.text }]}>{gate.label}</Text>
        <Text style={[styles.overviewArea, { color: theme.textSecondary }]}>{gate.area}</Text>
      </View>
      <View style={styles.openDate}>
        <Text style={[styles.dateLabel, { color: theme.textMuted }]}>开放</Text>
        <Text style={[styles.dateValue, { color: theme.textSecondary }]}>{formatDate(gate.openedAt)}</Text>
      </View>
    </View>
    {current ? <View style={[styles.currentConditions, { backgroundColor: theme.surfaceMuted }]}>
      <View style={styles.condition}>
        <Text style={[styles.conditionLabel, { color: theme.textMuted }]}>难度</Text>
        <Text style={[styles.difficultyValue, { color: theme.text }]}>{current.difficulty}</Text>
      </View>
      <View style={[styles.condition, styles.lifeCondition, { borderLeftColor: theme.border }]}>
        <Text style={[styles.conditionLabel, { color: theme.textMuted }]}>LIFE</Text>
        <Text style={[styles.lifeValue, { color: theme.text }]}>{current.life}</Text>
      </View>
      {current.dxLife !== undefined ? <View style={[styles.condition, styles.lifeCondition, { borderLeftColor: theme.border }]}>
        <Text style={[styles.conditionLabel, { color: theme.textMuted }]}>DX LIFE</Text>
        <Text style={[styles.lifeValue, { color: theme.text }]}>{current.dxLife}</Text>
      </View> : null}
    </View> : null}
    {children}
  </Card>;
}

function StageChallenge({ gate, resolveSong }: { gate: KaleidxStage; resolveSong: (song: KaleidxSong) => SongResolution }) {
  const theme = useAppTheme();
  const challenge = kaleidxStageChallenge(gate);
  return <Card style={styles.sectionCard} testID={'kaleidx-challenge-' + gate.id}>
    <SectionTitle title="挑战曲目" />
    {challenge.kind === 'random-three' || challenge.kind === 'error' ? <>
      <ChallengePool label="TRACK 1" songs={challenge.track1} resolveSong={resolveSong} />
      <ChallengePool label="TRACK 2" songs={challenge.track2} resolveSong={resolveSong} />
      {challenge.kind === 'random-three'
        ? <InfoSongRow song={challenge.track3} role="TRACK 3" resolution={resolveSong(challenge.track3)} />
        : <View style={[styles.errorTrack, { backgroundColor: theme.surfaceMuted }]}>
          <View style={[styles.errorJacket, { backgroundColor: theme.text }]}><Text style={[styles.errorMark, { color: theme.surface }]}>?</Text></View>
          <View style={styles.songCopy}>
            <Text style={[styles.songMeta, { color: theme.textMuted }]}>TRACK 3</Text>
            <Text style={[styles.songTitle, { color: theme.text }]}>乱码课题</Text>
          </View>
        </View>}
    </> : challenge.kind === 'fixed-three'
      ? challenge.tracks.map((song, index) => <InfoSongRow key={song.id + ':' + song.chartType} song={song} role={'TRACK ' + (index + 1)} resolution={resolveSong(song)} />)
      : <>
        <InfoSongRow song={challenge.song} role="FINAL" resolution={resolveSong(challenge.song)} />
        <View style={[styles.rewardSection, { borderTopColor: theme.border }]}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.rewardLabel, { color: theme.textMuted }]}>通关奖励</Text>
            <Text style={[styles.partner, { color: theme.textSecondary }]}>{challenge.partner}</Text>
          </View>
          <InfoSongRow song={challenge.endingSong} role="ENDING" resolution={resolveSong(challenge.endingSong)} />
        </View>
      </>}
  </Card>;
}

function StageSchedule({ gate }: { gate: KaleidxStage }) {
  const [expanded, setExpanded] = useState(false);
  if (!gate.gateSchedule && !gate.perfectSchedule) return null;
  return <Card style={styles.sectionCard} testID={'kaleidx-schedule-' + gate.id}>
    <CollapsibleSectionHeader title="开放日程" expanded={expanded} onToggle={() => setExpanded((value) => !value)} />
    {expanded ? <>
      {gate.gateSchedule ? <ScheduleBlock schedule={gate.gateSchedule} /> : null}
      {gate.perfectSchedule ? <ScheduleBlock schedule={gate.perfectSchedule} /> : null}
    </> : null}
  </Card>;
}

function SectionTitle({ title }: { title: string }) {
  const theme = useAppTheme();
  return <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>;
}

function CollapsibleSectionHeader({ title, meta, expanded, onToggle }: {
  title: string; meta?: string; expanded: boolean; onToggle: () => void;
}) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={(expanded ? '收起 ' : '展开 ') + title}
    accessibilityState={{ expanded }} onPress={onToggle} style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.pressed]}
  >
    <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
    <View style={styles.collapsibleSummary}>
      {meta ? <Text style={[styles.progressCount, { color: theme.textSecondary }]}>{meta}</Text> : null}
      <Text style={[styles.collapseIcon, { color: theme.textMuted }]}>{expanded ? '−' : '+'}</Text>
    </View>
  </Pressable>;
}

function TrackerSongRow({ song, checked, disabled, resolution, gate, onToggle }: {
  song: KaleidxSong; checked: boolean; disabled: boolean; resolution: SongResolution; gate: KaleidxGate; onToggle: () => void;
}) {
  const theme = useAppTheme();
  const { accent, onAccent } = gatePalette(gate, theme.dark);
  return <View style={[styles.songRow, { borderBottomColor: theme.border }]}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={(checked ? '取消完成 ' : '标记完成 ') + song.title}
      accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onToggle}
      style={[styles.checkbox, { borderColor: checked ? accent : theme.border, backgroundColor: checked ? accent : theme.surface }, disabled && styles.disabled]}
    >
      <Text style={[styles.checkmark, { color: checked ? onAccent : 'transparent' }]}>✓</Text>
    </Pressable>
    <SongInfo song={song} resolution={resolution} />
  </View>;
}

function SongInfo({ song, resolution, role }: { song: KaleidxSong; resolution: SongResolution; role?: string }) {
  const theme = useAppTheme();
  const content = <>
    <SongCover songId={resolution.catalogSongId ?? normalizeSongId(song.id)} size={48} borderRadius={10} />
    <View style={styles.songCopy}>
      {role ? <Text style={[styles.songMeta, { color: theme.textMuted }]}>{role}</Text> : null}
      <Text numberOfLines={2} style={[styles.songTitle, { color: theme.text }]}>{song.title}</Text>
      {song.chartType ? <Text style={[styles.chartType, { color: theme.textSecondary }]}>{song.chartType === 'SD' ? '标准谱' : 'DX'}</Text> : null}
    </View>
    {resolution.catalogSongId ? <Text style={[styles.songArrow, { color: theme.textMuted }]}>›</Text> : null}
  </>;
  return resolution.catalogSongId
    ? <Pressable accessibilityRole="link" accessibilityLabel={'查看歌曲 ' + song.title} onPress={() => router.push(detailTargetHref(encodeDetailTarget({ game: 'maimai', songId: resolution.catalogSongId!, chartType: song.chartType })))} style={styles.songInfo}>{content}</Pressable>
    : <View style={styles.songInfo}>{content}</View>;
}

function InfoSongRow({ song, role, resolution }: { song: KaleidxSong; role: string; resolution: SongResolution }) {
  return <View style={styles.infoSongRow}><SongInfo song={song} role={role} resolution={resolution} /></View>;
}

function ChallengePool({ label, songs, resolveSong }: {
  label: string; songs: readonly KaleidxSong[]; resolveSong: (song: KaleidxSong) => SongResolution;
}) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  return <View style={[styles.pool, { backgroundColor: theme.surfaceMuted }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={(expanded ? '收起 ' : '展开 ') + label + ' 随机池'}
      accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.poolHeader}
    >
      <Text style={[styles.trackLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.poolCount, { color: theme.textMuted }]}>{songs.length + ' 首随机'}</Text>
      <Text style={[styles.collapseIcon, { color: theme.textMuted }]}>{expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded ? <View style={styles.poolSongs}>{songs.map((song) => <View key={song.id} style={[styles.poolSong, { borderTopColor: theme.border }]}><SongInfo song={song} resolution={resolveSong(song)} /></View>)}</View> : null}
  </View>;
}

function ScheduleBlock({ schedule }: { schedule: KaleidxSchedule }) {
  const theme = useAppTheme();
  const current = resolveKaleidxSchedulePhase(schedule);
  const hasDxLife = schedule.phases.some((phase) => phase.dxLife !== undefined);
  return <View style={styles.scheduleBlock}>
    <View style={styles.sectionHeading}>
      <Text style={[styles.scheduleLabel, { color: theme.text }]}>{schedule.label}</Text>
      <Text style={[styles.scheduleSwitch, { color: theme.textMuted }]}>{schedule.switchLabel.replace(' 切换', '')}</Text>
    </View>
    <View style={styles.scheduleRow}>
      <Text style={[styles.scheduleDate, { color: theme.textMuted }]}>起始日期</Text>
      <Text style={[styles.scheduleDifficulty, { color: theme.textMuted }]}>难度</Text>
      <Text style={[styles.scheduleLife, { color: theme.textMuted }]}>LIFE</Text>
      {hasDxLife ? <Text style={[styles.scheduleLife, { color: theme.textMuted }]}>DX</Text> : null}
    </View>
    {schedule.phases.map((phase) => {
      const active = phase === current;
      return <View key={phase.startsAt}
        accessibilityLabel={schedule.label + ' ' + formatDate(phase.startsAt) + '起 ' + phase.difficulty + ' LIFE ' + phase.life + (phase.dxLife !== undefined ? ' DX LIFE ' + phase.dxLife : '') + (active ? '，当前阶段' : '')}
        style={[styles.scheduleRow, { backgroundColor: active ? theme.accentSoft : 'transparent' }]}
      >
        <View style={styles.scheduleDateCell}>
          <View style={[styles.scheduleDot, { backgroundColor: active ? theme.accent : 'transparent' }]} />
          <Text style={[styles.scheduleDateValue, { color: active ? theme.accent : theme.textSecondary }]}>{phase.startsAt.slice(5, 10).replace('-', '.')}</Text>
        </View>
        <Text style={[styles.scheduleDifficulty, { color: theme.textSecondary }]}>{phase.difficulty}</Text>
        <Text style={[styles.scheduleLife, { color: theme.text }]}>{phase.life}</Text>
        {hasDxLife ? <Text style={[styles.scheduleLife, { color: theme.text }]}>{phase.dxLife ?? '—'}</Text> : null}
      </View>;
    })}
  </View>;
}

function StatusToggle({ label, value, color, onColor, disabled, onPress }: {
  label: string; value: boolean; color: string; onColor: string; disabled: boolean; onPress: () => void;
}) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }}
    disabled={disabled} onPress={onPress}
    style={[styles.statusButton, { borderColor: value ? color : theme.border, backgroundColor: value ? color : theme.surface }, disabled && styles.disabled]}
  >
    <Text style={[styles.statusIcon, { color: value ? onColor : theme.textMuted }]}>{value ? '✓' : '○'}</Text>
    <Text style={[styles.statusText, { color: value ? onColor : theme.textSecondary }]}>{label}</Text>
  </Pressable>;
}

function formatDate(value: string): string {
  return value.slice(0, 10).replaceAll('-', '.');
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  body: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 14 },
  navigation: { gap: 6 },
  navigationRow: { flexDirection: 'row', gap: 6 },
  stageTab: { flex: 1, minWidth: 0, paddingVertical: 10, gap: 7, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  finaleTab: { flexDirection: 'row', minHeight: 42, gap: 4, paddingHorizontal: 2 },
  gateSymbol: { width: 23, height: 28, borderWidth: 2, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, alignItems: 'center', justifyContent: 'center' },
  finaleSymbol: { width: 12, height: 12, borderWidth: 1.5, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  gateCenter: { width: 4, height: 4, transform: [{ rotate: '45deg' }] },
  gateCheck: { fontSize: 11, fontWeight: '900' },
  stageTabText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  overview: { padding: 20, borderRadius: 20, overflow: 'hidden', gap: 18 },
  overviewAccent: { position: 'absolute', top: 0, left: 20, width: 44, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  overviewHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  overviewCopy: { flex: 1, minWidth: 0, gap: 5 },
  overviewTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  overviewArea: { fontSize: 12, lineHeight: 17 },
  openDate: { alignItems: 'flex-end', gap: 5 },
  dateLabel: { fontSize: 10 },
  dateValue: { fontSize: 10, fontVariant: ['tabular-nums'] },
  currentConditions: { flexDirection: 'row', borderRadius: 13, paddingVertical: 12 },
  condition: { flex: 1.4, minWidth: 0, paddingHorizontal: 12, justifyContent: 'center', gap: 5 },
  conditionLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.7 },
  difficultyValue: { fontSize: 14, fontWeight: '900' },
  lifeCondition: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },
  lifeValue: { fontSize: 25, lineHeight: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusButton: { flex: 1, minHeight: 40, paddingHorizontal: 8, borderWidth: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  statusIcon: { fontSize: 15, fontWeight: '800' },
  statusText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  sectionCard: { padding: 16, borderRadius: 18, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  requirements: { gap: 7 },
  requirementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  requirementDot: { width: 4, height: 4, borderRadius: 1, marginTop: 7 },
  requirementText: { flex: 1, fontSize: 12, lineHeight: 19 },
  prerequisites: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  prerequisite: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  prerequisiteText: { fontSize: 11, fontWeight: '600' },
  embeddedSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 8 },
  collapsibleHeader: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  collapsibleSummary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  collapseIcon: { fontSize: 21, lineHeight: 24, fontWeight: '400', width: 16, textAlign: 'center' },
  progressCount: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  progressRail: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  runControls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  modeGroup: { flex: 1, flexDirection: 'row', borderRadius: 10, padding: 3 },
  modeButton: { flex: 1, minHeight: 33, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modeButtonText: { fontSize: 12, fontWeight: '700' },
  clearButton: { padding: 9 },
  clearButtonText: { fontSize: 12 },
  songRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  checkbox: { width: 25, height: 25, borderWidth: 1.5, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  checkmark: { fontSize: 15, fontWeight: '900' },
  songInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  songCopy: { flex: 1, minWidth: 0, gap: 3 },
  songTitle: { fontSize: 13, fontWeight: '700', lineHeight: 19 },
  songMeta: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  chartType: { fontSize: 10 },
  songArrow: { fontSize: 23 },
  infoSongRow: { minHeight: 66, flexDirection: 'row', paddingVertical: 5 },
  pool: { borderRadius: 12, overflow: 'hidden' },
  poolHeader: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  poolCount: { flex: 1, textAlign: 'right', fontSize: 11 },
  poolSongs: { paddingHorizontal: 12 },
  poolSong: { minHeight: 64, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  errorTrack: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10, borderRadius: 12 },
  errorJacket: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  errorMark: { fontSize: 28, fontWeight: '900' },
  rewardSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  rewardLabel: { fontSize: 11, fontWeight: '600' },
  partner: { fontSize: 12, fontWeight: '700' },
  scheduleBlock: { gap: 3 },
  scheduleLabel: { fontSize: 12, fontWeight: '800', marginVertical: 6 },
  scheduleSwitch: { fontSize: 10 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 7, minHeight: 33, paddingHorizontal: 8, gap: 5 },
  scheduleDate: { width: 65, fontSize: 10 },
  scheduleDateCell: { width: 65, flexDirection: 'row', alignItems: 'center', gap: 5 },
  scheduleDot: { width: 4, height: 4, borderRadius: 2 },
  scheduleDateValue: { fontSize: 11, fontVariant: ['tabular-nums'] },
  scheduleDifficulty: { flex: 1, fontSize: 10, fontWeight: '600' },
  scheduleLife: { width: 34, fontSize: 11, textAlign: 'right', fontWeight: '700', fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.45 },
});
