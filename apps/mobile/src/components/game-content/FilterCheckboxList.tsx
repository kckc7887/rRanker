import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';

export type FilterCheckboxOption<T extends string> = FilterSelectOption<T>;

export function FilterCheckboxList<T extends string>({
  open,
  onOpenChange,
  valueLabel,
  caption,
  accessibilityLabel,
  options,
  selectedValues,
  onValuesChange,
  optionAccessibilityPrefix,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  valueLabel: string;
  caption?: string;
  accessibilityLabel: string;
  options: readonly FilterCheckboxOption<T>[];
  selectedValues: readonly T[];
  onValuesChange: (values: T[]) => void;
  optionAccessibilityPrefix: string;
}) {
  return (
    <FilterAnchoredDropdown<T>
      open={open}
      onOpenChange={onOpenChange}
      valueLabel={valueLabel}
      caption={caption}
      accessibilityLabel={accessibilityLabel}
      options={options}
      selectedValue={options[0]?.value ?? ('' as T)}
      onSelect={() => undefined}
      optionAccessibilityPrefix={optionAccessibilityPrefix}
      multiple
      selectedValues={selectedValues}
      onValuesChange={onValuesChange}
    />
  );
}
