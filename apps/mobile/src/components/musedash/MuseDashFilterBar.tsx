import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { MUSE_DASH_DIFFICULTY_LABELS } from '@/domain/muse-dash';
import { useAppTheme } from '@/theme/app-theme';

export type MuseDashDifficultySlot = 'all' | 0 | 1 | 2 | 3 | 4;
export type MuseDashDlcFilter = 'all' | string;
export type MuseDashAchievementFilter = 'all' | 'fc' | 'ap';

const DIFFICULTY_SLOTS: readonly FilterSelectOption<string>[] = [
  { value: 'all', label: '全部' },
  ...MUSE_DASH_DIFFICULTY_LABELS.map((label, index) => ({ value: String(index), label })),
];

const ACHIEVEMENT_OPTIONS: readonly FilterSelectOption<MuseDashAchievementFilter>[] = [
  { value: 'all', label: '全部' },
  { value: 'fc', label: 'FC' },
  { value: 'ap', label: 'AP' },
];

function CollapseToggleAction({ expanded, label }: { expanded: boolean; label: string }) {
  const theme = useAppTheme();
  return <View style={styles.collapseActionRow}>
    <Text style={[styles.collapseAction, { color: theme.accent }]}>{label}</Text>
    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.accent} />
  </View>;
}

function ResetFilterButton({ onPress }: { onPress: () => void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="重置筛选" onPress={onPress}
    hitSlop={8} style={({ pressed }) => [styles.resetButton, pressed && styles.resetButtonPressed]}>
    <Text style={[styles.resetButtonText, { color: theme.accent }]}>重置</Text>
  </Pressable>;
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useAppTheme();
  return <View style={styles.filterRow}>
    <Text style={[styles.filterLabel, { color: theme.textMuted }]}>{label}</Text>
    {children}
  </View>;
}

function RangeInputs({
  minLabel, maxLabel, min, max, onMinChange, onMaxChange,
}: {
  minLabel: string;
  maxLabel: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}) {
  const theme = useAppTheme();
  return <View style={styles.rangeRow}>
    <TextInput accessibilityLabel={minLabel} autoCorrect={false} keyboardType="decimal-pad"
      placeholder="下限" placeholderTextColor={theme.textMuted} value={min} onChangeText={onMinChange}
      style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
    <Text style={styles.rangeSeparator}>~</Text>
    <TextInput accessibilityLabel={maxLabel} autoCorrect={false} keyboardType="decimal-pad"
      placeholder="上限" placeholderTextColor={theme.textMuted} value={max} onChangeText={onMaxChange}
      style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
  </View>;
}

function FilterShell({
  expanded, summary, onExpandedChange, onReset, children,
}: {
  expanded: boolean;
  summary: string;
  onExpandedChange: (expanded: boolean) => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  const theme = useAppTheme();
  if (!expanded) {
    return (
      <View style={[styles.collapsedBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`展开筛选，当前 ${summary}`}
          accessibilityState={{ expanded: false }} onPress={() => onExpandedChange(true)}
          style={styles.collapsedMain}>
          <Text style={[styles.collapsedLabel, { color: theme.textMuted }]}>筛选</Text>
          <Text numberOfLines={1} style={[styles.collapsedSummary, { color: theme.text }]}>{summary}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <ResetFilterButton onPress={onReset} />
          <Pressable accessible={false} hitSlop={8} onPress={() => onExpandedChange(true)} style={styles.headerAction}>
            <CollapseToggleAction expanded={false} label="展开" />
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.filterBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.expandedHeader}>
        <Text style={[styles.expandedTitle, { color: theme.text }]}>筛选</Text>
        <View style={styles.headerActions}>
          <ResetFilterButton onPress={onReset} />
          <Pressable accessibilityRole="button" accessibilityLabel="收起筛选"
            accessibilityState={{ expanded: true }}
            onPress={() => { onExpandedChange(false); }} hitSlop={8}
            style={styles.headerAction}>
            <CollapseToggleAction expanded label="收起" />
          </Pressable>
        </View>
      </View>
      {children}
    </View>
  );
}

export function MuseDashCatalogFilterBar({
  expanded, difficultySlot, dlc, constantMin, constantMax, dlcOptions,
  onExpandedChange, onDifficultySlotChange, onDlcChange,
  onConstantMinChange, onConstantMaxChange, onReset,
}: {
  expanded: boolean;
  difficultySlot: MuseDashDifficultySlot;
  dlc: MuseDashDlcFilter;
  constantMin: string;
  constantMax: string;
  dlcOptions: readonly string[];
  onExpandedChange: (expanded: boolean) => void;
  onDifficultySlotChange: (slot: MuseDashDifficultySlot) => void;
  onDlcChange: (dlc: MuseDashDlcFilter) => void;
  onConstantMinChange: (value: string) => void;
  onConstantMaxChange: (value: string) => void;
  onReset: () => void;
}) {
  const [openDropdown, setOpenDropdown] = useState<'difficulty' | 'dlc' | null>(null);
  const difficultyLabel = DIFFICULTY_SLOTS.find((item) => item.value === String(difficultySlot))?.label ?? '全部';
  const dlcLabel = dlc === 'all' ? '全部' : dlc;
  const dlcOptionsWithAll: readonly FilterSelectOption<string>[] = [
    { value: 'all', label: '全部' },
    ...dlcOptions.map((title) => ({ value: title, label: title })),
  ];
  const summary = `难度 ${difficultyLabel} · DLC ${dlcLabel} · 定数 ${constantMin || '?'}~${constantMax || '?'}`;
  return (
    <FilterShell expanded={expanded} summary={summary}
      onExpandedChange={(value) => { setOpenDropdown(null); onExpandedChange(value); }} onReset={onReset}>
      <FilterRow label="难度">
        <FilterAnchoredDropdown
          open={openDropdown === 'difficulty'}
          onOpenChange={(open) => setOpenDropdown(open ? 'difficulty' : null)}
          valueLabel={difficultyLabel}
          accessibilityLabel={`难度筛选，当前 ${difficultyLabel}`}
          options={DIFFICULTY_SLOTS}
          selectedValue={String(difficultySlot)}
          onSelect={(value) => onDifficultySlotChange(value === 'all' ? 'all' : Number(value) as MuseDashDifficultySlot)}
          optionAccessibilityPrefix="选择难度"
        />
      </FilterRow>
      <FilterRow label="DLC">
        <FilterAnchoredDropdown
          open={openDropdown === 'dlc'}
          onOpenChange={(open) => setOpenDropdown(open ? 'dlc' : null)}
          valueLabel={dlcLabel}
          accessibilityLabel={`DLC筛选，当前 ${dlcLabel}`}
          options={dlcOptionsWithAll}
          selectedValue={dlc}
          onSelect={onDlcChange}
          optionAccessibilityPrefix="选择DLC"
        />
      </FilterRow>
      <FilterRow label="定数">
        <RangeInputs minLabel="最低定数" maxLabel="最高定数" min={constantMin} max={constantMax}
          onMinChange={onConstantMinChange} onMaxChange={onConstantMaxChange} />
      </FilterRow>
    </FilterShell>
  );
}

export function MuseDashRecordsFilterBar({
  expanded, difficultySlot, dlc, constantMin, constantMax, accMin, accMax, achievement, dlcOptions,
  onExpandedChange, onDifficultySlotChange, onDlcChange,
  onConstantMinChange, onConstantMaxChange, onAccMinChange, onAccMaxChange, onAchievementChange, onReset,
}: {
  expanded: boolean;
  difficultySlot: MuseDashDifficultySlot;
  dlc: MuseDashDlcFilter;
  constantMin: string;
  constantMax: string;
  accMin: string;
  accMax: string;
  achievement: MuseDashAchievementFilter;
  dlcOptions: readonly string[];
  onExpandedChange: (expanded: boolean) => void;
  onDifficultySlotChange: (slot: MuseDashDifficultySlot) => void;
  onDlcChange: (dlc: MuseDashDlcFilter) => void;
  onConstantMinChange: (value: string) => void;
  onConstantMaxChange: (value: string) => void;
  onAccMinChange: (value: string) => void;
  onAccMaxChange: (value: string) => void;
  onAchievementChange: (achievement: MuseDashAchievementFilter) => void;
  onReset: () => void;
}) {
  const [openDropdown, setOpenDropdown] = useState<'difficulty' | 'dlc' | 'achievement' | null>(null);
  const difficultyLabel = DIFFICULTY_SLOTS.find((item) => item.value === String(difficultySlot))?.label ?? '全部';
  const dlcLabel = dlc === 'all' ? '全部' : dlc;
  const achievementLabel = ACHIEVEMENT_OPTIONS.find((item) => item.value === achievement)?.label ?? '全部';
  const dlcOptionsWithAll: readonly FilterSelectOption<string>[] = [
    { value: 'all', label: '全部' },
    ...dlcOptions.map((title) => ({ value: title, label: title })),
  ];
  const summary = `难度 ${difficultyLabel} · DLC ${dlcLabel} · 定数 ${constantMin || '?'}~${constantMax || '?'} · ACC ${accMin || '?'}~${accMax || '?'} · ${achievementLabel}`;
  return (
    <FilterShell expanded={expanded} summary={summary}
      onExpandedChange={(value) => { setOpenDropdown(null); onExpandedChange(value); }} onReset={onReset}>
      <FilterRow label="难度">
        <FilterAnchoredDropdown
          open={openDropdown === 'difficulty'}
          onOpenChange={(open) => setOpenDropdown(open ? 'difficulty' : null)}
          valueLabel={difficultyLabel}
          accessibilityLabel={`难度筛选，当前 ${difficultyLabel}`}
          options={DIFFICULTY_SLOTS}
          selectedValue={String(difficultySlot)}
          onSelect={(value) => onDifficultySlotChange(value === 'all' ? 'all' : Number(value) as MuseDashDifficultySlot)}
          optionAccessibilityPrefix="选择难度"
        />
      </FilterRow>
      <FilterRow label="DLC">
        <FilterAnchoredDropdown
          open={openDropdown === 'dlc'}
          onOpenChange={(open) => setOpenDropdown(open ? 'dlc' : null)}
          valueLabel={dlcLabel}
          accessibilityLabel={`DLC筛选，当前 ${dlcLabel}`}
          options={dlcOptionsWithAll}
          selectedValue={dlc}
          onSelect={onDlcChange}
          optionAccessibilityPrefix="选择DLC"
        />
      </FilterRow>
      <FilterRow label="定数">
        <RangeInputs minLabel="最低定数" maxLabel="最高定数" min={constantMin} max={constantMax}
          onMinChange={onConstantMinChange} onMaxChange={onConstantMaxChange} />
      </FilterRow>
      <FilterRow label="达成率">
        <RangeInputs minLabel="最低达成率" maxLabel="最高达成率" min={accMin} max={accMax}
          onMinChange={onAccMinChange} onMaxChange={onAccMaxChange} />
      </FilterRow>
      <FilterRow label="成就">
        <FilterAnchoredDropdown
          open={openDropdown === 'achievement'}
          onOpenChange={(open) => setOpenDropdown(open ? 'achievement' : null)}
          valueLabel={achievementLabel}
          accessibilityLabel={`成就筛选，当前 ${achievementLabel}`}
          options={ACHIEVEMENT_OPTIONS}
          selectedValue={achievement}
          onSelect={onAchievementChange}
          optionAccessibilityPrefix="选择成就"
        />
      </FilterRow>
    </FilterShell>
  );
}

const styles = StyleSheet.create({
  collapsedBar: { minHeight: 48, paddingHorizontal: 16, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  collapsedMain: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  collapsedLabel: { fontSize: 12, fontWeight: '700' },
  collapsedSummary: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '600' },
  collapseAction: { fontSize: 12, fontWeight: '800' },
  collapseActionRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  expandedHeader: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  expandedTitle: { fontSize: 13, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerAction: { minHeight: 28, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  resetButton: { minHeight: 28, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  resetButtonPressed: { opacity: 0.62 },
  resetButtonText: { fontSize: 12, fontWeight: '800' },
  filterBar: { padding: 16, gap: 10, borderBottomWidth: 1 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 44, paddingTop: 1 },
  rangeRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  rangeInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  rangeSeparator: { color: '#6B7280', fontSize: 13, fontWeight: '700' },
});
