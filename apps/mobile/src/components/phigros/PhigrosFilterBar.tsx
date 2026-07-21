import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { PhigrosDifficultyBadge } from '@/components/phigros/PhigrosDifficultyBadge';
import {
  PHIGROS_LEVELS,
  PHIGROS_RANK_FILTERS,
  phigrosLevelLabel,
  phigrosRankFilterLabel,
  type PhigrosRankFilter,
} from '@/domain/phigros-filters';
import type { PhigrosLevel } from '@/domain/phigros';
import { useAppTheme } from '@/theme/app-theme';

type OpenDropdown = 'rank' | null;

export interface PhigrosFilterBarProps {
  collapsed: boolean;
  level: PhigrosLevel | 'all';
  constantMin: string;
  constantMax: string;
  accuracyMin?: string;
  accuracyMax?: string;
  rank?: PhigrosRankFilter | null;
  onCollapsedChange: (collapsed: boolean) => void;
  onLevelChange: (level: PhigrosLevel | 'all') => void;
  onConstantMinChange: (value: string) => void;
  onConstantMaxChange: (value: string) => void;
  onAccuracyMinChange?: (value: string) => void;
  onAccuracyMaxChange?: (value: string) => void;
  onRankChange?: (value: PhigrosRankFilter | null) => void;
  onReset: () => void;
}

export function buildPhigrosFilterSummary({
  level,
  constantMin,
  constantMax,
  accuracyMin,
  accuracyMax,
  rank,
}: Pick<PhigrosFilterBarProps, 'level' | 'constantMin' | 'constantMax' | 'accuracyMin' | 'accuracyMax' | 'rank'>): string {
  return [
    level === 'all' ? null : phigrosLevelLabel(level),
    constantMin || constantMax ? `定数 ${constantMin || '不限'}~${constantMax || '不限'}` : null,
    accuracyMin || accuracyMax ? `准确率 ${accuracyMin || '不限'}~${accuracyMax || '不限'}%` : null,
    rank ? phigrosRankFilterLabel(rank) : null,
  ].filter(Boolean).join(' · ') || '全部';
}

export function PhigrosFilterBar({
  collapsed,
  level,
  constantMin,
  constantMax,
  accuracyMin = '',
  accuracyMax = '',
  rank = null,
  onCollapsedChange,
  onLevelChange,
  onConstantMinChange,
  onConstantMaxChange,
  onAccuracyMinChange,
  onAccuracyMaxChange,
  onRankChange,
  onReset,
}: PhigrosFilterBarProps) {
  const theme = useAppTheme();
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const showAccuracyRange = onAccuracyMinChange !== undefined && onAccuracyMaxChange !== undefined;
  const showRankPicker = onRankChange !== undefined;
  const rankLabel = phigrosRankFilterLabel(rank);

  const setDropdownOpen = (id: OpenDropdown) => (open: boolean) => {
    setOpenDropdown(open ? id : null);
  };

  const handleReset = () => {
    setOpenDropdown(null);
    onReset();
  };

  const rankOptions = useMemo<FilterSelectOption<PhigrosRankFilter | 'all'>[]>(() => [
    { value: 'all', label: '全部' },
    ...PHIGROS_RANK_FILTERS.map((item) => ({ value: item.value, label: item.label })),
  ], []);

  const summary = buildPhigrosFilterSummary({
    level, constantMin, constantMax, accuracyMin, accuracyMax, rank,
  });

  if (collapsed) {
    return (
      <View style={[styles.collapsedBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`展开筛选，当前 ${summary}`}
          accessibilityState={{ expanded: false }} onPress={() => onCollapsedChange(false)}
          style={styles.collapsedMain}>
          <Text style={[styles.collapsedLabel, { color: theme.textMuted }]}>筛选</Text>
          <Text numberOfLines={1} style={[styles.collapsedSummary, { color: theme.text }]}>{summary}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <ResetFilterButton onPress={handleReset} />
          <Pressable accessible={false} hitSlop={8} onPress={() => onCollapsedChange(false)}
            style={styles.headerAction}>
            <CollapseToggleAction expanded={false} label="展开" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.filterBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.expandedHeader}>
        <Text style={[styles.expandedTitle, { color: theme.text }]}>筛选</Text>
        <View style={styles.headerActions}>
          <ResetFilterButton onPress={handleReset} />
          <Pressable accessibilityRole="button" accessibilityLabel="收起筛选" accessibilityState={{ expanded: true }}
            onPress={() => { setOpenDropdown(null); onCollapsedChange(true); }} hitSlop={8}
            style={styles.headerAction}>
            <CollapseToggleAction expanded label="收起" />
          </Pressable>
        </View>
      </View>

      <View style={styles.filterRow}>
        <Text style={[styles.filterLabel, { color: theme.textMuted }]}>难度</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <NeutralChip label="全部" active={level === 'all'} onPress={() => onLevelChange('all')} />
          {PHIGROS_LEVELS.map((item) => {
            const active = level === item;
            return (
              <FilterChipFrame key={item} active={active}
                accessibilityLabel={`筛选难度 ${phigrosLevelLabel(item)}`}
                onPress={() => onLevelChange(item)}>
                <PhigrosDifficultyBadge levelIndex={item} constant={0} showConstant={false} />
              </FilterChipFrame>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.filterRow}>
        <Text style={[styles.filterLabel, showAccuracyRange && styles.wideFilterLabel, { color: theme.textMuted }]}>定数</Text>
        <View style={styles.rangeRow}>
          <TextInput accessibilityLabel="最低定数" autoCorrect={false} keyboardType="decimal-pad"
            placeholder="下限" placeholderTextColor={theme.textMuted} value={constantMin} onChangeText={onConstantMinChange}
            style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
          <Text style={styles.rangeSeparator}>~</Text>
          <TextInput accessibilityLabel="最高定数" autoCorrect={false} keyboardType="decimal-pad"
            placeholder="上限" placeholderTextColor={theme.textMuted} value={constantMax} onChangeText={onConstantMaxChange}
            style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
        </View>
      </View>

      {showAccuracyRange ? (
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, styles.wideFilterLabel, { color: theme.textMuted }]}>准确率</Text>
          <View style={styles.rangeRow}>
            <TextInput accessibilityLabel="最低准确率" autoCorrect={false} keyboardType="decimal-pad"
              placeholder="下限" placeholderTextColor={theme.textMuted} value={accuracyMin} onChangeText={onAccuracyMinChange}
              style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
            <Text style={styles.rangeSeparator}>~</Text>
            <TextInput accessibilityLabel="最高准确率" autoCorrect={false} keyboardType="decimal-pad"
              placeholder="上限" placeholderTextColor={theme.textMuted} value={accuracyMax} onChangeText={onAccuracyMaxChange}
              style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
          </View>
        </View>
      ) : null}

      {showRankPicker ? (
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, styles.wideFilterLabel, { color: theme.textMuted }]}>评价</Text>
          <View style={styles.dropdownControls}>
            <FilterAnchoredDropdown
              open={openDropdown === 'rank'}
              onOpenChange={setDropdownOpen('rank')}
              valueLabel={rankLabel}
              accessibilityLabel={`评价筛选，当前 ${rankLabel}`}
              options={rankOptions}
              selectedValue={rank ?? 'all'}
              optionAccessibilityPrefix="选择评价"
              onSelect={(value) => onRankChange(value === 'all' ? null : value)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CollapseToggleAction({ expanded, label }: { expanded: boolean; label: string }) {
  const theme = useAppTheme();
  return (
    <View style={styles.collapseActionRow}>
      <Text style={[styles.collapseAction, { color: theme.accent }]}>{label}</Text>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.accent} />
    </View>
  );
}

function ResetFilterButton({ onPress }: { onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="重置筛选" hitSlop={8} onPress={onPress}
      style={({ pressed }) => [styles.resetButton, pressed && styles.resetButtonPressed]}>
      <Text style={[styles.resetButtonText, { color: theme.accent }]}>重置</Text>
    </Pressable>
  );
}

function NeutralChip({ label, active, onPress, accessibilityLabel }: {
  label: string; active: boolean; onPress: () => void; accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  return (
    <FilterChipFrame active={active} accessibilityLabel={accessibilityLabel ?? `筛选 ${label}`} onPress={onPress}>
      <View style={[styles.neutralChip, { backgroundColor: theme.surface, borderColor: theme.border }, active && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
        <Text style={[styles.neutralChipText, { color: theme.textSecondary }, active && styles.neutralChipTextActive]}>{label}</Text>
      </View>
    </FilterChipFrame>
  );
}

function FilterChipFrame({
  active,
  accessibilityLabel,
  onPress,
  children,
}: {
  active: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }} onPress={onPress}
      style={[styles.chipFrame, active && { borderColor: theme.accent }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterBar: { padding: 16, gap: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 36, paddingTop: 1 },
  wideFilterLabel: { width: 44 },
  chipRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chipFrame: { borderWidth: 2, borderColor: 'transparent', borderRadius: 10, padding: 2, alignItems: 'center', justifyContent: 'center' },
  neutralChip: { minHeight: 30, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  neutralChipText: { color: '#374151', fontSize: 12 },
  neutralChipTextActive: { color: '#FFF', fontWeight: '700' },
  dropdownControls: { flex: 1, minWidth: 0 },
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
  rangeSeparator: { color: '#6B7280', fontSize: 13, fontWeight: '700' },
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
});
