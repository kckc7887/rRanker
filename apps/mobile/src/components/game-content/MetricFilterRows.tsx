import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { useAppTheme } from '@/theme/app-theme';
import { FilterChipFrame, NeutralChip, filterShellStyles } from './FilterShell';
import { RangeSelector, type RangeBounds } from './RangeSelector';

export type MetricFilterSelectRow = {
  id: string; label: string; value: string; defaultValue?: string; options: readonly FilterSelectOption[];
  accessibilityLabel: string; optionAccessibilityPrefix: string; onChange: (value: string) => void;
};

export function MetricFilterSelectRows({ rows, openDropdown, onOpenChange }: {
  rows: readonly MetricFilterSelectRow[]; openDropdown: string | null; onOpenChange: (id: string | null) => void;
}) {
  const theme = useAppTheme();
  return <>{rows.map((row) => {
    const dropdownId = `select:${row.id}`;
    const valueLabel = row.options.find((option) => option.value === row.value)?.label ?? row.value;
    return <View key={row.id} style={filterShellStyles.filterRow}>
      <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>{row.label}</Text>
      <FilterAnchoredDropdown accessibilityLabel={`${row.accessibilityLabel}，当前 ${valueLabel}`}
        onOpenChange={(open) => onOpenChange(open ? dropdownId : null)} onSelect={row.onChange}
        open={openDropdown === dropdownId} optionAccessibilityPrefix={row.optionAccessibilityPrefix}
        options={row.options} selectedValue={row.value} valueLabel={valueLabel} />
    </View>;
  })}</>;
}

export function MetricFilterRangeRow({ label, wide = false, spaced = false, bounds, ...range }: {
  label: string; wide?: boolean; spaced?: boolean; bounds: RangeBounds;
  accessibilityLabel: string; testID: string; step: number; lowerValue: string; upperValue: string;
  onLowerValueChange: (value: string) => void; onUpperValueChange: (value: string) => void;
  formatValue: (value: number) => string;
}) {
  const theme = useAppTheme();
  return <View style={spaced ? [filterShellStyles.filterRow, styles.spacedRow] : filterShellStyles.filterRow}>
    <Text style={[filterShellStyles.filterLabel, wide && filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>{label}</Text>
    <RangeSelector {...range} minimum={bounds.minimum} maximum={bounds.maximum} />
  </View>;
}

export function MetricFilterChoiceRow<T extends string>({ label, selected, onSelect, options, emptyLabel, emptyAccessibilityLabel, scrollable = false }: {
  label: string; selected: T | null; onSelect: (value: T | null) => void;
  options: readonly { value: T; accessibilityLabel: string; content: ReactNode }[];
  emptyLabel: string; emptyAccessibilityLabel?: string; scrollable?: boolean;
}) {
  const theme = useAppTheme();
  const chips = <><NeutralChip label={emptyLabel} accessibilityLabel={emptyAccessibilityLabel}
    active={selected === null} onPress={() => onSelect(null)} />
    {options.map((item) => <FilterChipFrame key={item.value} active={selected === item.value} shape="rounded"
      accessibilityLabel={item.accessibilityLabel} onPress={() => onSelect(item.value)}>{item.content}</FilterChipFrame>)}</>;
  return <View style={filterShellStyles.filterRow}>
    <Text style={[filterShellStyles.filterLabel, filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>{label}</Text>
    {scrollable ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}
      contentContainerStyle={filterShellStyles.chipRowPadded}>{chips}</ScrollView>
      : <View style={filterShellStyles.chipRowPadded}>{chips}</View>}
  </View>;
}

const styles = StyleSheet.create({ spacedRow: { marginBottom: 14 }, chipScroll: { flexGrow: 0, flexShrink: 1 } });
