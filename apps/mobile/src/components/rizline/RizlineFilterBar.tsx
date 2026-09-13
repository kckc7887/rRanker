import { useState } from 'react';
import { FilterShell, joinFilterSummary } from '@/components/game-content/FilterShell';
import { MetricFilterRangeRow, MetricFilterSelectRows } from '@/components/game-content/MetricFilterRows';
import type { RangeBounds } from '@/components/game-content/RangeSelector';
import type { FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import type { RizlineFilters } from '@/domain/rizline-filters';

export type RizlineFilterControls = RizlineFilters & {
  collapsed: boolean; setCollapsed: (value: boolean) => void;
  setDifficulty: (value: RizlineFilters['difficulty']) => void; setPackId: (value: string) => void;
  setConstantMin: (value: string) => void; setConstantMax: (value: string) => void; clearFilters: () => void;
};

export function RizlineFilterBar({ filter, packs, constantBounds = { minimum: 1, maximum: 16 } }: {
  filter: RizlineFilterControls; packs: readonly FilterSelectOption[]; constantBounds?: RangeBounds;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const summary = joinFilterSummary([
    filter.difficulty === 'all' ? null : filter.difficulty,
    filter.packId === 'all' ? null : packs.find((pack) => pack.value === filter.packId)?.label,
    filter.constantMin || filter.constantMax ? `定数 ${filter.constantMin || '不限'}~${filter.constantMax || '不限'}` : null,
  ]);
  return <FilterShell collapsed={filter.collapsed} summary={summary} onCollapsedChange={filter.setCollapsed}
    onCollapse={() => { setOpen(null); filter.setCollapsed(true); }} onReset={() => { setOpen(null); filter.clearFilters(); }}>
    <MetricFilterSelectRows openDropdown={open} onOpenChange={setOpen} rows={[
      { id: 'difficulty', label: '难度', value: filter.difficulty, defaultValue: 'all', accessibilityLabel: '选择难度', optionAccessibilityPrefix: '选择难度',
        options: ['all', 'SP', 'AT', 'IN', 'HD', 'EZ'].map((value) => ({ value, label: value === 'all' ? '全部' : value })),
        onChange: (value) => filter.setDifficulty(value as RizlineFilters['difficulty']) },
      { id: 'pack', label: '曲包', value: filter.packId, defaultValue: 'all', options: packs, accessibilityLabel: '选择曲包', optionAccessibilityPrefix: '选择曲包', onChange: filter.setPackId },
    ]} />
    <MetricFilterRangeRow label="定数" accessibilityLabel="Rizline 定数范围" testID="rizline-filter-constant" bounds={constantBounds}
      step={0.1} lowerValue={filter.constantMin} upperValue={filter.constantMax} onLowerValueChange={filter.setConstantMin}
      onUpperValueChange={filter.setConstantMax} formatValue={(value) => value.toFixed(1)} />
  </FilterShell>;
}
