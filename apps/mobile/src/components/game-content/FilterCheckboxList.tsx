import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';

export type FilterCheckboxOption<T extends string> = FilterSelectOption<T>;

/**
 * 带复选框的展开收起列表（公共筛选控件）：
 * 与普通下拉列表一致，仅每个选项前面多一个复选框；勾选即生效、列表不关闭，
 * 没有「完成」按钮与任何头部快捷操作区，点背景或再次点触发器收起。
 * 底层复用公共 FilterAnchoredDropdown 的多选模式（与 MaimaiFilterBar versionMulti 同机制），
 * 触发器展示值标签（调用方拼接选中项摘要，空选传「全部」）。
 */
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
  /** 触发器值标签：调用方拼接选中项（如「推荐难度 · 包括转谱」），空选传「全部」。 */
  valueLabel: string;
  /** 触发器内的小字组名（同单选下拉 caption）。 */
  caption?: string;
  accessibilityLabel: string;
  options: readonly FilterCheckboxOption<T>[];
  selectedValues: readonly T[];
  /** 每次勾选/取消勾选即时回调新数组，不等待关闭。 */
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
      // 多选模式下 selectedValue 不参与展示，仅满足公共组件签名。
      selectedValue={options[0]?.value ?? ('' as T)}
      onSelect={() => undefined}
      optionAccessibilityPrefix={optionAccessibilityPrefix}
      multiple
      selectedValues={selectedValues}
      onValuesChange={onValuesChange}
    />
  );
}
