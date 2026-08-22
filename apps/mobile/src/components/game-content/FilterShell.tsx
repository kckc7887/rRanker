import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme/app-theme';

/**
 * 六个筛选栏（Maimai / Chunithm / MuseDash / Phigros / Arcade / Tuf）的公共外壳模块：
 * - FilterShell：收起摘要态 + 展开表单态的容器切换，含重置与展开/收起操作；
 * - CollapseToggleAction / ResetFilterButton：原先在六处逐字重复的操作组件；
 * - joinFilterSummary：各游戏 summary builder 共用的「过滤空项后以 · 连接，空则『全部』」骨架；
 * - filterShellStyles：六处逐字相同的公共样式；带 Plain 后缀的变体供底色/颜色由主题内联注入的调用方使用。
 * 游戏差异（无障碍文案前缀、根容器样式变体、行内容）一律经 props 注入，保证各游戏渲染输出不变。
 */

/** summary builder 公共骨架：过滤空项后以「 · 」连接，全空时显示「全部」。 */
export function joinFilterSummary(parts: readonly (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ') || '全部';
}

/** 筛选栏的公共样式与布局变体。 */
export const filterShellStyles = StyleSheet.create({
  /** 带静态底色的展开态根容器。 */
  filterBar: { padding: 16, gap: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  /** 由主题注入底色的展开态根容器。 */
  filterBarPlain: { padding: 16, gap: 10, borderBottomWidth: 1 },
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 36, paddingTop: 1 },
  /** 由主题注入颜色的标签。 */
  filterLabelPlain: { fontSize: 12, fontWeight: '600', width: 36, paddingTop: 1 },
  wideFilterLabel: { width: 44 },
  chipRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  /** 带纵向留白的芯片行。 */
  chipRowPadded: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 1 },
  chipFrame: { borderWidth: 2, borderColor: 'transparent', borderRadius: 999, padding: 2, alignItems: 'center', justifyContent: 'center' },
  roundedChipFrame: { borderRadius: 10 },
  neutralChip: { minHeight: 30, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  neutralChipText: { color: '#374151', fontSize: 12 },
  neutralChipTextActive: { color: '#FFF', fontWeight: '700' },
  rangeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  /** 带静态底色的区间输入框。 */
  rangeInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 0,
    color: '#111827',
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  /** 由主题注入底色的区间输入框。 */
  rangeInputPlain: {
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
  /** 由主题注入颜色的分隔符。 */
  rangeSeparatorPlain: { fontSize: 13, fontWeight: '700' },
});

function CollapseToggleAction({ expanded, label }: { expanded: boolean; label: string }) {
  const theme = useAppTheme();
  return (
    <View style={filterShellStyles.collapseActionRow}>
      <Text style={[filterShellStyles.collapseAction, { color: theme.accent }]}>{label}</Text>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.accent} />
    </View>
  );
}

function ResetFilterButton({ onPress, accessibilityLabel }: {
  onPress: () => void;
  /** 无障碍标签默认「重置筛选」，Chunithm 等传专属文案。 */
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? '重置筛选'} hitSlop={8} onPress={onPress}
      style={({ pressed }) => [filterShellStyles.resetButton, pressed && filterShellStyles.resetButtonPressed]}>
      <Text style={[filterShellStyles.resetButtonText, { color: theme.accent }]}>重置</Text>
    </Pressable>
  );
}

export interface FilterShellProps {
  collapsed: boolean;
  /** 是否允许收起；成绩图片自定义等固定展开场景传 false，仅保留重置。 */
  collapsible?: boolean;
  /** 收起态摘要文本，由各游戏 summary builder 生成。 */
  summary: string;
  /** 展开态根容器样式；默认 filterShellStyles.filterBar，底色内联注入的游戏传 filterBarPlain。 */
  barStyle?: StyleProp<ViewStyle>;
  /** 展开态根容器追加样式（如 Arcade 的 flexShrink 收缩）。 */
  barExtraStyle?: StyleProp<ViewStyle>;
  /** 收起态展开动作的无障碍前缀，拼为「{prefix}，当前 {summary}」；Chunithm 传专属前缀。 */
  expandLabelPrefix?: string;
  /** 收起按钮无障碍标签，默认「收起筛选」。 */
  collapseLabel?: string;
  /** 重置按钮无障碍标签，默认「重置筛选」。 */
  resetLabel?: string;
  onCollapsedChange: (collapsed: boolean) => void;
  /** 收起动作；需联动清理（如关闭下拉）的调用方自行包装，默认直接收起。 */
  onCollapse?: () => void;
  onReset: () => void;
  children: ReactNode;
}

/** 筛选栏公共外壳：收起态渲染摘要行，展开态渲染「筛选」头部 + 各游戏行内容插槽。 */
export function FilterShell({
  collapsed,
  collapsible = true,
  summary,
  barStyle = filterShellStyles.filterBar,
  barExtraStyle,
  expandLabelPrefix = '展开筛选',
  collapseLabel = '收起筛选',
  resetLabel = '重置筛选',
  onCollapsedChange,
  onCollapse,
  onReset,
  children,
}: FilterShellProps) {
  const theme = useAppTheme();
  if (collapsible && collapsed) {
    return (
      <View style={[filterShellStyles.collapsedBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${expandLabelPrefix}，当前 ${summary}`}
          accessibilityState={{ expanded: false }} onPress={() => onCollapsedChange(false)}
          style={filterShellStyles.collapsedMain}>
          <Text style={[filterShellStyles.collapsedLabel, { color: theme.textMuted }]}>筛选</Text>
          <Text numberOfLines={1} style={[filterShellStyles.collapsedSummary, { color: theme.text }]}>{summary}</Text>
        </Pressable>
        <View style={filterShellStyles.headerActions}>
          <ResetFilterButton onPress={onReset} accessibilityLabel={resetLabel} />
          <Pressable accessible={false} hitSlop={8} onPress={() => onCollapsedChange(false)}
            style={filterShellStyles.headerAction}>
            <CollapseToggleAction expanded={false} label="展开" />
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={[barStyle, ...(barExtraStyle ? [barExtraStyle] : []), { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={filterShellStyles.expandedHeader}>
        <Text style={[filterShellStyles.expandedTitle, { color: theme.text }]}>筛选</Text>
        <View style={filterShellStyles.headerActions}>
          <ResetFilterButton onPress={onReset} accessibilityLabel={resetLabel} />
          {collapsible ? <Pressable accessibilityRole="button" accessibilityLabel={collapseLabel}
            accessibilityState={{ expanded: true }}
            onPress={onCollapse ?? (() => onCollapsedChange(true))} hitSlop={8}
            style={filterShellStyles.headerAction}>
            <CollapseToggleAction expanded label="收起" />
          </Pressable> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/** 中性筛选芯片。 */
export function NeutralChip({ label, active, onPress, accessibilityLabel }: {
  label: string; active: boolean; onPress: () => void; accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  return (
    <FilterChipFrame active={active} accessibilityLabel={accessibilityLabel ?? `筛选 ${label}`} onPress={onPress}>
      <View style={[filterShellStyles.neutralChip, { backgroundColor: theme.surface, borderColor: theme.border }, active && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
        <Text style={[filterShellStyles.neutralChipText, { color: theme.textSecondary }, active && filterShellStyles.neutralChipTextActive]}>{label}</Text>
      </View>
    </FilterChipFrame>
  );
}

/** 带选中态描边的筛选芯片外框。 */
export function FilterChipFrame({
  active,
  accessibilityLabel,
  onPress,
  children,
  shape = 'pill',
}: {
  active: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
  shape?: 'pill' | 'rounded';
}) {
  const theme = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }} onPress={onPress}
      style={[filterShellStyles.chipFrame, shape === 'rounded' && filterShellStyles.roundedChipFrame, active && { borderColor: theme.accent }]}>
      {children}
    </Pressable>
  );
}
