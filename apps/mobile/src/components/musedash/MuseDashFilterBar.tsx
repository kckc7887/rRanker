import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { FilterChipFrame, NeutralChip } from '@/components/MaimaiFilterBar';
import { MuseDashAchievementBadge } from '@/components/musedash/MuseDashBadges';
import { MuseDashDifficultyBadge } from '@/components/musedash/MuseDashDifficultyBadge';
import { MUSE_DASH_DIFFICULTY_LABELS, museDashAchievementFilterLabel } from '@/domain/muse-dash';
import { useAppTheme } from '@/theme/app-theme';

export type MuseDashDifficultySlot = 'all' | 0 | 1 | 2 | 3 | 4;
export type MuseDashDlcFilter = 'all' | string;
export type MuseDashAchievementFilter = 'all' | 'fc' | 'ap';

const DIFFICULTY_SLOTS: readonly FilterSelectOption<string>[] = [
  { value: 'all', label: '全部' },
  ...MUSE_DASH_DIFFICULTY_LABELS.map((label, index) => ({ value: String(index), label })),
];

/** 收起态摘要（仿 buildMaimaiFilterSummary / buildPhigrosFilterSummary）：仅列出非默认条件，全默认显示「全部」。 */
export function buildMuseDashFilterSummary({
  difficultySlot, dlc, constantMin, constantMax, accMin, accMax, achievement,
}: {
  difficultySlot: MuseDashDifficultySlot;
  dlc: MuseDashDlcFilter;
  constantMin: string;
  constantMax: string;
  accMin?: string;
  accMax?: string;
  achievement?: MuseDashAchievementFilter;
}): string {
  const difficultyLabel = DIFFICULTY_SLOTS.find((item) => item.value === String(difficultySlot))?.label ?? '全部';
  return [
    difficultySlot === 'all' ? null : difficultyLabel,
    dlc === 'all' ? null : dlc,
    constantMin || constantMax ? `定数 ${constantMin || '不限'}~${constantMax || '不限'}` : null,
    accMin || accMax ? `达成率 ${accMin || '不限'}~${accMax || '不限'}%` : null,
    achievement && achievement !== 'all' ? museDashAchievementFilterLabel(achievement) : null,
  ].filter(Boolean).join(' · ') || '全部';
}

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

function FilterRow({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  const theme = useAppTheme();
  return <View style={styles.filterRow}>
    <Text style={[styles.filterLabel, wide && styles.wideFilterLabel, { color: theme.textMuted }]}>{label}</Text>
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
  collapsed, summary, onCollapsedChange, onReset, children,
}: {
  collapsed: boolean;
  summary: string;
  onCollapsedChange: (collapsed: boolean) => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  const theme = useAppTheme();
  if (collapsed) {
    return (
      <View style={[styles.collapsedBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`展开筛选，当前 ${summary}`}
          accessibilityState={{ expanded: false }} onPress={() => onCollapsedChange(false)}
          style={styles.collapsedMain}>
          <Text style={[styles.collapsedLabel, { color: theme.textMuted }]}>筛选</Text>
          <Text numberOfLines={1} style={[styles.collapsedSummary, { color: theme.text }]}>{summary}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <ResetFilterButton onPress={onReset} />
          <Pressable accessible={false} hitSlop={8} onPress={() => onCollapsedChange(false)}
            style={styles.headerAction}>
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
            onPress={() => onCollapsedChange(true)} hitSlop={8}
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
  collapsed, difficultySlot, dlc, constantMin, constantMax, dlcOptions,
  onCollapsedChange, onDifficultySlotChange, onDlcChange,
  onConstantMinChange, onConstantMaxChange, onReset,
}: {
  collapsed: boolean;
  difficultySlot: MuseDashDifficultySlot;
  dlc: MuseDashDlcFilter;
  constantMin: string;
  constantMax: string;
  dlcOptions: readonly string[];
  onCollapsedChange: (collapsed: boolean) => void;
  onDifficultySlotChange: (slot: MuseDashDifficultySlot) => void;
  onDlcChange: (dlc: MuseDashDlcFilter) => void;
  onConstantMinChange: (value: string) => void;
  onConstantMaxChange: (value: string) => void;
  onReset: () => void;
}) {
  const [openDropdown, setOpenDropdown] = useState<'dlc' | null>(null);
  const dlcLabel = dlc === 'all' ? '全部' : dlc;
  const dlcOptionsWithAll: readonly FilterSelectOption<string>[] = [
    { value: 'all', label: '全部' },
    ...dlcOptions.map((title) => ({ value: title, label: title })),
  ];
  const summary = buildMuseDashFilterSummary({
    difficultySlot, dlc, constantMin, constantMax,
  });
  const handleReset = () => {
    setOpenDropdown(null);
    onReset();
  };
  return (
    <FilterShell collapsed={collapsed} summary={summary}
      onCollapsedChange={onCollapsedChange} onReset={handleReset}>
      <FilterRow label="难度">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <NeutralChip label="全部" accessibilityLabel="筛选难度 全部"
            active={difficultySlot === 'all'} onPress={() => onDifficultySlotChange('all')} />
          {MUSE_DASH_DIFFICULTY_LABELS.map((label, index) => (
            <FilterChipFrame key={label} active={difficultySlot === index}
              accessibilityLabel={`筛选难度 ${label}`}
              onPress={() => onDifficultySlotChange(index as MuseDashDifficultySlot)}>
              <MuseDashDifficultyBadge display="label" levelIndex={index} />
            </FilterChipFrame>
          ))}
        </ScrollView>
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
      <FilterRow label="定数" wide>
        <RangeInputs minLabel="最低定数" maxLabel="最高定数" min={constantMin} max={constantMax}
          onMinChange={onConstantMinChange} onMaxChange={onConstantMaxChange} />
      </FilterRow>
    </FilterShell>
  );
}

export function MuseDashRecordsFilterBar({
  collapsed, difficultySlot, dlc, constantMin, constantMax, accMin, accMax, achievement, dlcOptions,
  onCollapsedChange, onDifficultySlotChange, onDlcChange,
  onConstantMinChange, onConstantMaxChange, onAccMinChange, onAccMaxChange, onAchievementChange, onReset,
}: {
  collapsed: boolean;
  difficultySlot: MuseDashDifficultySlot;
  dlc: MuseDashDlcFilter;
  constantMin: string;
  constantMax: string;
  accMin: string;
  accMax: string;
  achievement: MuseDashAchievementFilter;
  dlcOptions: readonly string[];
  onCollapsedChange: (collapsed: boolean) => void;
  onDifficultySlotChange: (slot: MuseDashDifficultySlot) => void;
  onDlcChange: (dlc: MuseDashDlcFilter) => void;
  onConstantMinChange: (value: string) => void;
  onConstantMaxChange: (value: string) => void;
  onAccMinChange: (value: string) => void;
  onAccMaxChange: (value: string) => void;
  onAchievementChange: (achievement: MuseDashAchievementFilter) => void;
  onReset: () => void;
}) {
  const [openDropdown, setOpenDropdown] = useState<'dlc' | null>(null);
  const dlcLabel = dlc === 'all' ? '全部' : dlc;
  const dlcOptionsWithAll: readonly FilterSelectOption<string>[] = [
    { value: 'all', label: '全部' },
    ...dlcOptions.map((title) => ({ value: title, label: title })),
  ];
  const summary = buildMuseDashFilterSummary({
    difficultySlot, dlc, constantMin, constantMax, accMin, accMax, achievement,
  });
  const handleReset = () => {
    setOpenDropdown(null);
    onReset();
  };
  return (
    <FilterShell collapsed={collapsed} summary={summary}
      onCollapsedChange={onCollapsedChange} onReset={handleReset}>
      <FilterRow label="难度">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <NeutralChip label="全部" accessibilityLabel="筛选难度 全部"
            active={difficultySlot === 'all'} onPress={() => onDifficultySlotChange('all')} />
          {MUSE_DASH_DIFFICULTY_LABELS.map((label, index) => (
            <FilterChipFrame key={label} active={difficultySlot === index}
              accessibilityLabel={`筛选难度 ${label}`}
              onPress={() => onDifficultySlotChange(index as MuseDashDifficultySlot)}>
              <MuseDashDifficultyBadge display="label" levelIndex={index} />
            </FilterChipFrame>
          ))}
        </ScrollView>
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
      <FilterRow label="定数" wide>
        <RangeInputs minLabel="最低定数" maxLabel="最高定数" min={constantMin} max={constantMax}
          onMinChange={onConstantMinChange} onMaxChange={onConstantMaxChange} />
      </FilterRow>
      <FilterRow label="达成率" wide>
        <RangeInputs minLabel="最低达成率" maxLabel="最高达成率" min={accMin} max={accMax}
          onMinChange={onAccMinChange} onMaxChange={onAccMaxChange} />
      </FilterRow>
      <FilterRow label="成就">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <NeutralChip label="全部" accessibilityLabel="筛选成就 全部"
            active={achievement === 'all'} onPress={() => onAchievementChange('all')} />
          {(['fc', 'ap'] as const).map((value) => (
            <FilterChipFrame key={value} active={achievement === value}
              accessibilityLabel={`筛选成就 ${value.toUpperCase()}`}
              onPress={() => onAchievementChange(value)}>
              <MuseDashAchievementBadge label={value.toUpperCase()} tone={value === 'fc' ? 'achievement-fc' : 'achievement-ap'} />
            </FilterChipFrame>
          ))}
        </ScrollView>
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
  filterLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 36, paddingTop: 1 },
  wideFilterLabel: { width: 44 },
  chipRow: { gap: 6, alignItems: 'center' },
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
