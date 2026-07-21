import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChartTypeBadge, DifficultyBadge, DIFFICULTY_VISUAL } from '@/components/ScoreVisuals';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
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

const DIFFICULTIES: Difficulty[] = ['basic', 'advanced', 'expert', 'master', 'remaster'];
const TYPES: ChartType[] = ['SD', 'DX'];
type OpenDropdown = 'version' | 'solo' | 'multi' | null;
type VersionSheetValue = string | 'all';
type SoloSheetValue = MaimaiFcAchievement | 'all';
type MultiSheetValue = MaimaiFsAchievement | 'all';

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
  onReset: () => void;
}

export function buildMaimaiFilterSummary({
  difficulty, version, type, constantMin, constantMax, achievementMin, achievementMax,
  soloAchievement, multiAchievement, versionLocale, versions,
}: Pick<MaimaiFilterBarProps, 'difficulty' | 'version' | 'type' | 'constantMin' | 'constantMax'
  | 'achievementMin' | 'achievementMax' | 'soloAchievement' | 'multiAchievement' | 'versionLocale' | 'versions'>): string {
  const selectedVersion = versions.find((option) => option.value === version);
  const selectedVersionLabel = selectedVersion
    ? localizedVersionName(selectedVersion.versionId, selectedVersion.name, versionLocale)
    : '全部';
  const soloLabel = soloAchievement ? `单人 ${maimaiFcAchievementLabel(soloAchievement)}` : null;
  const multiLabel = multiAchievement ? `多人 ${maimaiFsAchievementLabel(multiAchievement)}` : null;
  return [
    difficulty === 'all' ? null : DIFFICULTY_VISUAL[difficulty].label,
    selectedVersionLabel === '全部' ? null : selectedVersionLabel,
    type === 'all' ? null : type,
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
  onReset,
}: MaimaiFilterBarProps) {
  const theme = useAppTheme();
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const showAchievementRange = onAchievementMinChange !== undefined && onAchievementMaxChange !== undefined;
  const showAchievementPickers = onSoloAchievementChange !== undefined && onMultiAchievementChange !== undefined;
  const selectedVersion = versions.find((option) => option.value === version);
  const selectedVersionLabel = selectedVersion
    ? localizedVersionName(selectedVersion.versionId, selectedVersion.name, versionLocale)
    : '全部';
  const soloLabel = maimaiFcAchievementLabel(soloAchievement);
  const multiLabel = maimaiFsAchievementLabel(multiAchievement);

  const setDropdownOpen = (id: OpenDropdown) => (open: boolean) => {
    setOpenDropdown(open ? id : null);
  };

  const handleReset = () => {
    setOpenDropdown(null);
    onReset();
  };

  const versionOptions = useMemo<FilterSelectOption<VersionSheetValue>[]>(() => [
    { value: 'all', label: '全部' },
    ...versions.map((option) => ({
      value: option.value,
      label: localizedVersionName(option.versionId, option.name, versionLocale),
    })),
  ], [versionLocale, versions]);

  const soloOptions = useMemo<FilterSelectOption<SoloSheetValue>[]>(() => [
    { value: 'all', label: '全部' },
    ...MAIMAI_FC_ACHIEVEMENTS.map((item) => ({ value: item.value, label: item.label })),
  ], []);

  const multiOptions = useMemo<FilterSelectOption<MultiSheetValue>[]>(() => [
    { value: 'all', label: '全部' },
    ...MAIMAI_FS_ACHIEVEMENTS.map((item) => ({ value: item.value, label: item.label })),
  ], []);

  const summary = buildMaimaiFilterSummary({
    difficulty, version, type, constantMin, constantMax, achievementMin, achievementMax,
    soloAchievement, multiAchievement, versionLocale, versions,
  });

  if (collapsed) {
    return (
      <View style={[styles.collapsedBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`展开筛选，当前 ${summary}`}
          accessibilityState={{ expanded: false }} onPress={() => onCollapsedChange(false)}
          style={styles.collapsedMain}>
          <Text style={[styles.collapsedLabel, { color: theme.textMuted }]}>筛选</Text>
          <Text numberOfLines={1} style={[styles.collapsedSummary, { color: theme.text }]}>{summary}</Text>
          <CollapseToggleAction expanded={false} label="展开" />
        </Pressable>
        <ResetFilterButton onPress={handleReset} />
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
            valueLabel={selectedVersionLabel}
            accessibilityLabel={`版本筛选，当前 ${selectedVersionLabel}`}
            options={versionOptions}
            selectedValue={version}
            optionAccessibilityPrefix="选择版本"
            onSelect={(value) => onVersionChange(value === 'all' ? 'all' : value)}
            endAdornment={(
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
            )}
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
