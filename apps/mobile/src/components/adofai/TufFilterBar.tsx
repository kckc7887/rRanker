import { useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { TufDifficultyBadge } from './TufDifficultyBadge';
import { FilterAnchoredDropdown } from '@/components/FilterAnchoredDropdown';
import { FilterChipFrame, NeutralChip } from '@/components/MaimaiFilterBar';
import type { TufLevelSort, TufPassSort, TufSortOrder } from '@/domain/tuf';
import type { BadgePresentation } from '@/features/game-content/presentation';
import { useAppTheme } from '@/theme/app-theme';

export type TufDifficultyBand = 'all' | 'P' | 'G' | 'U';

const RECORD_SORTS: readonly { value: TufPassSort; label: string }[] = [
  { value: 'date', label: '日期' }, { value: 'score', label: 'Score' }, { value: 'speed', label: '速度' },
  { value: 'xacc', label: 'XACC' }, { value: 'difficulty', label: '难度' }, { value: 'impact', label: 'Impact' },
];

const LEVEL_SORTS: readonly { value: TufLevelSort; label: string }[] = [
  { value: 'RECENT', label: '最近更新' }, { value: 'DIFF', label: '难度' }, { value: 'CLEARS', label: '通关人数' },
  { value: 'TOTAL_CLEARS', label: '通关次数' }, { value: 'LIKES', label: '喜欢' },
  { value: 'BASESCORE', label: '基准分' }, { value: 'BPM', label: 'BPM' }, { value: 'TILES', label: '物量' },
  { value: 'TIME', label: '时长' },
];

const BAND_BADGES: Record<Exclude<TufDifficultyBand, 'all'>, BadgePresentation> = {
  P: { key: 'P', label: 'P', tone: 'tuf-p' },
  G: { key: 'G', label: 'G', tone: 'tuf-g' },
  U: { key: 'U', label: 'U', tone: 'tuf-u' },
};

function FilterShell({
  expanded, summary, onExpandedChange, onReset, children,
}: {
  expanded: boolean;
  summary: string;
  onExpandedChange: (expanded: boolean) => void;
  onReset: () => void;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  if (!expanded) {
    return <Pressable accessibilityRole="button" accessibilityLabel="展开筛选器" onPress={() => onExpandedChange(true)}
      style={[styles.collapsed, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <Ionicons name="options-outline" size={16} color={theme.textMuted} />
      <Text style={[styles.collapsedTitle, { color: theme.text }]}>筛选</Text>
      <Text numberOfLines={1} style={[styles.summary, { color: theme.textMuted }]}>{summary}</Text>
      <Text style={[styles.actionText, { color: theme.accent }]}>展开</Text>
      <Ionicons name="chevron-down" size={14} color={theme.accent} />
    </Pressable>;
  }
  return <View style={[styles.panel, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
    <View style={styles.header}>
      <Text style={[styles.headerTitle, { color: theme.text }]}>筛选与排序</Text>
      <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="重置筛选" onPress={onReset} style={styles.headerButton}>
          <Text style={[styles.actionText, { color: theme.accent }]}>重置</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="收起筛选器" onPress={() => onExpandedChange(false)} style={styles.headerButton}>
          <Text style={[styles.actionText, { color: theme.accent }]}>收起</Text>
          <Ionicons name="chevron-up" size={14} color={theme.accent} />
        </Pressable>
      </View>
    </View>
    {children}
  </View>;
}

function SortOrderRow({ value, onChange }: { value: TufSortOrder; onChange: (value: TufSortOrder) => void }) {
  const theme = useAppTheme();
  return <View style={styles.row}>
    <Text style={[styles.label, { color: theme.textMuted }]}>顺序</Text>
    <View style={styles.wrap}>
      <NeutralChip label="降序 ↓" active={value === 'DESC'} onPress={() => onChange('DESC')} accessibilityLabel="排序降序" />
      <NeutralChip label="升序 ↑" active={value === 'ASC'} onPress={() => onChange('ASC')} accessibilityLabel="排序升序" />
    </View>
  </View>;
}

export function TufRecordsFilterBar({
  expanded, sortBy, order, bestPerLevel, onExpandedChange, onSortByChange, onOrderChange, onBestPerLevelChange, onReset,
}: {
  expanded: boolean;
  sortBy: TufPassSort;
  order: TufSortOrder;
  bestPerLevel: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSortByChange: (sort: TufPassSort) => void;
  onOrderChange: (order: TufSortOrder) => void;
  onBestPerLevelChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const theme = useAppTheme();
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel = RECORD_SORTS.find((item) => item.value === sortBy)?.label ?? sortBy;
  return <FilterShell expanded={expanded} summary={`${sortLabel} · ${order === 'DESC' ? '降序' : '升序'}${bestPerLevel ? ' · 每关最佳' : ''}`}
    onExpandedChange={onExpandedChange} onReset={onReset}>
    <View style={styles.row}><Text style={[styles.label, { color: theme.textMuted }]}>排序</Text>
      <FilterAnchoredDropdown open={sortOpen} onOpenChange={setSortOpen} valueLabel={sortLabel}
        accessibilityLabel="选择成绩排序" options={RECORD_SORTS} selectedValue={sortBy}
        onSelect={onSortByChange} optionAccessibilityPrefix="选择排序" />
    </View>
    <SortOrderRow value={order} onChange={onOrderChange} />
    <Pressable accessibilityRole="switch" accessibilityLabel="每关最佳" accessibilityState={{ checked: bestPerLevel }}
      onPress={() => onBestPerLevelChange(!bestPerLevel)} style={styles.switchRow}>
      <View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.text }]}>每关最佳</Text>
        <Text style={[styles.switchHint, { color: theme.textMuted }]}>每个关卡只保留公开最佳成绩</Text></View>
      <Switch pointerEvents="none" value={bestPerLevel} />
    </Pressable>
  </FilterShell>;
}

export function TufCatalogFilterBar({
  expanded, sortBy, order, difficultyBand, includeSpecial, specialAvailable,
  onExpandedChange, onSortByChange, onOrderChange, onDifficultyBandChange, onIncludeSpecialChange, onReset,
}: {
  expanded: boolean;
  sortBy: TufLevelSort;
  order: TufSortOrder;
  difficultyBand: TufDifficultyBand;
  includeSpecial: boolean;
  specialAvailable: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSortByChange: (sort: TufLevelSort) => void;
  onOrderChange: (order: TufSortOrder) => void;
  onDifficultyBandChange: (band: TufDifficultyBand) => void;
  onIncludeSpecialChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const theme = useAppTheme();
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel = LEVEL_SORTS.find((item) => item.value === sortBy)?.label ?? sortBy;
  const summary = [
    sortLabel,
    order === 'DESC' ? '降序' : '升序',
    difficultyBand === 'all' ? null : `${difficultyBand} 段`,
    includeSpecial ? null : '不含特殊',
  ].filter(Boolean).join(' · ');
  return <FilterShell expanded={expanded} summary={summary} onExpandedChange={onExpandedChange} onReset={onReset}>
    <View style={styles.row}><Text style={[styles.label, { color: theme.textMuted }]}>排序</Text>
      <FilterAnchoredDropdown open={sortOpen} onOpenChange={setSortOpen} valueLabel={sortLabel}
        accessibilityLabel="选择关卡排序" options={LEVEL_SORTS} selectedValue={sortBy}
        onSelect={onSortByChange} optionAccessibilityPrefix="选择排序" />
    </View>
    <SortOrderRow value={order} onChange={onOrderChange} />
    <View style={styles.row}><Text style={[styles.label, { color: theme.textMuted }]}>难度</Text><View style={styles.wrap}>
      <NeutralChip label="全部" active={difficultyBand === 'all'} onPress={() => onDifficultyBandChange('all')} accessibilityLabel="筛选难度 全部" />
      {(['P', 'G', 'U'] as const).map((band) => <FilterChipFrame key={band} active={difficultyBand === band}
        accessibilityLabel={`筛选难度 ${band}`} onPress={() => onDifficultyBandChange(band)}>
        <TufDifficultyBadge difficulty={BAND_BADGES[band]} display="label" />
      </FilterChipFrame>)}
    </View></View>
    <Pressable accessibilityRole="switch" accessibilityLabel="包含特殊难度"
      accessibilityState={{ checked: includeSpecial, disabled: !specialAvailable }} disabled={!specialAvailable}
      onPress={() => onIncludeSpecialChange(!includeSpecial)} style={[styles.switchRow, !specialAvailable && styles.disabled]}>
      <View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.text }]}>包含特殊难度</Text>
        <Text style={[styles.switchHint, { color: theme.textMuted }]}>{specialAvailable ? '包含 Unranked、SPECIAL 与 LEGACY' : '正在读取 TUF 难度列表'}</Text></View>
      <Switch pointerEvents="none" disabled={!specialAvailable} value={includeSpecial && specialAvailable} />
    </Pressable>
  </FilterShell>;
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  collapsed: { minHeight: 48, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 7 },
  collapsedTitle: { fontSize: 12, fontWeight: '800' },
  summary: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '600' },
  header: { minHeight: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 13, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerButton: { minHeight: 28, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionText: { fontSize: 12, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { width: 36, fontSize: 12, fontWeight: '700' },
  wrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchCopy: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 13, fontWeight: '700' },
  switchHint: { fontSize: 11, lineHeight: 15 },
  disabled: { opacity: 0.55 },
});
