import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@rranker/sdk/components/FilterAnchoredDropdown';
import { FilterRow, FilterChipFrame, NeutralChip, filterShellStyles } from '@rranker/sdk/components/game-content/FilterShell';
import { RangeSelector, type RangeSelectorProps } from '@rranker/sdk/components/game-content/RangeSelector';

export type MetricFilterSelectRow = {
  id: string; label: string; value: string; defaultValue?: string; options: readonly FilterSelectOption[];
  accessibilityLabel: string; optionAccessibilityPrefix: string; onChange: (value: string) => void;
};

export function MetricFilterSelectRows({ rows, openDropdown, onOpenChange }: {
  rows: readonly MetricFilterSelectRow[]; openDropdown: string | null; onOpenChange: (id: string | null) => void;
}) {
  return <>{rows.map((row) => {
    const dropdownId = `select:${row.id}`;
    const valueLabel = row.options.find((option) => option.value === row.value)?.label ?? row.value;
    return <FilterRow label={row.label} key={row.id}>
      <FilterAnchoredDropdown accessibilityLabel={`${row.accessibilityLabel}，当前 ${valueLabel}`}
        onOpenChange={(open) => onOpenChange(open ? dropdownId : null)} onSelect={row.onChange}
        open={openDropdown === dropdownId} optionAccessibilityPrefix={row.optionAccessibilityPrefix}
        options={row.options} selectedValue={row.value} valueLabel={valueLabel} />
    </FilterRow>;
  })}</>;
}

export function MetricFilterRangeRow({ label, wide, spaced, rowTestID, ...range }: RangeSelectorProps & {
  label: string; wide?: boolean; spaced?: boolean; rowTestID?: string;
}) {
  return <FilterRow label={label} wide={wide} style={spaced && styles.spacedRow} testID={rowTestID}>
    <RangeSelector {...range} />
  </FilterRow>;
}

export function MetricFilterChoiceRow<T extends string>({ label, selected, onSelect, options, emptyLabel, emptyAccessibilityLabel, scrollable = false }: {
  label: string; selected: T | null; onSelect: (value: T | null) => void;
  options: readonly { value: T; accessibilityLabel: string; content: ReactNode }[];
  emptyLabel: string; emptyAccessibilityLabel?: string; scrollable?: boolean;
}) {
  const chips = <><NeutralChip label={emptyLabel} accessibilityLabel={emptyAccessibilityLabel}
    active={selected === null} onPress={() => onSelect(null)} />
    {options.map((item) => <FilterChipFrame key={item.value} active={selected === item.value} shape="rounded"
      accessibilityLabel={item.accessibilityLabel} onPress={() => onSelect(item.value)}>{item.content}</FilterChipFrame>)}</>;
  return <FilterRow label={label} wide>
    {scrollable ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}
      contentContainerStyle={filterShellStyles.chipRowPadded}>{chips}</ScrollView>
      : <View style={filterShellStyles.chipRowPadded}>{chips}</View>}
  </FilterRow>;
}

const styles = StyleSheet.create({ spacedRow: { marginBottom: 14 }, chipScroll: { flexGrow: 0, flexShrink: 1 } });
