import { MetricFilterRangeRow } from '@/components/game-content/MetricFilterRows';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { TufDifficultyBadge } from './TufDifficultyBadge';
import { TufWorldAchievementBadge } from './TufScoreCard';
import { FilterAnchoredDropdown } from '@/components/FilterAnchoredDropdown';
import { FilterRow, FilterChipFrame, FilterShell, NeutralChip, joinFilterSummary } from '@/components/game-content/FilterShell';
import type {
  TufDifficultyBand, TufLevelSort, TufPassAchievementFilter, TufPassSort, TufSortOrder,
} from '@/domain/tuf';
import type { BadgePresentation } from '@/features/game-content/presentation';
import { useAppTheme } from '@/theme/app-theme';

export type { TufDifficultyBand, TufPassAchievementFilter } from '@/domain/tuf';

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

function SortOrderRow({ value, onChange }: { value: TufSortOrder; onChange: (value: TufSortOrder) => void }) {
  return <FilterRow label="顺序">
    <View style={styles.wrap}>
      <NeutralChip label="降序 ↓" active={value === 'DESC'} onPress={() => onChange('DESC')} accessibilityLabel="排序降序" />
      <NeutralChip label="升序 ↑" active={value === 'ASC'} onPress={() => onChange('ASC')} accessibilityLabel="排序升序" />
    </View>
  </FilterRow>;
}

function DifficultyFilters({
  difficultyBand, difficultyMin, difficultyMax, includeSpecial, specialAvailable = true,
  onDifficultyBandChange, onDifficultyMinChange, onDifficultyMaxChange, onIncludeSpecialChange,
}: {
  difficultyBand: TufDifficultyBand;
  difficultyMin: string;
  difficultyMax: string;
  includeSpecial: boolean;
  specialAvailable?: boolean;
  onDifficultyBandChange: (band: TufDifficultyBand) => void;
  onDifficultyMinChange: (value: string) => void;
  onDifficultyMaxChange: (value: string) => void;
  onIncludeSpecialChange: (value: boolean) => void;
}) {
  const theme = useAppTheme();
  return <>
    <FilterRow label="难度"><View style={styles.wrap}>
      <NeutralChip label="全部" active={difficultyBand === 'all'} onPress={() => onDifficultyBandChange('all')} accessibilityLabel="筛选难度 全部" />
      {(['P', 'G', 'U'] as const).map((band) => <FilterChipFrame key={band} active={difficultyBand === band}
        accessibilityLabel={`筛选难度 ${band}`} onPress={() => onDifficultyBandChange(band)}>
        <TufDifficultyBadge difficulty={BAND_BADGES[band]} display="label" />
      </FilterChipFrame>)}
    </View></FilterRow>
    <MetricFilterRangeRow label="区间" accessibilityLabel="TUF 难度范围" minimum={1} maximum={20} step={1}
        lowerValue={difficultyMin} upperValue={difficultyMax} onLowerValueChange={onDifficultyMinChange}
        onUpperValueChange={onDifficultyMaxChange} testID="tuf-filter-difficulty-range" />
    <Pressable accessibilityRole="switch" accessibilityLabel="包含特殊难度"
      accessibilityState={{ checked: includeSpecial, disabled: !specialAvailable }} disabled={!specialAvailable}
      onPress={() => onIncludeSpecialChange(!includeSpecial)} style={[styles.switchRow, !specialAvailable && styles.disabled]}>
      <View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.text }]}>包含特殊难度</Text>
        <Text style={[styles.switchHint, { color: theme.textMuted }]}>{specialAvailable ? 'PGU 区间之外仍保留特殊难度' : '正在读取 TUF 难度列表'}</Text></View>
      <Switch pointerEvents="none" disabled={!specialAvailable} value={includeSpecial && specialAvailable} />
    </Pressable>
  </>;
}

export function TufRecordsFilterBar({
  expanded, sortBy, order, bestPerLevel, difficultyBand, difficultyMin, difficultyMax, includeSpecial, achievement,
  onExpandedChange, onSortByChange, onOrderChange, onBestPerLevelChange,
  onDifficultyBandChange, onDifficultyMinChange, onDifficultyMaxChange, onIncludeSpecialChange,
  onAchievementChange, onReset,
}: {
  expanded: boolean;
  sortBy: TufPassSort;
  order: TufSortOrder;
  bestPerLevel: boolean;
  difficultyBand: TufDifficultyBand;
  difficultyMin: string;
  difficultyMax: string;
  includeSpecial: boolean;
  achievement: TufPassAchievementFilter;
  onExpandedChange: (expanded: boolean) => void;
  onSortByChange: (sort: TufPassSort) => void;
  onOrderChange: (order: TufSortOrder) => void;
  onBestPerLevelChange: (value: boolean) => void;
  onDifficultyBandChange: (band: TufDifficultyBand) => void;
  onDifficultyMinChange: (value: string) => void;
  onDifficultyMaxChange: (value: string) => void;
  onIncludeSpecialChange: (value: boolean) => void;
  onAchievementChange: (value: TufPassAchievementFilter) => void;
  onReset: () => void;
}) {
  const theme = useAppTheme();
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel = RECORD_SORTS.find((item) => item.value === sortBy)?.label ?? sortBy;
  const summary = joinFilterSummary([
    difficultyBand === 'all' ? null : `${difficultyBand} 段`,
    difficultyMin || difficultyMax ? `${difficultyMin || '1'}~${difficultyMax || '20'}` : null,
    includeSpecial ? null : '不含特殊',
    achievement === 'all' ? null : achievement.toUpperCase(),
    bestPerLevel ? '每关最佳' : null,
  ]);
  return <FilterShell title="筛选与排序" expandLabel="展开筛选器" collapseLabel="收起筛选器" resetWhenCollapsed={false} collapsed={!expanded} summary={summary}
    onCollapsedChange={(collapsed) => onExpandedChange(!collapsed)} onReset={onReset}>
    <FilterRow label="排序">
      <FilterAnchoredDropdown open={sortOpen} onOpenChange={setSortOpen} valueLabel={sortLabel}
        accessibilityLabel="选择成绩排序" options={RECORD_SORTS} selectedValue={sortBy}
        onSelect={onSortByChange} optionAccessibilityPrefix="选择排序" />
    </FilterRow>
    <SortOrderRow value={order} onChange={onOrderChange} />
    <DifficultyFilters difficultyBand={difficultyBand} difficultyMin={difficultyMin} difficultyMax={difficultyMax}
      includeSpecial={includeSpecial} onDifficultyBandChange={onDifficultyBandChange}
      onDifficultyMinChange={onDifficultyMinChange} onDifficultyMaxChange={onDifficultyMaxChange}
      onIncludeSpecialChange={onIncludeSpecialChange} />
    <FilterRow label="成就"><View style={styles.wrap}>
      <NeutralChip label="全部" active={achievement === 'all'} onPress={() => onAchievementChange('all')} accessibilityLabel="筛选成就 全部" />
      {(['wf', 'pp'] as const).map((value) => <FilterChipFrame key={value} active={achievement === value}
        accessibilityLabel={`筛选成就 ${value.toUpperCase()}`} onPress={() => onAchievementChange(value)}>
        <TufWorldAchievementBadge kind={value} testID={`tuf-filter-${value}`} />
      </FilterChipFrame>)}
    </View></FilterRow>
    <Pressable accessibilityRole="switch" accessibilityLabel="每关最佳" accessibilityState={{ checked: bestPerLevel }}
      onPress={() => onBestPerLevelChange(!bestPerLevel)} style={styles.switchRow}>
      <View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.text }]}>每关最佳</Text>
        <Text style={[styles.switchHint, { color: theme.textMuted }]}>每个关卡只保留公开最佳成绩</Text></View>
      <Switch pointerEvents="none" value={bestPerLevel} />
    </Pressable>
  </FilterShell>;
}

export function TufRandomFilterBar({
  expanded, difficultyBand, difficultyMin, difficultyMax, includeSpecial, achievement,
  onExpandedChange, onDifficultyBandChange, onDifficultyMinChange, onDifficultyMaxChange,
  onIncludeSpecialChange, onAchievementChange, onReset,
}: {
  expanded: boolean;
  difficultyBand: TufDifficultyBand;
  difficultyMin: string;
  difficultyMax: string;
  includeSpecial: boolean;
  achievement: TufPassAchievementFilter;
  onExpandedChange: (expanded: boolean) => void;
  onDifficultyBandChange: (band: TufDifficultyBand) => void;
  onDifficultyMinChange: (value: string) => void;
  onDifficultyMaxChange: (value: string) => void;
  onIncludeSpecialChange: (value: boolean) => void;
  onAchievementChange: (value: TufPassAchievementFilter) => void;
  onReset: () => void;
}) {
  const summary = joinFilterSummary([
    difficultyBand === 'all' ? null : `${difficultyBand} 段`,
    difficultyMin || difficultyMax ? `${difficultyMin || '1'}~${difficultyMax || '20'}` : null,
    includeSpecial ? null : '不含特殊',
    achievement === 'all' ? null : achievement.toUpperCase(),
  ]);
  return <FilterShell title="筛选与排序" expandLabel="展开筛选器" collapseLabel="收起筛选器" resetWhenCollapsed={false} collapsed={!expanded} summary={summary}
    onCollapsedChange={(collapsed) => onExpandedChange(!collapsed)} onReset={onReset}>
    <DifficultyFilters difficultyBand={difficultyBand} difficultyMin={difficultyMin} difficultyMax={difficultyMax}
      includeSpecial={includeSpecial} onDifficultyBandChange={onDifficultyBandChange}
      onDifficultyMinChange={onDifficultyMinChange} onDifficultyMaxChange={onDifficultyMaxChange}
      onIncludeSpecialChange={onIncludeSpecialChange} />
    <FilterRow label="成就"><View style={styles.wrap}>
      <NeutralChip label="全部" active={achievement === 'all'} onPress={() => onAchievementChange('all')} accessibilityLabel="筛选成就 全部" />
      {(['wf', 'pp'] as const).map((value) => <FilterChipFrame key={value} active={achievement === value}
        accessibilityLabel={`筛选成就 ${value.toUpperCase()}`} onPress={() => onAchievementChange(value)}>
        <TufWorldAchievementBadge kind={value} testID={`tuf-random-filter-${value}`} />
      </FilterChipFrame>)}
    </View></FilterRow>
  </FilterShell>;
}

export function TufCatalogFilterBar({
  expanded, sortBy, order, difficultyBand, difficultyMin, difficultyMax, includeSpecial, specialAvailable,
  onExpandedChange, onSortByChange, onOrderChange, onDifficultyBandChange,
  onDifficultyMinChange, onDifficultyMaxChange, onIncludeSpecialChange, onReset,
}: {
  expanded: boolean;
  sortBy: TufLevelSort;
  order: TufSortOrder;
  difficultyBand: TufDifficultyBand;
  difficultyMin: string;
  difficultyMax: string;
  includeSpecial: boolean;
  specialAvailable: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSortByChange: (sort: TufLevelSort) => void;
  onOrderChange: (order: TufSortOrder) => void;
  onDifficultyBandChange: (band: TufDifficultyBand) => void;
  onDifficultyMinChange: (value: string) => void;
  onDifficultyMaxChange: (value: string) => void;
  onIncludeSpecialChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel = LEVEL_SORTS.find((item) => item.value === sortBy)?.label ?? sortBy;
  const summary = joinFilterSummary([
    difficultyBand === 'all' ? null : `${difficultyBand} 段`,
    difficultyMin || difficultyMax ? `${difficultyMin || '1'}~${difficultyMax || '20'}` : null,
    includeSpecial ? null : '不含特殊',
  ]);
  return <FilterShell title="筛选与排序" expandLabel="展开筛选器" collapseLabel="收起筛选器" resetWhenCollapsed={false} collapsed={!expanded} summary={summary} onCollapsedChange={(collapsed) => onExpandedChange(!collapsed)} onReset={onReset}>
    <FilterRow label="排序">
      <FilterAnchoredDropdown open={sortOpen} onOpenChange={setSortOpen} valueLabel={sortLabel}
        accessibilityLabel="选择关卡排序" options={LEVEL_SORTS} selectedValue={sortBy}
        onSelect={onSortByChange} optionAccessibilityPrefix="选择排序" />
    </FilterRow>
    <SortOrderRow value={order} onChange={onOrderChange} />
    <DifficultyFilters difficultyBand={difficultyBand} difficultyMin={difficultyMin} difficultyMax={difficultyMax}
      includeSpecial={includeSpecial} specialAvailable={specialAvailable}
      onDifficultyBandChange={onDifficultyBandChange} onDifficultyMinChange={onDifficultyMinChange}
      onDifficultyMaxChange={onDifficultyMaxChange} onIncludeSpecialChange={onIncludeSpecialChange} />
  </FilterShell>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchCopy: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 13, fontWeight: '700' },
  switchHint: { fontSize: 11, lineHeight: 15 },
  disabled: { opacity: 0.55 },
});
