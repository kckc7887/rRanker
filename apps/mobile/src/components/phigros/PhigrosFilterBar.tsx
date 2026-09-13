import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { FilterChipFrame, NeutralChip } from '@/components/MaimaiFilterBar';
import { FilterShell, filterShellStyles, joinFilterSummary } from '@/components/game-content/FilterShell';
import type { RangeBounds } from '@/components/game-content/RangeSelector';
import { MetricFilterSelectRows, MetricFilterRangeRow, MetricFilterChoiceRow, type MetricFilterSelectRow } from '@/components/game-content/MetricFilterRows';
import { PhigrosRateBadge } from '@/components/phigros/PhigrosRateBadge';
import { PhigrosKyouTagFilterSheet } from '@/components/phigros/PhigrosKyouTagFilterSheet';
import { PhigrosXingBadge } from '@/components/phigros/PhigrosXingBadge';
import {
  PHIGROS_LEVELS,
  PHIGROS_RANK_FILTERS,
  phigrosLevelLabel,
  phigrosRankFilterLabel,
  type PhigrosRankFilter,
} from '@/domain/phigros-filters';
import type { PhigrosLevel } from '@/domain/phigros';
import type { PhigrosKyouTag } from '@/domain/phigros-kyou';
import type { GameVersion } from '@/domain/models';
import { phigrosLevelColors } from '@/domain/phigros-level-theme';
import { phigrosXingLabel, type PhigrosXingKind } from '@/domain/phigros-xing';
import { useAppTheme } from '@/theme/app-theme';

const PHIGROS_XING_FILTERS: readonly { value: PhigrosXingKind; label: string }[] = [
  { value: 'good', label: 'Good' },
  { value: 'miss', label: 'Miss' },
];

type ChapterDropdownValue = string | 'all';
type OpenDropdown = string | null;
export type PhigrosKyouTagFilterState = 'ready' | 'loading' | 'unavailable';

export type PhigrosFilterSelectRow = MetricFilterSelectRow;

export interface PhigrosFilterBarProps {
  collapsible?: boolean;
  showLevel?: boolean;
  selectRows?: readonly PhigrosFilterSelectRow[];
  collapsed: boolean;
  level: PhigrosLevel | 'all';
  constantMin: string;
  constantMax: string;
  accuracyMin?: string;
  accuracyMax?: string;
  constantBounds?: RangeBounds;
  accuracyBounds?: RangeBounds;
  rank?: PhigrosRankFilter | null;
  xing?: PhigrosXingKind | null;
  chapter?: string | 'all';
  versions?: readonly GameVersion[];
  kyouTags?: readonly PhigrosKyouTag[];
  selectedKyouTagIds?: readonly number[];
  kyouTagState?: PhigrosKyouTagFilterState;
  onCollapsedChange: (collapsed: boolean) => void;
  onLevelChange: (level: PhigrosLevel | 'all') => void;
  onConstantMinChange: (value: string) => void;
  onConstantMaxChange: (value: string) => void;
  onAccuracyMinChange?: (value: string) => void;
  onAccuracyMaxChange?: (value: string) => void;
  onRankChange?: (value: PhigrosRankFilter | null) => void;
  onXingChange?: (value: PhigrosXingKind | null) => void;
  onChapterChange?: (value: string | 'all') => void;
  onKyouTagIdsChange?: (tagIds: number[]) => void;
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
  chapter,
  versions,
  kyouTags,
  selectedKyouTagIds,
  selectRows,
}: Pick<PhigrosFilterBarProps, 'level' | 'constantMin' | 'constantMax' | 'accuracyMin' | 'accuracyMax' | 'rank' | 'xing' | 'chapter' | 'versions' | 'kyouTags' | 'selectedKyouTagIds' | 'selectRows'>): string {
  const selectedChapter = versions?.find((item) => String(item.id) === chapter);
  return joinFilterSummary([
    level === 'all' ? null : phigrosLevelLabel(level),
    constantMin || constantMax ? `定数 ${constantMin || '不限'}~${constantMax || '不限'}` : null,
    accuracyMin || accuracyMax ? `Acc ${accuracyMin || '不限'}~${accuracyMax || '不限'}%` : null,
    rank ? phigrosRankFilterLabel(rank) : null,
    xing ? phigrosXingLabel(xing) : null,
    chapter === 'all' || !selectedChapter ? null : `章节 ${selectedChapter.title}`,
    selectedKyouTagIds?.length ? `标签 ${formatPhigrosKyouTagFilterValue(kyouTags ?? [], selectedKyouTagIds)}` : null,
    ...(selectRows ?? []).map((row) => row.defaultValue !== undefined && row.value === row.defaultValue
      ? null
      : `${row.label} ${row.options.find((option) => option.value === row.value)?.label ?? row.value}`),
  ]);
}

export function formatPhigrosKyouTagFilterValue(
  tags: readonly PhigrosKyouTag[],
  selectedTagIds: readonly number[],
): string {
  const names = tags.filter((tag) => selectedTagIds.includes(tag.id)).map((tag) => tag.name);
  if (names.length === 0) return '全部';
  if (names.length <= 2) return names.join('、');
  return `${names.length} 项`;
}

export function PhigrosFilterBar({
  collapsible = true,
  showLevel = true,
  selectRows = [],
  collapsed,
  level,
  constantMin,
  constantMax,
  accuracyMin = '',
  accuracyMax = '',
  constantBounds = { minimum: 0, maximum: 20 },
  accuracyBounds = { minimum: 0, maximum: 100 },
  rank = null,
  xing = null,
  chapter = 'all',
  versions,
  kyouTags = [],
  selectedKyouTagIds = [],
  kyouTagState = 'unavailable',
  onCollapsedChange,
  onLevelChange,
  onConstantMinChange,
  onConstantMaxChange,
  onAccuracyMinChange,
  onAccuracyMaxChange,
  onRankChange,
  onXingChange,
  onChapterChange,
  onKyouTagIdsChange,
  onReset,
}: PhigrosFilterBarProps) {
  const theme = useAppTheme();
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const [tagSheetVisible, setTagSheetVisible] = useState(false);
  const showAccuracyRange = onAccuracyMinChange !== undefined && onAccuracyMaxChange !== undefined;
  const showRankPicker = onRankChange !== undefined;
  const showXingPicker = onXingChange !== undefined;
  const showChapterPicker = onChapterChange !== undefined && versions !== undefined && versions.length > 0;
  const showKyouTagPicker = onKyouTagIdsChange !== undefined;
  const selectedChapterLabel = versions?.find((item) => String(item.id) === chapter)?.title ?? '全部';
  const setDropdownOpen = (id: OpenDropdown) => (open: boolean) => {
    setOpenDropdown(open ? id : null);
  };
  const chapterOptions = useMemo<FilterSelectOption<ChapterDropdownValue>[]>(() => [
    { value: 'all', label: '全部' },
    ...(versions ?? []).map((item) => ({ value: String(item.id), label: item.title })),
  ], [versions]);

  const handleReset = () => {
    setOpenDropdown(null);
    onReset();
  };

  const summary = buildPhigrosFilterSummary({
    level, constantMin, constantMax, accuracyMin, accuracyMax, rank, xing, chapter, versions,
    kyouTags, selectedKyouTagIds, selectRows,
  });

  return (
    <FilterShell collapsed={collapsed} collapsible={collapsible} summary={summary}
      onCollapsedChange={onCollapsedChange} onReset={handleReset}
      onCollapse={() => { setOpenDropdown(null); onCollapsedChange(true); }}>
      <MetricFilterSelectRows rows={selectRows} openDropdown={openDropdown} onOpenChange={setOpenDropdown} />

      {showLevel ? <View style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>难度</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={filterShellStyles.chipRowPadded}
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
      </View> : null}

      {showChapterPicker ? (
        <View style={filterShellStyles.filterRow}>
          <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>章节</Text>
          <FilterAnchoredDropdown
            accessibilityLabel={`章节筛选，当前 ${selectedChapterLabel}`}
            onOpenChange={setDropdownOpen('chapter')}
            onSelect={onChapterChange}
            open={openDropdown === 'chapter'}
            optionAccessibilityPrefix="选择章节"
            options={chapterOptions}
            selectedValue={chapter}
            valueLabel={selectedChapterLabel}
          />
        </View>
      ) : null}

      {showKyouTagPicker ? (
        <View style={filterShellStyles.filterRow}>
          <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>标签</Text>
          <Pressable accessibilityRole="button"
            accessibilityLabel={`谱面标签筛选，${kyouTagState === 'ready'
              ? `当前 ${formatPhigrosKyouTagFilterValue(kyouTags, selectedKyouTagIds)}`
              : kyouTagState === 'loading' ? '加载中' : '暂不可用'}`}
            accessibilityState={{ disabled: kyouTagState !== 'ready', expanded: tagSheetVisible }}
            disabled={kyouTagState !== 'ready'} onPress={() => setTagSheetVisible(true)}
            style={[styles.tagPicker, { backgroundColor: theme.input, borderColor: theme.border },
              kyouTagState !== 'ready' && styles.disabled]}>
            <Text numberOfLines={1} style={[styles.tagPickerText, { color: theme.text }]}>
              {kyouTagState === 'loading' ? '加载中'
                : kyouTagState === 'unavailable' ? '暂不可用'
                  : formatPhigrosKyouTagFilterValue(kyouTags, selectedKyouTagIds)}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <MetricFilterRangeRow label="定数" wide={showAccuracyRange} accessibilityLabel="Phigros 定数范围"
        bounds={constantBounds} step={0.1} lowerValue={constantMin} upperValue={constantMax}
        onLowerValueChange={onConstantMinChange} onUpperValueChange={onConstantMaxChange}
        formatValue={(value) => value.toFixed(1)} testID="phigros-filter-constant" />
      {showAccuracyRange ? <MetricFilterRangeRow label="Acc" wide spaced accessibilityLabel="Phigros Acc 范围"
        bounds={accuracyBounds} step={0.01} lowerValue={accuracyMin} upperValue={accuracyMax}
        onLowerValueChange={onAccuracyMinChange} onUpperValueChange={onAccuracyMaxChange}
        formatValue={(value) => `${value.toFixed(2)}%`} testID="phigros-filter-accuracy" /> : null}
      {showRankPicker ? <MetricFilterChoiceRow label="评价" selected={rank} onSelect={onRankChange}
        emptyLabel="全部" scrollable options={PHIGROS_RANK_FILTERS.map((item) => ({
          value: item.value, accessibilityLabel: `筛选评价 ${phigrosRankFilterLabel(item.value)}`,
          content: <PhigrosRateBadge rate={item.value === 'fc' ? 'v' : item.value} fc={item.value === 'fc'} />,
        }))} /> : null}
      {showXingPicker ? <MetricFilterChoiceRow label="XING" selected={xing} onSelect={onXingChange}
        emptyLabel="关闭" emptyAccessibilityLabel="XING 筛选 关闭" options={PHIGROS_XING_FILTERS.map((item) => ({
          value: item.value, accessibilityLabel: `XING 筛选 ${phigrosXingLabel(item.value)}`,
          content: <PhigrosXingBadge kind={item.value} />,
        }))} /> : null}
      {showKyouTagPicker ? <PhigrosKyouTagFilterSheet visible={tagSheetVisible} tags={kyouTags}
        selectedTagIds={selectedKyouTagIds} onApply={onKyouTagIdsChange} onClose={() => setTagSheetVisible(false)} /> : null}
    </FilterShell>
  );
}

export { NeutralChip };

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

// Phigros 专属样式：难度/评价芯片、Kyou 标签触发器；其余公共样式见 game-content/FilterShell。
const styles = StyleSheet.create({
  chipScroll: { flexGrow: 0, flexShrink: 1 },
  levelChip: { minHeight: 30, borderRadius: 6, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  levelChipText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  tagPicker: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagPickerText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
