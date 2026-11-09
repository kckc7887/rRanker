import { MetricFilterRangeRow } from '@/components/game-content/MetricFilterRows';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { FilterRow, FilterChipFrame, NeutralChip, FilterShell, filterShellStyles, joinFilterSummary } from '@/components/game-content/FilterShell';
import type { RangeBounds } from '@/components/game-content/RangeSelector';
import { MuseDashBadge } from '@/components/musedash/MuseDashBadges';
import { MuseDashDifficultyBadge } from '@/components/musedash/MuseDashDifficultyBadge';
import { MUSE_DASH_DIFFICULTY_LABELS, museDashAchievementFilterLabel } from '@/domain/muse-dash';

import type { MuseDashDifficultySlot, MuseDashDlcFilter, MuseDashAchievementFilter } from '@/domain/muse-dash';
export type { MuseDashDifficultySlot, MuseDashDlcFilter, MuseDashAchievementFilter } from '@/domain/muse-dash';

const DIFFICULTY_SLOTS: readonly FilterSelectOption<string>[] = [
  { value: 'all', label: '全部' },
  ...MUSE_DASH_DIFFICULTY_LABELS.map((label, index) => ({ value: String(index), label })),
];

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

export function MuseDashFilterBar({
  collapsed, difficultySlot, dlc, constantMin, constantMax, constantBounds = { minimum: 0, maximum: 20 },
  accMin, accMax, achievement, dlcOptions,
  onCollapsedChange, onDifficultySlotChange, onDlcChange,
  onConstantMinChange, onConstantMaxChange, onAccMinChange, onAccMaxChange, onAchievementChange, onReset,
}: {
  collapsed: boolean;
  difficultySlot: MuseDashDifficultySlot;
  dlc: MuseDashDlcFilter;
  constantMin: string;
  constantMax: string;
  constantBounds?: RangeBounds;
  accMin?: string;
  accMax?: string;
  achievement?: MuseDashAchievementFilter;
  dlcOptions: readonly string[];
  onCollapsedChange: (collapsed: boolean) => void;
  onDifficultySlotChange: (slot: MuseDashDifficultySlot) => void;
  onDlcChange: (dlc: MuseDashDlcFilter) => void;
  onConstantMinChange: (value: string) => void;
  onConstantMaxChange: (value: string) => void;
  onAccMinChange?: (value: string) => void;
  onAccMaxChange?: (value: string) => void;
  onAchievementChange?: (achievement: MuseDashAchievementFilter) => void;
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
      <MetricFilterRangeRow label="定数" wide accessibilityLabel="Muse Dash 定数范围" {...constantBounds} step={0.01}
          lowerValue={constantMin} upperValue={constantMax} formatValue={(value) => value.toFixed(2)}
          onLowerValueChange={onConstantMinChange} onUpperValueChange={onConstantMaxChange} />
      {onAccMinChange && onAccMaxChange ? <MetricFilterRangeRow label="达成率" wide accessibilityLabel="Muse Dash 达成率范围" minimum={0} maximum={100} step={0.01}
          lowerValue={accMin ?? ''} upperValue={accMax ?? ''} formatValue={(value) => `${value.toFixed(2)}%`}
          onLowerValueChange={onAccMinChange} onUpperValueChange={onAccMaxChange} /> : null}
      {onAchievementChange ? <FilterRow label="成就">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <NeutralChip label="全部" accessibilityLabel="筛选成就 全部"
            active={achievement === 'all'} onPress={() => onAchievementChange('all')} />
          {(['fc', 'ap'] as const).map((value) => (
            <FilterChipFrame key={value} active={achievement === value}
              accessibilityLabel={`筛选成就 ${value.toUpperCase()}`}
              onPress={() => onAchievementChange(value)}>
              <MuseDashBadge label={value.toUpperCase()} tone={value === 'fc' ? 'achievement-fc' : 'achievement-ap'} />
            </FilterChipFrame>
          ))}
        </ScrollView>
      </FilterRow> : null}
    </FilterShell>
  );
}

const styles = StyleSheet.create({
  chipRow: { gap: 6, alignItems: 'center' },
});
