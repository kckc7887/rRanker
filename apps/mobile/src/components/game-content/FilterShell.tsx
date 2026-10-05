import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme/app-theme';

export function joinFilterSummary(parts: readonly (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ') || '全部';
}

export const filterShellStyles = StyleSheet.create({
  filterBar: { padding: 16, gap: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
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
  filterLabelPlain: { fontSize: 12, fontWeight: '600', width: 36, paddingTop: 1 },
  wideFilterLabel: { width: 44 },
  chipRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chipRowPadded: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 1 },
  chipFrame: { borderWidth: 2, borderColor: 'transparent', borderRadius: 999, padding: 2, alignItems: 'center', justifyContent: 'center' },
  roundedChipFrame: { borderRadius: 10 },
  neutralChip: { minHeight: 30, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  neutralChipText: { color: '#374151', fontSize: 12 },
  neutralChipTextActive: { fontWeight: '700' },
  rangeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
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
  collapsible?: boolean;
  summary: string;
  barStyle?: StyleProp<ViewStyle>;
  barExtraStyle?: StyleProp<ViewStyle>;
  expandLabelPrefix?: string;
  collapseLabel?: string;
  resetLabel?: string;
  onCollapsedChange: (collapsed: boolean) => void;
  onCollapse?: () => void;
  onReset: () => void;
  children: ReactNode;
}

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

export function NeutralChip({ label, active, onPress, accessibilityLabel }: {
  label: string; active: boolean; onPress: () => void; accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  return (
    <FilterChipFrame active={active} accessibilityLabel={accessibilityLabel ?? `筛选 ${label}`} onPress={onPress}>
      <View style={[filterShellStyles.neutralChip, { backgroundColor: theme.surface, borderColor: theme.border }, active && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
        <Text style={[filterShellStyles.neutralChipText, { color: theme.textSecondary }, active && { ...filterShellStyles.neutralChipTextActive, color: theme.onAccent }]}>{label}</Text>
      </View>
    </FilterChipFrame>
  );
}

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
