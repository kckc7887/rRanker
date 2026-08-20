import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { FilterChipFrame, NeutralChip } from '@/components/MaimaiFilterBar';
import { FilterShell, filterShellStyles, joinFilterSummary } from '@/components/game-content/FilterShell';
import { RangeSelector, type RangeBounds } from '@/components/game-content/RangeSelector';
import {
  CHUNITHM_DIFFICULTY_LABELS,
  type ChunithmLevelIndex,
} from '@/domain/chunithm';
import {
  CHUNITHM_LEVELS,
  CHUNITHM_RANKS_DESC,
} from '@/domain/chunithm-filters';
import type { ChunithmRank } from '@/domain/chunithm-score-presentation';
import type { GameVersion } from '@/domain/models';
import { useAppTheme } from '@/theme/app-theme';
import { ChunithmDifficultyBadge } from './ChunithmDifficultyBadge';

type OpenDropdown = 'version' | 'rank-min' | 'rank-max' | null;
type VersionDropdownValue = string | 'all';
type RankDropdownValue = ChunithmRank | 'all';

export interface ChunithmFilterBarProps {
  collapsed: boolean;
  difficulty: ChunithmLevelIndex | 'all';
  version: string | 'all';
  constantMin: string;
  constantMax: string;
  constantBounds?: RangeBounds;
  rankMin?: ChunithmRank | null;
  rankMax?: ChunithmRank | null;
  versions: readonly GameVersion[];
  onCollapsedChange: (value: boolean) => void;
  onDifficultyChange: (value: ChunithmLevelIndex | 'all') => void;
  onVersionChange: (value: string | 'all') => void;
  onConstantMinChange: (value: string) => void;
  onConstantMaxChange: (value: string) => void;
  onRankMinChange?: (value: ChunithmRank | null) => void;
  onRankMaxChange?: (value: ChunithmRank | null) => void;
  onReset: () => void;
}

export function buildChunithmFilterSummary({
  difficulty,
  version,
  constantMin,
  constantMax,
  rankMin,
  rankMax,
  versions,
}: Pick<ChunithmFilterBarProps,
  'difficulty' | 'version' | 'constantMin' | 'constantMax' | 'rankMin' | 'rankMax' | 'versions'>): string {
  const selectedVersion = versions.find((item) => String(item.id) === version);
  return joinFilterSummary([
    difficulty === 'all' ? null : CHUNITHM_DIFFICULTY_LABELS[difficulty],
    selectedVersion?.title,
    constantMin || constantMax ? `定数 ${constantMin || '不限'}~${constantMax || '不限'}` : null,
    rankMin || rankMax ? `评价 ${rankMin || '不限'}~${rankMax || '不限'}` : null,
  ]);
}

export function ChunithmFilterBar({
  collapsed,
  difficulty,
  version,
  constantMin,
  constantMax,
  constantBounds = { minimum: 0, maximum: 16 },
  rankMin = null,
  rankMax = null,
  versions,
  onCollapsedChange,
  onDifficultyChange,
  onVersionChange,
  onConstantMinChange,
  onConstantMaxChange,
  onRankMinChange,
  onRankMaxChange,
  onReset,
}: ChunithmFilterBarProps) {
  const theme = useAppTheme();
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const showRankRange = onRankMinChange !== undefined && onRankMaxChange !== undefined;
  const selectedVersionLabel = versions.find((item) => String(item.id) === version)?.title ?? '全部';
  const setDropdownOpen = (id: OpenDropdown) => (open: boolean) => {
    setOpenDropdown(open ? id : null);
  };
  const versionOptions = useMemo<FilterSelectOption<VersionDropdownValue>[]>(() => [
    { value: 'all', label: '全部' },
    ...versions.map((item) => ({ value: String(item.id), label: item.title })),
  ], [versions]);
  const rankOptions = useMemo<FilterSelectOption<RankDropdownValue>[]>(() => [
    { value: 'all', label: '不限' },
    ...CHUNITHM_RANKS_DESC.map((rank) => ({ value: rank, label: rank })),
  ], []);
  const summary = buildChunithmFilterSummary({
    difficulty,
    version,
    constantMin,
    constantMax,
    rankMin,
    rankMax,
    versions,
  });

  const handleReset = () => {
    setOpenDropdown(null);
    onReset();
  };

  return (
    <FilterShell collapsed={collapsed} summary={summary} barStyle={filterShellStyles.filterBarPlain}
      expandLabelPrefix="展开中二筛选" collapseLabel="收起中二筛选" resetLabel="重置中二筛选"
      onCollapsedChange={onCollapsedChange} onReset={handleReset}
      onCollapse={() => { setOpenDropdown(null); onCollapsedChange(true); }}>
      <View style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabelPlain, { color: theme.textMuted }]}>难度</Text>
        <ScrollView
          contentContainerStyle={filterShellStyles.chipRowPadded}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
        >
          <NeutralChip label="全部" active={difficulty === 'all'} onPress={() => onDifficultyChange('all')} />
          {CHUNITHM_LEVELS.map((levelIndex) => (
            <FilterChipFrame
              accessibilityLabel={`筛选难度 ${CHUNITHM_DIFFICULTY_LABELS[levelIndex]}`}
              active={difficulty === levelIndex}
              key={levelIndex}
              onPress={() => onDifficultyChange(levelIndex)}
            >
              <ChunithmDifficultyBadge display="label" levelIndex={levelIndex} />
            </FilterChipFrame>
          ))}
        </ScrollView>
      </View>

      <View style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabelPlain, { color: theme.textMuted }]}>版本</Text>
        <FilterAnchoredDropdown
          accessibilityLabel={`中二版本筛选，当前 ${selectedVersionLabel}`}
          onOpenChange={setDropdownOpen('version')}
          onSelect={onVersionChange}
          open={openDropdown === 'version'}
          optionAccessibilityPrefix="选择中二版本"
          options={versionOptions}
          selectedValue={version}
          valueLabel={selectedVersionLabel}
        />
      </View>

      <View style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabelPlain, showRankRange && filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>定数</Text>
        <RangeSelector accessibilityLabel="中二定数范围" minimum={constantBounds.minimum} maximum={constantBounds.maximum}
          step={0.1} lowerValue={constantMin} upperValue={constantMax}
          onLowerValueChange={onConstantMinChange} onUpperValueChange={onConstantMaxChange}
          formatValue={(value) => value.toFixed(1)} testID="chunithm-filter-constant" />
      </View>

      {showRankRange ? (
        <View style={filterShellStyles.filterRow}>
          <Text style={[filterShellStyles.filterLabelPlain, filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>评价</Text>
          <View style={styles.rankDropdownRow}>
            <FilterAnchoredDropdown
              accessibilityLabel={`中二评价下限，当前 ${rankMin ?? '不限'}`}
              caption="下限"
              onOpenChange={setDropdownOpen('rank-min')}
              onSelect={(value) => onRankMinChange(value === 'all' ? null : value)}
              open={openDropdown === 'rank-min'}
              optionAccessibilityPrefix="选择中二评价下限"
              options={rankOptions}
              selectedValue={rankMin ?? 'all'}
              valueLabel={rankMin ?? '不限'}
            />
            <FilterAnchoredDropdown
              accessibilityLabel={`中二评价上限，当前 ${rankMax ?? '不限'}`}
              caption="上限"
              onOpenChange={setDropdownOpen('rank-max')}
              onSelect={(value) => onRankMaxChange(value === 'all' ? null : value)}
              open={openDropdown === 'rank-max'}
              optionAccessibilityPrefix="选择中二评价上限"
              options={rankOptions}
              selectedValue={rankMax ?? 'all'}
              valueLabel={rankMax ?? '不限'}
            />
          </View>
        </View>
      ) : null}
    </FilterShell>
  );
}

// Chunithm 专属样式：横向芯片滚动收缩与评价双下拉行；其余公共样式见 game-content/FilterShell。
const styles = StyleSheet.create({
  chipScroll: { flexGrow: 0, flexShrink: 1 },
  rankDropdownRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch', gap: 8 },
});
