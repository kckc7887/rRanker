import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DxRatingTagFilterSheet } from '@/components/maimai/DxRatingTagFilterSheet';
import { ChartTypeBadge, DifficultyBadge, DIFFICULTY_VISUAL } from '@/components/ScoreVisuals';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
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

export type DxRatingTagFilterState = 'ready' | 'loading' | 'unavailable';

export interface VersionFilterOption {
  value: string;
  name: string;
  versionId?: number;
}

export interface MaimaiFilterBarProps {
  collapsed: boolean;
  difficulty: Difficulty | 'all';
  version: string | 'all';
  type: ChartType | 'all';
  constantMin: string;
  constantMax: string;
  achievementMin?: string;
  achievementMax?: string;
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
  return [
    difficulty === 'all' ? null : DIFFICULTY_VISUAL[difficulty].label,
    versionLabel,
    type === 'all' ? null : type,
    tagLabel === '全部' ? null : `标签 ${tagLabel}`,
    constantMin || constantMax ? `定数 ${constantMin || '不限'}~${constantMax || '不限'}` : null,
    achievementMin || achievementMax ? `达成率 ${achievementMin || '不限'}~${achievementMax || '不限'}%` : null,
    soloLabel,
    multiLabel,
  ].filter(Boolean).join(' · ') || '全部';
}

export function MaimaiFilterBar({
  collapsed,
  difficulty,
  version,
  type,
  constantMin,
  constantMax,
  achievementMin = '',
  achievementMax = '',
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

      <View style={styles.filterRow}>
        <Text style={[styles.filterLabel, { color: theme.textMuted }]}>版本</Text>
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

      <View style={styles.filterRow}>
        <Text style={[styles.filterLabel, { color: theme.textMuted }]}>类型</Text>
        <View style={styles.chipRow}>
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
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, { color: theme.textMuted }]}>标签</Text>
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

      <View style={styles.filterRow}>
        <Text style={[styles.filterLabel, showAchievementRange && styles.wideFilterLabel, { color: theme.textMuted }]}>定数</Text>
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

      {showAchievementRange ? (
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, styles.wideFilterLabel, { color: theme.textMuted }]}>达成率</Text>
          <View style={styles.rangeRow}>
            <TextInput accessibilityLabel="最低达成率" autoCorrect={false} keyboardType="decimal-pad"
              placeholder="下限" placeholderTextColor={theme.textMuted} value={achievementMin} onChangeText={onAchievementMinChange}
              style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
            <Text style={styles.rangeSeparator}>~</Text>
            <TextInput accessibilityLabel="最高达成率" autoCorrect={false} keyboardType="decimal-pad"
              placeholder="上限" placeholderTextColor={theme.textMuted} value={achievementMax} onChangeText={onAchievementMaxChange}
              style={[styles.rangeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
          </View>
        </View>
      ) : null}

      {showAchievementPickers ? (
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, styles.wideFilterLabel, { color: theme.textMuted }]}>成就</Text>
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
    <FilterChipFrame active={active} accessibilityLabel={accessibilityLabel ?? `筛选 ${label}`} onPress={onPress}>
      <View style={[styles.neutralChip, { backgroundColor: theme.surface, borderColor: theme.border }, active && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
        <Text style={[styles.neutralChipText, { color: theme.textSecondary }, active && styles.neutralChipTextActive]}>{label}</Text>
      </View>
    </FilterChipFrame>
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
      style={[styles.chipFrame, shape === 'rounded' && styles.roundedChipFrame, active && { borderColor: theme.accent }]}>
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
  chipFrame: { borderWidth: 2, borderColor: 'transparent', borderRadius: 999, padding: 2, alignItems: 'center', justifyContent: 'center' },
  roundedChipFrame: { borderRadius: 10 },
  neutralChip: { minHeight: 30, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  neutralChipText: { color: '#374151', fontSize: 12 },
  neutralChipTextActive: { color: '#FFF', fontWeight: '700' },
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
