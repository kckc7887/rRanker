import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { FilterChipFrame, FilterShell, NeutralChip, filterShellStyles, joinFilterSummary } from '@/components/game-content/FilterShell';
import { MetricFilterRangeRow, MetricFilterSelectRows } from '@/components/game-content/MetricFilterRows';
import type { RangeBounds } from '@/components/game-content/RangeSelector';
import type { FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { RizlineDifficultyBadge } from '@/components/rizline/RizlineScoreVisuals';
import { RIZLINE_DIFFICULTIES } from '@/domain/rizline';
import type { RizlineFilters } from '@/domain/rizline-filters';
import { useAppTheme } from '@/theme/app-theme';

const DIFFICULTIES = [...RIZLINE_DIFFICULTIES].reverse();

export type RizlineFilterControls = RizlineFilters & {
  collapsed: boolean; setCollapsed: (value: boolean) => void;
  setDifficulty: (value: RizlineFilters['difficulty']) => void; setPackId: (value: string) => void;
  setConstantMin: (value: string) => void; setConstantMax: (value: string) => void; clearFilters: () => void;
};

export function RizlineFilterBar({ filter, packs, constantBounds = { minimum: 1, maximum: 16 } }: {
  filter: RizlineFilterControls; packs: readonly FilterSelectOption[]; constantBounds?: RangeBounds;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState<string | null>(null);
  const summary = joinFilterSummary([
    filter.difficulty === 'all' ? null : filter.difficulty,
    filter.packId === 'all' ? null : packs.find((pack) => pack.value === filter.packId)?.label,
    filter.constantMin || filter.constantMax ? `定数 ${filter.constantMin || '不限'}~${filter.constantMax || '不限'}` : null,
  ]);
  return <FilterShell collapsed={filter.collapsed} summary={summary} onCollapsedChange={filter.setCollapsed}
    onCollapse={() => { setOpen(null); filter.setCollapsed(true); }} onReset={() => { setOpen(null); filter.clearFilters(); }}>
    <View style={filterShellStyles.filterRow}>
      <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>难度</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={filterShellStyles.chipRow}>
        <NeutralChip label="全部" accessibilityLabel="筛选难度 全部" active={filter.difficulty === 'all'} onPress={() => filter.setDifficulty('all')} />
        {DIFFICULTIES.map((difficulty) => <FilterChipFrame key={difficulty} active={filter.difficulty === difficulty}
          accessibilityLabel={`筛选难度 ${difficulty}`} onPress={() => filter.setDifficulty(filter.difficulty === difficulty ? 'all' : difficulty)}>
          <RizlineDifficultyBadge difficulty={difficulty} />
        </FilterChipFrame>)}
      </ScrollView>
    </View>
    <MetricFilterSelectRows openDropdown={open} onOpenChange={setOpen} rows={[
      { id: 'pack', label: '曲包', value: filter.packId, defaultValue: 'all', options: packs, accessibilityLabel: '选择曲包', optionAccessibilityPrefix: '选择曲包', onChange: filter.setPackId },
    ]} />
    <MetricFilterRangeRow label="定数" accessibilityLabel="Rizline 定数范围" testID="rizline-filter-constant" bounds={constantBounds}
      step={0.1} lowerValue={filter.constantMin} upperValue={filter.constantMax} onLowerValueChange={filter.setConstantMin}
      onUpperValueChange={filter.setConstantMax} formatValue={(value) => value.toFixed(1)} />
  </FilterShell>;
}
