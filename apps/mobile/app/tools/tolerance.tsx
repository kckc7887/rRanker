import type { SimaiStatistics } from '@/features/simai-chart-preview/statistics';
import { useMajdataSong, useMajdataParsedChart } from '@/hooks/use-majdata';
import { QueryStateView } from '@/components/QueryStateView';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import {
  calculateAchievement,
  maximumSameErrors,
  singleNoteAnalysis,
  type BreakJudgment,
  type NormalJudgment,
  type NoteAnalysisMode,
  type NoteCounts,
  type NoteKind,
  type AchievementMode,
} from '@/domain/tolerance';
import { useAppTheme } from '@/theme/app-theme';

const KINDS = ['tap', 'hold', 'slide', 'touch', 'break'] as const;
const MODE_OPTIONS: readonly { mode: NoteAnalysisMode; label: string; detail: string }[] = [
  { mode: 'zeroPlus', label: '0%+', detail: '从 0% 累计每个 Note 实际获得的达成率' },
  { mode: 'hundredMinus', label: '100%-', detail: '从 100% 扣除；BREAK 奖励显示为负扣除值' },
  { mode: 'hundredOneMinus', label: '101%-', detail: '从理论 101% 扣除每个 Note 损失的达成率' },
];
const TARGET_SHORTCUTS = ['100.5', '100', '99.5', '99'] as const;
const ANALYSIS_COLUMNS = ['criticalPerfect', 'perfect', 'great', 'good', 'miss'] as const;
const ANALYSIS_LABELS: Record<(typeof ANALYSIS_COLUMNS)[number], string> = {
  criticalPerfect: 'CRITICAL\nPERFECT', perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS',
};
const NORMAL_ANALYSIS_JUDGMENTS: Record<(typeof ANALYSIS_COLUMNS)[number], readonly NormalJudgment[]> = {
  criticalPerfect: ['perfect'], perfect: ['perfect'], great: ['great'], good: ['good'], miss: ['miss'],
};
const BREAK_ANALYSIS_JUDGMENTS: Record<(typeof ANALYSIS_COLUMNS)[number], readonly BreakJudgment[]> = {
  criticalPerfect: ['criticalPerfect'], perfect: ['perfect1', 'perfect2'],
  great: ['great1', 'great2', 'great3'], good: ['good'], miss: ['miss'],
};
const TOLERANCE_COLUMNS = ['perfect', 'great', 'good', 'miss'] as const;
const BREAK_TOLERANCE_JUDGMENTS: Record<(typeof TOLERANCE_COLUMNS)[number], readonly BreakJudgment[]> = {
  perfect: ['perfect1', 'perfect2'], great: ['great1', 'great2', 'great3'], good: ['good'], miss: ['miss'],
};
const BREAK_JUDGMENT_LABEL: Partial<Record<BreakJudgment, string>> = {
  perfect1: 'P-1', perfect2: 'P-2', great1: 'G-1', great2: 'G-2', great3: 'G-3',
};

function initialNoteValue(value: string | string[] | undefined, fallback: string): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && /^\d+$/.test(candidate) ? candidate : fallback;
}

function formatAnalysisValue(value: number): string {
  const normalized = Math.abs(value) < 0.0000005 ? 0 : value;
  return `${normalized.toFixed(6)}%`;
}

function TableCell({ children, cellStyle, textStyle, accessibilityLabel }: {
  children: string;
  cellStyle?: React.ComponentProps<typeof View>['style'];
  textStyle?: React.ComponentProps<typeof Text>['style'];
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  return <View accessibilityLabel={accessibilityLabel} style={[styles.tableCell, { borderRightColor: theme.border }, cellStyle]}>
    <Text style={[textStyle, { color: theme.textSecondary }]}>{children}</Text>
  </View>;
}

function useTableChrome() {
  const theme = useAppTheme();
  return {
    theme,
    table: { borderColor: theme.border, backgroundColor: theme.surface },
    row: { borderBottomColor: theme.border },
    headerRow: { backgroundColor: theme.surfaceMuted },
    kindCell: { backgroundColor: theme.surfaceMuted },
  };
}

export default function ToleranceToolScreen() {
  const params = useLocalSearchParams<{ gameId?: string; songId?: string; hash?: string; levelIndex?: string }>();
  if (params.gameId === 'majdata-net' && params.songId) return <MajdataTolerance songId={params.songId} hash={params.hash} level={Number(params.levelIndex)} />;
  return <ToleranceCalculator dualMode={params.gameId === 'majdata-net'} />;
}
function MajdataTolerance({ songId, hash, level }: { songId: string; hash?: string; level: number }) {
  const song = useMajdataSong(songId); const parsed = useMajdataParsedChart(song.data, level);
  const changed = !!hash && !!song.data && song.data.hash !== hash;
  return <QueryStateView data={changed ? undefined : parsed.data} isLoading={song.isLoading || parsed.isLoading} isError={song.isError || parsed.isError || changed} isEmpty={false}
    onRetry={() => { void song.refetch(); void parsed.refetch(); }} renderData={data => <ToleranceCalculator key={`${songId}:${hash}:${level}`} statistics={data.statistics} dualMode />} />;
}
function ToleranceCalculator({ statistics, dualMode = false }: { statistics?: SimaiStatistics; dualMode?: boolean }) {
  const theme = useAppTheme();
  const tableChrome = useTableChrome();
  const params = useLocalSearchParams<Partial<Record<NoteKind, string | string[]>>>();
  const [mineCounts, setMineCounts] = useState<NoteCounts>(statistics?.mines ?? { tap: 0, hold: 0, slide: 0, touch: 0, break: 0 });
  const [mineOpen, setMineOpen] = useState(false);
  const [scoringMode, setScoringMode] = useState<AchievementMode>('dx');
  const [values, setValues] = useState<Record<string, string>>(() => ({
    tap: initialNoteValue(params.tap, '500'), hold: initialNoteValue(params.hold, '100'),
    slide: initialNoteValue(params.slide, '100'), touch: initialNoteValue(params.touch, '0'),
    ...(statistics ? Object.fromEntries(KINDS.map(kind => [kind, String(statistics.counts[kind])])) : {}),
    break: statistics ? String(statistics.counts.break) : initialNoteValue(params.break, '20'), tapGreat: '0', holdGreat: '0',
    ...Object.fromEntries(KINDS.map(kind => [`${kind}MineMiss`, '0'])),
    slideGreat: '0', touchGreat: '0', breakGreat: '0',
  }));
  const [analysisMode, setAnalysisMode] = useState<NoteAnalysisMode>('hundredOneMinus');
  const [target, setTarget] = useState('100');
  const targetNumber = Number(target);
  const notes = useMemo(() => Object.fromEntries(KINDS.map((kind) => [kind, Number(values[kind]) + mineCounts[kind]])) as unknown as NoteCounts,
    [values, mineCounts]);
  const maximum = useMemo(() => { try { return calculateAchievement(notes, {}, scoringMode); } catch { return 0; } }, [notes, scoringMode]);
  const targetError = target.trim() === '' || !Number.isFinite(targetNumber) || targetNumber < 0 || targetNumber > maximum ? `目标达成率必须在 0% 到 ${maximum.toFixed(4)}% 之间` : null;
  const computed = useMemo(() => {
    try {
      for (const kind of KINDS) {
        if (Number(values[`${kind}Great`]) > Number(values[kind]) || Number(values[`${kind}MineMiss`]) > mineCounts[kind]) throw new Error('判定数量超过物量');
      }
      const achievement = calculateAchievement(notes, {
        tap: { great: Number(values.tapGreat), miss: Number(values.tapMineMiss) }, hold: { great: Number(values.holdGreat), miss: Number(values.holdMineMiss) },
        slide: { great: Number(values.slideGreat), miss: Number(values.slideMineMiss) }, touch: { great: Number(values.touchGreat), miss: Number(values.touchMineMiss) },
        break: { great1: Number(values.breakGreat), miss: Number(values.breakMineMiss) },
      }, scoringMode);
      return { achievement, error: null };
    } catch { return { achievement: null, error: '输入无效，请检查各项数值。' }; }
  }, [notes, values, scoringMode, mineCounts]);
  const set = (key: string) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  return <ScrollView style={[styles.page, { backgroundColor: theme.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Stack.Screen options={{ title: '达成率与容错' }} />
    {dualMode ? <View style={styles.modeRow}>{(['dx', 'classic'] as const).map(mode => <Pressable key={mode} accessibilityRole="button" accessibilityState={{ selected: scoringMode === mode }} onPress={() => setScoringMode(mode)} style={[styles.modeButton, { backgroundColor: scoringMode === mode ? theme.accent : theme.surface }]}><Text style={{ color: scoringMode === mode ? '#FFFFFF' : theme.text }}>{mode === 'dx' ? 'DX' : 'Classic'}</Text></Pressable>)}</View> : null}
    <Card><Text style={[styles.heading, { color: theme.text }]}>谱面物量</Text><View style={styles.wrap}>{KINDS.map((kind) => <View key={kind} style={styles.small}><FormField label={kind.toUpperCase()} value={values[kind]} onChangeText={set(kind)} /></View>)}{dualMode ? <Pressable style={styles.small} accessibilityRole="button" accessibilityLabel="编辑 MINE 物量" onPress={() => setMineOpen(!mineOpen)}><Text style={{ color: theme.text }}>MINE</Text><Text style={{ color: theme.text }}>{Object.values(mineCounts).reduce((a, b) => a + b, 0)}</Text></Pressable> : null}</View>{mineOpen ? <View style={styles.wrap}>{KINDS.map(kind => <View key={kind} style={styles.small}><FormField label={`MINE · ${kind.toUpperCase()}`} value={String(mineCounts[kind])} onChangeText={value => setMineCounts(current => ({ ...current, [kind]: Number(value) }))} /></View>)}</View> : null}</Card>
    <Card><Text style={[styles.heading, { color: theme.text }]}>物量分析</Text>
      <View style={styles.modeRow}>{MODE_OPTIONS.map((option) => <Pressable key={option.mode}
        accessibilityRole="button" accessibilityLabel={`物量分析模式 ${option.label}`}
        accessibilityState={{ selected: analysisMode === option.mode }} onPress={() => setAnalysisMode(option.mode)}
        style={[styles.modeButton, { backgroundColor: theme.surface, borderColor: theme.border }, analysisMode === option.mode && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
        <Text style={[styles.modeButtonText, { color: theme.textSecondary }, analysisMode === option.mode && styles.modeButtonTextActive]}>{option.mode === 'hundredOneMinus' && dualMode ? `${maximum.toFixed(4)}%-` : option.label}</Text>
      </Pressable>)}</View>
      <Text style={[styles.note, { color: theme.textMuted }]}>{dualMode && analysisMode === 'hundredOneMinus' ? `从理论 ${maximum.toFixed(4)}% 扣除损失` : MODE_OPTIONS.find((option) => option.mode === analysisMode)?.detail}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableScroll}>
        <View accessibilityLabel="物量分析表" style={[styles.analysisTable, tableChrome.table]}>
          <View style={[styles.tableRow, styles.tableHeaderRow, tableChrome.row, tableChrome.headerRow]}><TableCell cellStyle={styles.kindCell} textStyle={styles.tableHeader}>NOTE</TableCell>
            {ANALYSIS_COLUMNS.map((column) => <TableCell key={column} cellStyle={styles.analysisCell} textStyle={styles.tableHeader}>{ANALYSIS_LABELS[column]}</TableCell>)}
          </View>
          {KINDS.map((kind) => <View key={kind} style={[styles.tableRow, tableChrome.row]}>
            <TableCell cellStyle={[styles.kindCell, tableChrome.kindCell]} textStyle={styles.kindText}>{kind.toUpperCase()}</TableCell>
            {ANALYSIS_COLUMNS.map((column) => {
              try {
                const judgments = kind === 'break' ? BREAK_ANALYSIS_JUDGMENTS[column] : NORMAL_ANALYSIS_JUDGMENTS[column];
                const valuesForCell = judgments.map((judgment) => {
                  const value = formatAnalysisValue(singleNoteAnalysis(notes, kind, judgment, analysisMode, scoringMode));
                  const label = kind === 'break' ? BREAK_JUDGMENT_LABEL[judgment as BreakJudgment] : undefined;
                  return label ? `${label} ${value}` : value;
                });
                return <TableCell key={column} accessibilityLabel={`${kind.toUpperCase()} ${ANALYSIS_LABELS[column].replace('\n', ' ')} ${MODE_OPTIONS.find((item) => item.mode === analysisMode)?.label}`}
                  cellStyle={styles.analysisCell} textStyle={styles.tableValue}>{valuesForCell.join('\n')}</TableCell>;
              } catch {
                return <TableCell key={column} cellStyle={styles.analysisCell} textStyle={styles.tableError}>—</TableCell>;
              }
            })}
          </View>)}
          {dualMode ? <View style={[styles.tableRow, tableChrome.row]}><TableCell cellStyle={styles.kindCell} textStyle={styles.kindText}>MINE</TableCell>{ANALYSIS_COLUMNS.map(column => <TableCell key={column} cellStyle={styles.analysisCell} textStyle={styles.tableValue}>{KINDS.filter(kind => mineCounts[kind] > 0).map(kind => {
            if (column !== 'criticalPerfect' && column !== 'miss') return `${kind.toUpperCase()} —`;
            try { return `${kind.toUpperCase()} ${formatAnalysisValue(singleNoteAnalysis(notes, kind, column === 'miss' ? 'miss' : kind === 'break' ? 'criticalPerfect' : 'perfect', analysisMode, scoringMode))}`; } catch { return '—'; }
          }).join('\n') || '—'}</TableCell>)}</View> : null}
        </View>
      </ScrollView>
      <Text style={[styles.swipeHint, { color: theme.textMuted }]}>↔ 左右滑动查看完整表格</Text>
    </Card>
    <Card><Text style={[styles.heading, { color: theme.text }]}>已知判定（各类 GREAT；BREAK 按 GREAT-1）</Text><View style={styles.wrap}>{KINDS.map((kind) => <View key={kind} style={styles.small}><FormField label={`${kind.toUpperCase()} GREAT`} value={values[`${kind}Great`]} onChangeText={set(`${kind}Great`)} /></View>)}</View>
      {dualMode ? <View style={styles.wrap}>{KINDS.filter(kind => mineCounts[kind] > 0).map(kind => <View key={kind} style={styles.small}><FormField label={`MINE · ${kind.toUpperCase()} MISS`} value={values[`${kind}MineMiss`]} onChangeText={set(`${kind}MineMiss`)} /></View>)}</View> : null}
      <Text style={computed.error ? styles.error : [styles.result, { color: theme.success }]}>{computed.error ?? `预计达成率 ${computed.achievement?.toFixed(4)}%`}</Text></Card>
    <Card><Text style={[styles.heading, { color: theme.text }]}>容错计算 - 目标达成率</Text><FormField label="目标达成率" value={target} onChangeText={setTarget} />
      <View style={styles.targetRow}>{TARGET_SHORTCUTS.map((value) => <Pressable key={value}
        accessibilityRole="button" accessibilityLabel={`目标达成率 ${value}%`} accessibilityState={{ selected: target === value }}
        onPress={() => setTarget(value)} style={[styles.targetButton, { backgroundColor: theme.surface, borderColor: theme.border }, target === value && { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
        <Text style={[styles.targetButtonText, { color: theme.textSecondary }, target === value && { color: theme.accent }]}>{value}%</Text>
      </Pressable>)}</View>
      <Text style={[styles.note, { color: theme.textMuted }]}>数值表示只出现该类同级判定、其余 Note 均为 CRITICAL PERFECT 时允许的最大数量。</Text>
      {targetError ? <Text style={styles.error}>{targetError}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableScroll}>
        <View accessibilityLabel="容错计算表" style={[styles.toleranceTable, tableChrome.table]}>
          <View style={[styles.tableRow, styles.tableHeaderRow, tableChrome.row, tableChrome.headerRow]}><TableCell cellStyle={styles.kindCell} textStyle={styles.tableHeader}>NOTE</TableCell>
            {TOLERANCE_COLUMNS.map((column) => <TableCell key={column} cellStyle={styles.toleranceCell} textStyle={styles.tableHeader}>{column.toUpperCase()}</TableCell>)}
          </View>
          {KINDS.map((kind) => <View key={kind} style={[styles.tableRow, tableChrome.row]}>
            <TableCell cellStyle={[styles.kindCell, tableChrome.kindCell]} textStyle={styles.kindText}>{kind.toUpperCase()}</TableCell>
            {TOLERANCE_COLUMNS.map((column) => {
              if (kind !== 'break' && column === 'perfect') return <TableCell key={column} cellStyle={styles.toleranceCell} textStyle={styles.tableValue}>—</TableCell>;
              try {
                const judgments: readonly (NormalJudgment | BreakJudgment)[] = kind === 'break'
                  ? BREAK_TOLERANCE_JUDGMENTS[column]
                  : [column as NormalJudgment];
                const maximums = judgments.map((judgment) => {
                  const maximum = Math.min(Number(values[kind]), maximumSameErrors(notes, targetNumber, kind, judgment, scoringMode));
                  const label = kind === 'break' ? BREAK_JUDGMENT_LABEL[judgment as BreakJudgment] : undefined;
                  return label ? `${label} ${maximum}` : String(maximum);
                });
                return <TableCell key={column} accessibilityLabel={`${kind.toUpperCase()} ${column.toUpperCase()} 最大容错`}
                  cellStyle={styles.toleranceCell} textStyle={styles.tableValue}>{maximums.join('\n')}</TableCell>;
              } catch {
                return <TableCell key={column} cellStyle={styles.toleranceCell} textStyle={styles.tableError}>—</TableCell>;
              }
            })}
          </View>)}
          {dualMode ? <View style={[styles.tableRow, tableChrome.row]}><TableCell cellStyle={styles.kindCell} textStyle={styles.kindText}>MINE</TableCell>{TOLERANCE_COLUMNS.map(column => <TableCell key={column} cellStyle={styles.toleranceCell} textStyle={styles.tableValue}>{column !== 'miss' ? '—' : KINDS.filter(kind => mineCounts[kind] > 0).map(kind => {
            try { return `${kind.toUpperCase()} ${Math.min(mineCounts[kind], maximumSameErrors(notes, targetNumber, kind, 'miss', scoringMode))}`; } catch { return '—'; }
          }).join('\n') || '—'}</TableCell>)}</View> : null}
        </View>
      </ScrollView>
      <Text style={[styles.swipeHint, { color: theme.textMuted }]}>↔ 左右滑动查看完整表格</Text>
    </Card><Text style={[styles.disclaimer, { color: theme.textMuted }]}>结果用于估算；BREAK 细分判定会分别计算基础分与奖励分。</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 16, gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, small: { minWidth: 95, flexGrow: 1, flexBasis: '30%' },
  heading: { fontWeight: '700', color: '#111827', marginBottom: 10 },
  result: { fontSize: 18, fontWeight: '700', color: '#166534', marginTop: 12 },
  error: { color: '#B91C1C', marginTop: 7 }, note: { color: '#6B7280', fontSize: 12, marginVertical: 9, lineHeight: 18 },
  modeRow: { flexDirection: 'row', gap: 8 }, modeButton: { flex: 1, alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 9, backgroundColor: '#FFFFFF' },
  modeButtonActive: { backgroundColor: '#5967C9', borderColor: '#5967C9' }, modeButtonText: { color: '#475569', fontWeight: '700' }, modeButtonTextActive: { color: '#FFFFFF' },
  targetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 }, targetButton: { flexGrow: 1, minWidth: 68, alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 8, paddingHorizontal: 8, backgroundColor: '#FFFFFF' },
  targetButtonActive: { backgroundColor: '#E0E7FF', borderColor: '#5967C9' }, targetButtonText: { color: '#475569', fontWeight: '700', fontSize: 12 }, targetButtonTextActive: { color: '#3949AB' },
  tableScroll: { paddingBottom: 2 }, analysisTable: { width: 650, borderWidth: StyleSheet.hairlineWidth, borderColor: '#CBD5E1', borderRadius: 9, overflow: 'hidden' },
  toleranceTable: { width: 490, borderWidth: StyleSheet.hairlineWidth, borderColor: '#CBD5E1', borderRadius: 9, overflow: 'hidden' },
  tableRow: { minHeight: 52, flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  tableHeaderRow: { minHeight: 45, backgroundColor: '#F1F5F9' }, tableCell: { paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#E2E8F0' },
  kindCell: { width: 76 }, kindCellBackground: { backgroundColor: '#F8FAFC' }, kindText: { color: '#475569', fontSize: 10, fontWeight: '800' },
  analysisCell: { width: 114 }, toleranceCell: { width: 103 }, tableHeader: { color: '#64748B', fontSize: 9, lineHeight: 11, fontWeight: '800' },
  tableValue: { color: '#253047', fontSize: 10, lineHeight: 13, fontWeight: '700', textAlign: 'center' }, tableError: { color: '#94A3B8', fontSize: 11 },
  swipeHint: { color: '#94A3B8', fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 6 },
  disclaimer: { color: '#6B7280', fontSize: 11, textAlign: 'center' },
});
