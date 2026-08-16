import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { FilterChipFrame, NeutralChip } from '@/components/MaimaiFilterBar';
import { FilterShell, filterShellStyles, joinFilterSummary } from '@/components/game-content/FilterShell';
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
  return joinFilterSummary([
    difficultySlot === 'all' ? null : difficultyLabel,
    dlc === 'all' ? null : dlc,
    constantMin || constantMax ? `定数 ${constantMin || '不限'}~${constantMax || '不限'}` : null,
    accMin || accMax ? `达成率 ${accMin || '不限'}~${accMax || '不限'}%` : null,
    achievement && achievement !== 'all' ? museDashAchievementFilterLabel(achievement) : null,
  ]);
}

function FilterRow({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  const theme = useAppTheme();
  return <View style={filterShellStyles.filterRow}>
    <Text style={[filterShellStyles.filterLabel, wide && filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>{label}</Text>
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
      style={[filterShellStyles.rangeInputPlain, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
    <Text style={filterShellStyles.rangeSeparator}>~</Text>
    <TextInput accessibilityLabel={maxLabel} autoCorrect={false} keyboardType="decimal-pad"
      placeholder="上限" placeholderTextColor={theme.textMuted} value={max} onChangeText={onMaxChange}
      style={[filterShellStyles.rangeInputPlain, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
  </View>;
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
    <FilterShell collapsed={collapsed} summary={summary} barStyle={filterShellStyles.filterBarPlain}
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
    <FilterShell collapsed={collapsed} summary={summary} barStyle={filterShellStyles.filterBarPlain}
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

// MuseDash 游戏差异样式保留本地：芯片行作为水平 ScrollView 内容容器（无 flexDirection）；区间行带 minWidth 收缩。
const styles = StyleSheet.create({
  chipRow: { gap: 6, alignItems: 'center' },
  rangeRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
});
