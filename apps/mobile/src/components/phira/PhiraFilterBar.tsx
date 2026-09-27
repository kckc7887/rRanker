import { useState } from 'react';
import { FilterShell, joinFilterSummary } from '@/components/game-content/FilterShell';
import { MetricFilterSelectRows, MetricFilterRangeRow, MetricFilterChoiceRow, type MetricFilterSelectRow } from '@/components/game-content/MetricFilterRows';
import type { RangeBounds } from '@/components/game-content/RangeSelector';
import { PHIRA_RANK_FILTERS, phiraRankFilterLabel, type PhiraRankFilter } from '@/domain/phira-filters';
import { phiraXingLabel, type PhiraXingKind } from '@/domain/phira-score-presentation';
import { PhiraRateBadge, PhiraXingBadge } from './PhiraScoreVisuals';

export function PhiraFilterBar({
  collapsed, collapsible = true, onCollapsedChange, onReset, selectRows = [],
  constantMin, constantMax, onConstantMinChange, onConstantMaxChange, constantBounds = { minimum: 0, maximum: 20 },
  accuracyMin = '', accuracyMax = '', onAccuracyMinChange, onAccuracyMaxChange, accuracyBounds = { minimum: 0, maximum: 100 },
  rank = null, xing = null, onRankChange, onXingChange,
}: {
  collapsed: boolean; collapsible?: boolean; onCollapsedChange: (value: boolean) => void; onReset: () => void;
  selectRows?: readonly MetricFilterSelectRow[];
  constantMin: string; constantMax: string; constantBounds?: RangeBounds;
  onConstantMinChange: (value: string) => void; onConstantMaxChange: (value: string) => void;
  accuracyMin?: string; accuracyMax?: string; accuracyBounds?: RangeBounds;
  onAccuracyMinChange?: (value: string) => void; onAccuracyMaxChange?: (value: string) => void;
  rank?: PhiraRankFilter | null; xing?: PhiraXingKind | null;
  onRankChange?: (value: PhiraRankFilter | null) => void; onXingChange?: (value: PhiraXingKind | null) => void;
}) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const showAccuracyRange = onAccuracyMinChange !== undefined && onAccuracyMaxChange !== undefined;
  const showRankPicker = onRankChange !== undefined;
  const showXingPicker = onXingChange !== undefined;
  const summary = joinFilterSummary([
    constantMin || constantMax ? `定数 ${constantMin || '不限'}~${constantMax || '不限'}` : null,
    accuracyMin || accuracyMax ? `Acc ${accuracyMin || '不限'}~${accuracyMax || '不限'}%` : null,
    rank ? phiraRankFilterLabel(rank) : null,
    xing ? phiraXingLabel(xing) : null,
    ...selectRows.map((row) => row.defaultValue !== undefined && row.value === row.defaultValue ? null
      : `${row.label} ${row.options.find((option) => option.value === row.value)?.label ?? row.value}`),
  ]);
  return <FilterShell collapsed={collapsed} collapsible={collapsible} summary={summary}
    onCollapsedChange={onCollapsedChange} onReset={() => { setOpenDropdown(null); onReset(); }}
    onCollapse={() => { setOpenDropdown(null); onCollapsedChange(true); }}>
    <MetricFilterSelectRows rows={selectRows} openDropdown={openDropdown} onOpenChange={setOpenDropdown} />
      <MetricFilterRangeRow label="定数" wide={showAccuracyRange} accessibilityLabel="Phira 定数范围"
        bounds={constantBounds} step={0.1} lowerValue={constantMin} upperValue={constantMax}
        onLowerValueChange={onConstantMinChange} onUpperValueChange={onConstantMaxChange}
        formatValue={(value) => value.toFixed(1)} testID="phira-filter-constant" />
      {showAccuracyRange ? <MetricFilterRangeRow label="Acc" wide spaced accessibilityLabel="Phira Acc 范围"
        bounds={accuracyBounds} step={0.01} lowerValue={accuracyMin} upperValue={accuracyMax}
        onLowerValueChange={onAccuracyMinChange} onUpperValueChange={onAccuracyMaxChange}
        formatValue={(value) => `${value.toFixed(2)}%`} testID="phira-filter-accuracy" /> : null}
      {showRankPicker ? <MetricFilterChoiceRow label="评价" selected={rank} onSelect={onRankChange}
        emptyLabel="全部" scrollable options={PHIRA_RANK_FILTERS.map((item) => ({
          value: item.value, accessibilityLabel: `筛选评价 ${phiraRankFilterLabel(item.value)}`,
          content: <PhiraRateBadge rate={item.value === 'fc' ? 'v' : item.value} fc={item.value === 'fc'} />,
        }))} /> : null}
      {showXingPicker ? <MetricFilterChoiceRow label="XING" selected={xing} onSelect={onXingChange}
        emptyLabel="关闭" emptyAccessibilityLabel="XING 筛选 关闭" options={([{ value: 'good' }, { value: 'miss' }] as const).map((item) => ({
          value: item.value, accessibilityLabel: `XING 筛选 ${phiraXingLabel(item.value)}`,
          content: <PhiraXingBadge kind={item.value} />,
        }))} /> : null}
  </FilterShell>;
}
