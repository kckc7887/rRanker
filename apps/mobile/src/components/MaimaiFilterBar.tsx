import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DxRatingTagFilterSheet } from '@/components/maimai/DxRatingTagFilterSheet';
import { ChartTypeBadge, DifficultyBadge, DIFFICULTY_VISUAL } from '@/components/ScoreVisuals';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import {
  FilterChipFrame,
  FilterShell,
  NeutralChip,
  filterShellStyles,
  joinFilterSummary,
} from '@/components/game-content/FilterShell';
import { RangeSelector, type RangeBounds } from '@/components/game-content/RangeSelector';
import type { DxRatingChartTag } from '@/domain/dxrating-chart-tags';
import {
  MAIMAI_FC_ACHIEVEMENTS,
  MAIMAI_FS_ACHIEVEMENTS,
  maimaiFcAchievementLabel,
  maimaiFsAchievementLabel,
  type MaimaiFcAchievement,
  type MaimaiFsAchievement,
} from '@/domain/maimai-filters';
import type { ChartType, Difficulty } from '@/domain/models';
import { localizedVersionName, type VersionNameLocale } from '@/domain/version-names';
import { useAppTheme } from '@/theme/app-theme';

const DIFFICULTIES: Difficulty[] = ['basic', 'advanced', 'expert', 'master', 'remaster', 'utage'];
const TYPES: ChartType[] = ['SD', 'DX'];
type OpenDropdown = 'version' | 'solo' | 'multi' | null;
type VersionSheetValue = string | 'all';
type SoloSheetValue = MaimaiFcAchievement | 'all';
type MultiSheetValue = MaimaiFsAchievement | 'all';

export { FilterChipFrame, NeutralChip };

export type DxRatingTagFilterState = 'ready' | 'loading' | 'unavailable';

export interface VersionFilterOption {
  value: string;
  name: string;
  versionId?: number;
}

export interface MaimaiFilterBarProps {
  collapsed: boolean;
  /** 是否显示展开/收起按钮；成绩图片自定义等固定展开场景传 false，仅保留重置。 */
  collapsible?: boolean;
  difficulty: Difficulty | 'all';
  version: string | 'all';
  type: ChartType | 'all';
  constantMin: string;
  constantMax: string;
  achievementMin?: string;
  achievementMax?: string;
  constantBounds?: RangeBounds;
  achievementBounds?: RangeBounds;
  soloAchievement?: MaimaiFcAchievement | null;
  multiAchievement?: MaimaiFsAchievement | null;
  versionLocale: VersionNameLocale;
  versions: readonly VersionFilterOption[];
  dxRatingTags?: readonly DxRatingChartTag[];
  selectedDxRatingTagIds?: readonly number[];
  dxRatingTagState?: DxRatingTagFilterState;
  /** 版本改为多选复选框模式（成绩图片自定义使用）。 */
  versionMulti?: boolean;
  selectedVersions?: readonly string[];
  currentVersionTitle?: string;
  onCollapsedChange: (collapsed: boolean) => void;
  onDifficultyChange: (difficulty: Difficulty | 'all') => void;
  onVersionChange: (version: string | 'all') => void;
  onTypeChange: (type: ChartType | 'all') => void;
  onConstantMinChange: (value: string) => void;
  onConstantMaxChange: (value: string) => void;
  onAchievementMinChange?: (value: string) => void;
  onAchievementMaxChange?: (value: string) => void;
  onSoloAchievementChange?: (value: MaimaiFcAchievement | null) => void;
  onMultiAchievementChange?: (value: MaimaiFsAchievement | null) => void;
  onVersionLocaleChange: (locale: VersionNameLocale) => void;
  onDxRatingTagIdsChange?: (tagIds: number[]) => void;
  onVersionsChange?: (versions: string[]) => void;
  onReset: () => void;
}

export function formatDxRatingTagFilterValue(
  tags: readonly DxRatingChartTag[],
  selectedTagIds: readonly number[],
): string {
  const selected = new Set(selectedTagIds);
  const names = tags.filter((tag) => selected.has(tag.id)).map((tag) => tag.name);
  if (names.length === 0) return '全部';
  if (names.length <= 2) return names.join('、');
  return `${names.slice(0, 2).join('、')}等${names.length}个`;
}

export function buildMaimaiFilterSummary({
  difficulty, version, type, constantMin, constantMax, achievementMin, achievementMax,
  soloAchievement, multiAchievement, versionLocale, versions, dxRatingTags = [], selectedDxRatingTagIds = [],
  versionMulti = false, selectedVersions = [],
}: Pick<MaimaiFilterBarProps, 'difficulty' | 'version' | 'type' | 'constantMin' | 'constantMax'
  | 'achievementMin' | 'achievementMax' | 'soloAchievement' | 'multiAchievement' | 'versionLocale' | 'versions'
  | 'dxRatingTags' | 'selectedDxRatingTagIds'>
  & { versionMulti?: boolean; selectedVersions?: readonly string[] }): string {
  const selectedVersion = versions.find((option) => option.value === version);
  const selectedVersionLabel = selectedVersion
    ? localizedVersionName(selectedVersion.versionId, selectedVersion.name, versionLocale)
    : '全部';
  const versionLabel = versionMulti
    ? selectedVersions.length === 0
      ? '未选择版本'
      : selectedVersions.length === versions.length
        ? null
        : selectedVersions.length === 1
          ? `版本 ${localizedVersionName(
              versions.find((option) => option.value === selectedVersions[0])?.versionId,
              versions.find((option) => option.value === selectedVersions[0])?.name ?? selectedVersions[0],
              versionLocale,
            )}`
          : `版本 ${selectedVersions.length} 个`
    : selectedVersionLabel === '全部' ? null : selectedVersionLabel;
  const soloLabel = soloAchievement ? `单人 ${maimaiFcAchievementLabel(soloAchievement)}` : null;
  const multiLabel = multiAchievement ? `多人 ${maimaiFsAchievementLabel(multiAchievement)}` : null;
  const tagLabel = formatDxRatingTagFilterValue(dxRatingTags, selectedDxRatingTagIds);
  return joinFilterSummary([
    difficulty === 'all' ? null : DIFFICULTY_VISUAL[difficulty].label,
    versionLabel,
    type === 'all' ? null : type,
    tagLabel === '全部' ? null : `标签 ${tagLabel}`,
    constantMin || constantMax ? `定数 ${constantMin || '不限'}~${constantMax || '不限'}` : null,
    achievementMin || achievementMax ? `达成率 ${achievementMin || '不限'}~${achievementMax || '不限'}%` : null,
    soloLabel,
    multiLabel,
  ]);
}

export function MaimaiFilterBar({
  collapsed,
  collapsible = true,
  difficulty,
  version,
  type,
  constantMin,
  constantMax,
  achievementMin = '',
  achievementMax = '',
  constantBounds = { minimum: 1, maximum: 15.5 },
  achievementBounds = { minimum: 0, maximum: 101 },
  soloAchievement = null,
  multiAchievement = null,
  versionLocale,
  versions,
  dxRatingTags = [],
  selectedDxRatingTagIds = [],
  dxRatingTagState = 'unavailable',
  versionMulti = false,
  selectedVersions = [],
  currentVersionTitle,
  onCollapsedChange,
  onDifficultyChange,
  onVersionChange,
  onTypeChange,
  onConstantMinChange,
  onConstantMaxChange,
  onAchievementMinChange,
  onAchievementMaxChange,
  onSoloAchievementChange,
  onMultiAchievementChange,
  onVersionLocaleChange,
  onDxRatingTagIdsChange,
  onVersionsChange,
  onReset,
}: MaimaiFilterBarProps) {
  const theme = useAppTheme();
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const [tagSheetVisible, setTagSheetVisible] = useState(false);
  const showAchievementRange = onAchievementMinChange !== undefined && onAchievementMaxChange !== undefined;
  const showAchievementPickers = onSoloAchievementChange !== undefined && onMultiAchievementChange !== undefined;
  const selectedVersion = versions.find((option) => option.value === version);
  const selectedVersionLabel = selectedVersion
    ? localizedVersionName(selectedVersion.versionId, selectedVersion.name, versionLocale)
    : '全部';
  const multiVersionLabel = versionMulti
    ? selectedVersions.length === 0
      ? '未选择版本'
      : selectedVersions.length === versions.length
        ? '全部'
        : selectedVersions.length === 1
          ? localizedVersionName(
              versions.find((option) => option.value === selectedVersions[0])?.versionId,
              versions.find((option) => option.value === selectedVersions[0])?.name ?? selectedVersions[0],
              versionLocale,
            )
          : `${selectedVersions.length} 个版本`
    : selectedVersionLabel;
  const soloLabel = maimaiFcAchievementLabel(soloAchievement);
  const multiLabel = maimaiFsAchievementLabel(multiAchievement);
  const tagFilterValue = dxRatingTagState === 'loading'
    ? '加载中'
    : dxRatingTagState === 'unavailable'
      ? '不可用'
      : formatDxRatingTagFilterValue(dxRatingTags, selectedDxRatingTagIds);

  const setDropdownOpen = (id: OpenDropdown) => (open: boolean) => {
    setOpenDropdown(open ? id : null);
  };

  const handleReset = () => {
    setOpenDropdown(null);
    setTagSheetVisible(false);
    onReset();
  };

  const versionOptions = useMemo<FilterSelectOption<VersionSheetValue>[]>(() => [
    { value: 'all', label: '全部' },
    ...versions.map((option) => ({
      value: option.value,
      label: localizedVersionName(option.versionId, option.name, versionLocale),
    })),
  ], [versionLocale, versions]);

  const selectAllVersions = () => onVersionsChange?.(versions.map((option) => option.value));
  const selectCurrentVersion = () => {
    if (currentVersionTitle) onVersionsChange?.([currentVersionTitle]);
  };
  const selectPastVersions = () => onVersionsChange?.(versions
    .filter((option) => option.value !== currentVersionTitle)
    .map((option) => option.value));

  const soloOptions = useMemo<FilterSelectOption<SoloSheetValue>[]>(() => [
    { value: 'all', label: '全部' },
    ...MAIMAI_FC_ACHIEVEMENTS.map((item) => ({ value: item.value, label: item.label })),
  ], []);

  const multiOptions = useMemo<FilterSelectOption<MultiSheetValue>[]>(() => [
    { value: 'all', label: '全部' },
    ...MAIMAI_FS_ACHIEVEMENTS.map((item) => ({ value: item.value, label: item.label })),
  ], []);

  const localeSwitch = (
    <View style={[styles.localeSwitch, { borderColor: theme.border }]}>
      {(['china', 'japan'] as const).map((locale) => {
        const active = versionLocale === locale;
        const label = locale === 'china' ? '中' : '日';
        return (
          <Pressable key={locale} accessibilityRole="button"
            accessibilityLabel={`版本名称切换为${locale === 'china' ? '中文' : '日文'}`}
            accessibilityState={{ selected: active }} onPress={() => onVersionLocaleChange(locale)}
            style={[styles.localeButton, { backgroundColor: theme.surface }, active && { backgroundColor: theme.accent }]}>
            <Text style={[styles.localeText, active && styles.localeTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const summary = buildMaimaiFilterSummary({
    difficulty, version, type, constantMin, constantMax, achievementMin, achievementMax,
    soloAchievement, multiAchievement, versionLocale, versions, dxRatingTags, selectedDxRatingTagIds,
    versionMulti, selectedVersions,
  });

  return (
    <FilterShell collapsed={collapsed} collapsible={collapsible} summary={summary}
      onCollapsedChange={onCollapsedChange} onReset={handleReset}
      onCollapse={() => { setOpenDropdown(null); onCollapsedChange(true); }}>
      <View style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>难度</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={filterShellStyles.chipRow}>
          <NeutralChip label="全部" active={difficulty === 'all'} onPress={() => onDifficultyChange('all')} />
          {DIFFICULTIES.map((item) => {
            const active = difficulty === item;
            return (
              <FilterChipFrame key={item} active={active}
                accessibilityLabel={`筛选难度 ${DIFFICULTY_VISUAL[item].label}`}
                onPress={() => onDifficultyChange(item)}>
                <DifficultyBadge difficulty={item} compact />
              </FilterChipFrame>
            );
          })}
        </ScrollView>
      </View>

      <View style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>版本</Text>
        <View style={styles.dropdownControls}>
          <FilterAnchoredDropdown
            open={openDropdown === 'version'}
            onOpenChange={setDropdownOpen('version')}
            valueLabel={versionMulti ? multiVersionLabel : selectedVersionLabel}
            accessibilityLabel={`版本筛选，当前 ${versionMulti ? multiVersionLabel : selectedVersionLabel}`}
            options={versionMulti
              ? versionOptions.filter((option) => option.value !== 'all')
              : versionOptions}
            multiple={versionMulti}
            selectedValues={versionMulti ? selectedVersions : undefined}
            onValuesChange={versionMulti ? onVersionsChange : undefined}
            selectedValue={version}
            onSelect={(value) => onVersionChange(value === 'all' ? 'all' : value)}
            optionAccessibilityPrefix="选择版本"
            dropdownHeader={versionMulti ? (() => (
              <View style={styles.versionQuickActions}>
                <QuickChip label="全部" active={selectedVersions.length === versions.length} onPress={selectAllVersions} />
                <QuickChip label="当前版本" active={selectedVersions.length === 1 && selectedVersions[0] === currentVersionTitle} onPress={selectCurrentVersion} />
                <QuickChip label="过往版本" active={selectedVersions.length === versions.filter((option) => option.value !== currentVersionTitle).length} onPress={selectPastVersions} />
              </View>
            )) : undefined}
            dropdownFooter={versionMulti ? ((close: () => void) => (
              <Pressable accessibilityRole="button" accessibilityLabel="完成版本选择" onPress={close}
                style={[styles.versionDoneButton, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.versionDoneText, { color: theme.accent }]}>完成</Text>
              </Pressable>
            )) : undefined}
            endAdornment={localeSwitch}
          />
        </View>
      </View>

      <View style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>类型</Text>
        <View style={filterShellStyles.chipRow}>
          <NeutralChip label="全部" active={type === 'all'} onPress={() => onTypeChange('all')} />
          {TYPES.map((item) => {
            const active = type === item;
            return (
              <FilterChipFrame key={item} active={active} shape="rounded" accessibilityLabel={`筛选类型 ${item}`}
                onPress={() => onTypeChange(item)}>
                <ChartTypeBadge type={item} />
              </FilterChipFrame>
            );
          })}
        </View>
      </View>

      {onDxRatingTagIdsChange ? (
        <View style={filterShellStyles.filterRow}>
          <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>标签</Text>
          <Pressable accessibilityRole="button"
            accessibilityLabel={`谱面标签筛选，${dxRatingTagState === 'ready' ? `当前 ${tagFilterValue}` : tagFilterValue}`}
            accessibilityState={{ disabled: dxRatingTagState !== 'ready', expanded: tagSheetVisible }}
            disabled={dxRatingTagState !== 'ready'}
            onPress={() => { setOpenDropdown(null); setTagSheetVisible(true); }}
            style={({ pressed }) => [
              styles.tagFilterTrigger,
              { backgroundColor: theme.input, borderColor: theme.border },
              dxRatingTagState !== 'ready' && styles.disabled,
              pressed && styles.tagFilterTriggerPressed,
            ]}>
            <Text numberOfLines={1} style={[styles.tagFilterValue, { color: theme.text }]}>{tagFilterValue}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabel, showAchievementRange && filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>定数</Text>
        <RangeSelector accessibilityLabel="舞萌定数范围" minimum={constantBounds.minimum} maximum={constantBounds.maximum}
          step={0.1} lowerValue={constantMin} upperValue={constantMax}
          onLowerValueChange={onConstantMinChange} onUpperValueChange={onConstantMaxChange}
          formatValue={(value) => value.toFixed(1)} testID="maimai-filter-constant" />
      </View>

      {showAchievementRange ? (
        <View style={filterShellStyles.filterRow}>
          <Text style={[filterShellStyles.filterLabel, filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>达成率</Text>
          <RangeSelector accessibilityLabel="舞萌达成率范围" minimum={achievementBounds.minimum} maximum={achievementBounds.maximum}
            step={0.0001} lowerValue={achievementMin} upperValue={achievementMax}
            onLowerValueChange={onAchievementMinChange} onUpperValueChange={onAchievementMaxChange}
            formatValue={(value) => `${value.toFixed(4)}%`} testID="maimai-filter-achievement" />
        </View>
      ) : null}

      {showAchievementPickers ? (
        <View style={filterShellStyles.filterRow}>
          <Text style={[filterShellStyles.filterLabel, filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>成就</Text>
          <View style={styles.achievementDropdownRow}>
            <FilterAnchoredDropdown
              open={openDropdown === 'solo'}
              onOpenChange={setDropdownOpen('solo')}
              valueLabel={soloLabel}
              caption="单人"
              accessibilityLabel={`单人成就筛选，当前 ${soloLabel}`}
              options={soloOptions}
              selectedValue={soloAchievement ?? 'all'}
              optionAccessibilityPrefix="选择单人成就"
              onSelect={(value) => onSoloAchievementChange(value === 'all' ? null : value)}
            />
            <FilterAnchoredDropdown
              open={openDropdown === 'multi'}
              onOpenChange={setDropdownOpen('multi')}
              valueLabel={multiLabel}
              caption="多人"
              accessibilityLabel={`多人成就筛选，当前 ${multiLabel}`}
              options={multiOptions}
              selectedValue={multiAchievement ?? 'all'}
              optionAccessibilityPrefix="选择多人成就"
              onSelect={(value) => onMultiAchievementChange(value === 'all' ? null : value)}
            />
          </View>
        </View>
      ) : null}
      {onDxRatingTagIdsChange && tagSheetVisible ? <DxRatingTagFilterSheet
        visible={tagSheetVisible}
        tags={dxRatingTags}
        selectedTagIds={selectedDxRatingTagIds}
        onApply={onDxRatingTagIdsChange}
        onClose={() => setTagSheetVisible(false)}
      /> : null}
    </FilterShell>
  );
}

function QuickChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`版本快捷 ${label}`} accessibilityState={{ selected: active }} onPress={onPress}
      style={[styles.quickChip, { backgroundColor: theme.surface, borderColor: theme.border }, active && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
      <Text style={[styles.quickChipText, { color: theme.textSecondary }, active && { color: theme.accent }]}>{label}</Text>
    </Pressable>
  );
}

// Maimai 专属样式：版本切换、标签触发器、快捷芯片等；公共样式见 game-content/FilterShell 的 filterShellStyles。
const styles = StyleSheet.create({
  dropdownControls: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  versionQuickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: { minHeight: 28, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  quickChipText: { fontSize: 12, fontWeight: '700' },
  versionDoneButton: { minHeight: 36, minWidth: 96, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  versionDoneText: { fontSize: 13, fontWeight: '800' },
  tagFilterTrigger: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagFilterValue: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20 },
  tagFilterTriggerPressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  achievementDropdownRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  localeSwitch: { flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10 },
  localeButton: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  localeText: { color: '#4B5563', fontSize: 12, fontWeight: '700' },
  localeTextActive: { color: '#FFF' },
});
