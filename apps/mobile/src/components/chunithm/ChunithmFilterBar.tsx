import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { FilterChipFrame, NeutralChip } from '@/components/MaimaiFilterBar';
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
  return [
    difficulty === 'all' ? null : CHUNITHM_DIFFICULTY_LABELS[difficulty],
    selectedVersion?.title,
    constantMin || constantMax ? `定数 ${constantMin || '不限'}~${constantMax || '不限'}` : null,
    rankMin || rankMax ? `评价 ${rankMin || '不限'}~${rankMax || '不限'}` : null,
  ].filter(Boolean).join(' · ') || '全部';
}

export function ChunithmFilterBar({
  collapsed,
  difficulty,
  version,
  constantMin,
  constantMax,
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

  if (collapsed) {
    return (
      <View style={[styles.collapsedBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable
          accessibilityLabel={`展开中二筛选，当前 ${summary}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
          onPress={() => onCollapsedChange(false)}
          style={styles.collapsedMain}
        >
          <Text style={[styles.collapsedLabel, { color: theme.textMuted }]}>筛选</Text>
          <Text numberOfLines={1} style={[styles.collapsedSummary, { color: theme.text }]}>{summary}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <ResetFilterButton onPress={handleReset} />
          <Pressable
            accessible={false}
            hitSlop={8}
            onPress={() => onCollapsedChange(false)}
            style={styles.headerAction}
          >
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
          <Pressable
            accessibilityLabel="收起中二筛选"
            accessibilityRole="button"
            accessibilityState={{ expanded: true }}
            hitSlop={8}
            onPress={() => {
              setOpenDropdown(null);
              onCollapsedChange(true);
            }}
            style={styles.headerAction}
          >
            <CollapseToggleAction expanded label="收起" />
          </Pressable>
        </View>
      </View>

      <View style={styles.filterRow}>
        <Text style={[styles.filterLabel, { color: theme.textMuted }]}>难度</Text>
        <ScrollView
          contentContainerStyle={styles.chipRow}
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

      <View style={styles.filterRow}>
        <Text style={[styles.filterLabel, { color: theme.textMuted }]}>版本</Text>
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

      <View style={styles.filterRow}>
        <Text style={[styles.filterLabel, showRankRange && styles.wideFilterLabel, { color: theme.textMuted }]}>定数</Text>
        <View style={styles.rangeRow}>
          <TextInput
            accessibilityLabel="中二最低定数"
            autoCorrect={false}
            keyboardType="decimal-pad"
            onChangeText={onConstantMinChange}
            placeholder="下限"
            placeholderTextColor={theme.textMuted}
            style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            value={constantMin}
          />
          <Text style={[styles.rangeSeparator, { color: theme.textMuted }]}>~</Text>
          <TextInput
            accessibilityLabel="中二最高定数"
            autoCorrect={false}
            keyboardType="decimal-pad"
            onChangeText={onConstantMaxChange}
            placeholder="上限"
            placeholderTextColor={theme.textMuted}
            style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            value={constantMax}
          />
        </View>
      </View>

      {showRankRange ? (
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, styles.wideFilterLabel, { color: theme.textMuted }]}>评价</Text>
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
    <Pressable
      accessibilityLabel="重置中二筛选"
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.resetButton, pressed && styles.resetButtonPressed]}
    >
      <Text style={[styles.resetButtonText, { color: theme.accent }]}>重置</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterBar: { padding: 16, gap: 10, borderBottomWidth: 1 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterLabel: { fontSize: 12, fontWeight: '600', width: 36, paddingTop: 1 },
  wideFilterLabel: { width: 44 },
  chipScroll: { flexGrow: 0, flexShrink: 1 },
  chipRow: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 1 },
  rangeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  rangeInput: {
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
  rangeSeparator: { fontSize: 13, fontWeight: '700' },
  rankDropdownRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  collapsedBar: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
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
