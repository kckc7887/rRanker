import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PhigrosRateBadge } from '@/components/phigros/PhigrosRateBadge';
import { PhigrosXingBadge } from '@/components/phigros/PhigrosXingBadge';
import {
  PHIGROS_LEVELS,
  PHIGROS_RANK_FILTERS,
  phigrosLevelLabel,
  phigrosRankFilterLabel,
  type PhigrosRankFilter,
} from '@/domain/phigros-filters';
import type { PhigrosLevel } from '@/domain/phigros';
import { phigrosLevelColors } from '@/domain/phigros-level-theme';
import { phigrosXingLabel, type PhigrosXingKind } from '@/domain/phigros-xing';
import { useAppTheme } from '@/theme/app-theme';

const PHIGROS_XING_FILTERS: readonly { value: PhigrosXingKind; label: string }[] = [
  { value: 'good', label: 'Good' },
  { value: 'miss', label: 'Miss' },
];

export interface PhigrosFilterBarProps {
  collapsed: boolean;
  level: PhigrosLevel | 'all';
  constantMin: string;
  constantMax: string;
  accuracyMin?: string;
  accuracyMax?: string;
  rank?: PhigrosRankFilter | null;
  xing?: PhigrosXingKind | null;
  onCollapsedChange: (collapsed: boolean) => void;
  onLevelChange: (level: PhigrosLevel | 'all') => void;
  onConstantMinChange: (value: string) => void;
  onConstantMaxChange: (value: string) => void;
  onAccuracyMinChange?: (value: string) => void;
  onAccuracyMaxChange?: (value: string) => void;
  onRankChange?: (value: PhigrosRankFilter | null) => void;
  onXingChange?: (value: PhigrosXingKind | null) => void;
  onReset: () => void;
}

export function buildPhigrosFilterSummary({
  level,
  constantMin,
  constantMax,
  accuracyMin,
  accuracyMax,
  rank,
  xing,
}: Pick<PhigrosFilterBarProps, 'level' | 'constantMin' | 'constantMax' | 'accuracyMin' | 'accuracyMax' | 'rank' | 'xing'>): string {
  return [
    level === 'all' ? null : phigrosLevelLabel(level),
    constantMin || constantMax ? `定数 ${constantMin || '不限'}~${constantMax || '不限'}` : null,
    accuracyMin || accuracyMax ? `Acc ${accuracyMin || '不限'}~${accuracyMax || '不限'}%` : null,
    rank ? phigrosRankFilterLabel(rank) : null,
    xing ? phigrosXingLabel(xing) : null,
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
  xing = null,
  onCollapsedChange,
  onLevelChange,
  onConstantMinChange,
  onConstantMaxChange,
  onAccuracyMinChange,
  onAccuracyMaxChange,
  onRankChange,
  onXingChange,
  onReset,
}: PhigrosFilterBarProps) {
  const theme = useAppTheme();
  const showAccuracyRange = onAccuracyMinChange !== undefined && onAccuracyMaxChange !== undefined;
  const showRankPicker = onRankChange !== undefined;
  const showXingPicker = onXingChange !== undefined;

  const handleReset = () => {
    onReset();
  };

  const summary = buildPhigrosFilterSummary({
    level, constantMin, constantMax, accuracyMin, accuracyMax, rank, xing,
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
            onPress={() => onCollapsedChange(true)} hitSlop={8}
            style={styles.headerAction}>
            <CollapseToggleAction expanded label="收起" />
          </Pressable>
        </View>
      </View>

      <View style={styles.filterRow}>
        <Text style={[styles.filterLabel, { color: theme.textMuted }]}>难度</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          <NeutralChip label="全部" active={level === 'all'} onPress={() => onLevelChange('all')} />
          {PHIGROS_LEVELS.map((item) => (
            <LevelChip
              key={item}
              level={item}
              active={level === item}
              onPress={() => onLevelChange(item)}
            />
          ))}
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
        <View style={[styles.filterRow, styles.accuracyRow]}>
          <Text style={[styles.filterLabel, styles.wideFilterLabel, { color: theme.textMuted }]}>Acc</Text>
          <View style={styles.rangeRow}>
            <TextInput accessibilityLabel="最低 Acc" autoCorrect={false} keyboardType="decimal-pad"
              placeholder="下限" placeholderTextColor={theme.textMuted} value={accuracyMin} onChangeText={onAccuracyMinChange}
              style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
            <Text style={styles.rangeSeparator}>~</Text>
            <TextInput accessibilityLabel="最高 Acc" autoCorrect={false} keyboardType="decimal-pad"
              placeholder="上限" placeholderTextColor={theme.textMuted} value={accuracyMax} onChangeText={onAccuracyMaxChange}
              style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
          </View>
        </View>
      ) : null}

      {showRankPicker ? (
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, styles.wideFilterLabel, { color: theme.textMuted }]}>评价</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            <NeutralChip label="全部" active={rank === null} onPress={() => onRankChange(null)} />
            {PHIGROS_RANK_FILTERS.map((item) => (
              <RankChip
                key={item.value}
                value={item.value}
                active={rank === item.value}
                onPress={() => onRankChange(item.value)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {showXingPicker ? (
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, styles.wideFilterLabel, { color: theme.textMuted }]}>XING</Text>
          <View style={styles.chipRow}>
            <NeutralChip
              label="关闭"
              accessibilityLabel="XING 筛选 关闭"
              active={xing === null}
              onPress={() => onXingChange(null)}
            />
            {PHIGROS_XING_FILTERS.map((item) => (
              <XingChip
                key={item.value}
                value={item.value}
                active={xing === item.value}
                onPress={() => onXingChange(item.value)}
              />
            ))}
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

export function NeutralChip({ label, active, onPress, accessibilityLabel }: {
  label: string; active: boolean; onPress: () => void; accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  return (
    <FilterChipFrame active={active} shape="pill" accessibilityLabel={accessibilityLabel ?? `筛选 ${label}`} onPress={onPress}>
      <View style={[styles.neutralChip, { backgroundColor: theme.surface, borderColor: theme.border }, active && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
        <Text style={[styles.neutralChipText, { color: theme.textSecondary }, active && styles.neutralChipTextActive]}>{label}</Text>
      </View>
    </FilterChipFrame>
  );
}

export function LevelChip({ level, active, onPress }: {
  level: PhigrosLevel; active: boolean; onPress: () => void;
}) {
  const colors = phigrosLevelColors(level);
  const label = phigrosLevelLabel(level);
  return (
    <FilterChipFrame
      active={active}
      shape="rounded"
      accessibilityLabel={`筛选难度 ${label}`}
      onPress={onPress}
    >
      <View style={[styles.levelChip, { backgroundColor: colors.bg }]}>
        <Text style={[styles.levelChipText, { color: colors.fg }]}>{label}</Text>
      </View>
    </FilterChipFrame>
  );
}

function RankChip({ value, active, onPress }: {
  value: PhigrosRankFilter; active: boolean; onPress: () => void;
}) {
  const badgeRate = value === 'fc' ? 'v' : value;
  const badgeFc = value === 'fc';
  return (
    <FilterChipFrame
      active={active}
      shape="rounded"
      accessibilityLabel={`筛选评价 ${phigrosRankFilterLabel(value)}`}
      onPress={onPress}
    >
      <PhigrosRateBadge rate={badgeRate} fc={badgeFc} />
    </FilterChipFrame>
  );
}

function XingChip({ value, active, onPress }: {
  value: PhigrosXingKind; active: boolean; onPress: () => void;
}) {
  return (
    <FilterChipFrame
      active={active}
      shape="rounded"
      accessibilityLabel={`XING 筛选 ${phigrosXingLabel(value)}`}
      onPress={onPress}
    >
      <PhigrosXingBadge kind={value} />
    </FilterChipFrame>
  );
}

function FilterChipFrame({
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
      style={[styles.chipFrame, shape === 'rounded' && styles.roundedChipFrame, active && { borderColor: theme.accent }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterBar: { padding: 16, gap: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accuracyRow: { marginBottom: 14 },
  filterLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 36, paddingTop: 1 },
  wideFilterLabel: { width: 44 },
  chipScroll: { flexGrow: 0, flexShrink: 1 },
  chipRow: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 1 },
  chipFrame: { borderWidth: 2, borderColor: 'transparent', borderRadius: 999, padding: 2, alignItems: 'center', justifyContent: 'center' },
  roundedChipFrame: { borderRadius: 10 },
  neutralChip: { minHeight: 30, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  neutralChipText: { color: '#374151', fontSize: 12 },
  neutralChipTextActive: { color: '#FFF', fontWeight: '700' },
  levelChip: { minHeight: 30, borderRadius: 6, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  levelChipText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  rankChip: { minHeight: 30, borderRadius: 8, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
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
