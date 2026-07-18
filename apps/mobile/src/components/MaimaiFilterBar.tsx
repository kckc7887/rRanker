import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChartTypeBadge, DifficultyBadge, DIFFICULTY_VISUAL } from '@/components/ScoreVisuals';
import type { ChartType, Difficulty } from '@/domain/models';
import { localizedVersionName, type VersionNameLocale } from '@/domain/version-names';

const DIFFICULTIES: Difficulty[] = ['basic', 'advanced', 'expert', 'master', 'remaster'];
const TYPES: ChartType[] = ['SD', 'DX'];

export interface VersionFilterOption {
  value: string;
  name: string;
  versionId?: number;
}

export interface MaimaiFilterBarProps {
  difficulty: Difficulty | 'all';
  version: string | 'all';
  type: ChartType | 'all';
  constantMin: string;
  constantMax: string;
  versionLocale: VersionNameLocale;
  versions: readonly VersionFilterOption[];
  onDifficultyChange: (difficulty: Difficulty | 'all') => void;
  onVersionChange: (version: string | 'all') => void;
  onTypeChange: (type: ChartType | 'all') => void;
  onConstantMinChange: (value: string) => void;
  onConstantMaxChange: (value: string) => void;
  onVersionLocaleChange: (locale: VersionNameLocale) => void;
}

export function MaimaiFilterBar({
  difficulty,
  version,
  type,
  constantMin,
  constantMax,
  versionLocale,
  versions,
  onDifficultyChange,
  onVersionChange,
  onTypeChange,
  onConstantMinChange,
  onConstantMaxChange,
  onVersionLocaleChange,
}: MaimaiFilterBarProps) {
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const selectedVersion = versions.find((option) => option.value === version);
  const selectedVersionLabel = selectedVersion
    ? localizedVersionName(selectedVersion.versionId, selectedVersion.name, versionLocale)
    : '全部';

  const selectVersion = (value: string | 'all') => {
    onVersionChange(value);
    setVersionPickerOpen(false);
  };

  return <View style={styles.filterBar}>
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>难度</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <NeutralChip label="全部" active={difficulty === 'all'} onPress={() => onDifficultyChange('all')} />
        {DIFFICULTIES.map((item) => {
          const active = difficulty === item;
          return <FilterChipFrame key={item} active={active}
            accessibilityLabel={`筛选难度 ${DIFFICULTY_VISUAL[item].label}`}
            onPress={() => onDifficultyChange(item)}>
            <DifficultyBadge difficulty={item} compact />
          </FilterChipFrame>;
        })}
      </ScrollView>
    </View>

    <View style={[styles.filterRow, styles.versionRow]}>
      <Text style={styles.filterLabel}>版本</Text>
      <View style={styles.versionArea}>
        <View style={styles.versionControls}>
          <Pressable accessibilityRole="button" accessibilityLabel={`版本筛选，当前 ${selectedVersionLabel}`}
            accessibilityState={{ expanded: versionPickerOpen }}
            onPress={() => setVersionPickerOpen((open) => !open)} style={styles.versionTrigger}>
            <Text numberOfLines={1} style={styles.versionTriggerText}>{selectedVersionLabel}</Text>
            <Text style={styles.chevron}>{versionPickerOpen ? '⌃' : '⌄'}</Text>
          </Pressable>
          <View style={styles.localeSwitch}>
            {(['china', 'japan'] as const).map((locale) => {
              const active = versionLocale === locale;
              const label = locale === 'china' ? '中' : '日';
              return <Pressable key={locale} accessibilityRole="button"
                accessibilityLabel={`版本名称切换为${locale === 'china' ? '中文' : '日文'}`}
                accessibilityState={{ selected: active }} onPress={() => onVersionLocaleChange(locale)}
                style={[styles.localeButton, active && styles.localeButtonActive]}>
                <Text style={[styles.localeText, active && styles.localeTextActive]}>{label}</Text>
              </Pressable>;
            })}
          </View>
        </View>
        {versionPickerOpen ? <View style={styles.versionPicker}>
          <ScrollView nestedScrollEnabled style={styles.versionList}>
            <VersionOption label="全部" selected={version === 'all'} onPress={() => selectVersion('all')} />
            {versions.map((option) => (
              <VersionOption key={option.value}
                label={localizedVersionName(option.versionId, option.name, versionLocale)}
                selected={version === option.value} onPress={() => selectVersion(option.value)} />
            ))}
          </ScrollView>
        </View> : null}
      </View>
    </View>

    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>类型</Text>
      <View style={styles.chipRow}>
        <NeutralChip label="全部" active={type === 'all'} onPress={() => onTypeChange('all')} />
        {TYPES.map((item) => {
          const active = type === item;
          return <FilterChipFrame key={item} active={active} shape="rounded" accessibilityLabel={`筛选类型 ${item}`}
            onPress={() => onTypeChange(item)}>
            <ChartTypeBadge type={item} />
          </FilterChipFrame>;
        })}
      </View>
    </View>

    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>定数</Text>
      <View style={styles.rangeRow}>
        <TextInput accessibilityLabel="最低定数" autoCorrect={false} keyboardType="decimal-pad"
          placeholder="下限" value={constantMin} onChangeText={onConstantMinChange} style={styles.rangeInput} />
        <Text style={styles.rangeSeparator}>~</Text>
        <TextInput accessibilityLabel="最高定数" autoCorrect={false} keyboardType="decimal-pad"
          placeholder="上限" value={constantMax} onChangeText={onConstantMaxChange} style={styles.rangeInput} />
      </View>
    </View>
  </View>;
}

function NeutralChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <FilterChipFrame active={active} accessibilityLabel={`筛选 ${label}`} onPress={onPress}>
    <View style={[styles.neutralChip, active && styles.neutralChipActive]}>
      <Text style={[styles.neutralChipText, active && styles.neutralChipTextActive]}>{label}</Text>
    </View>
  </FilterChipFrame>;
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
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ selected: active }} onPress={onPress}
    style={[styles.chipFrame, shape === 'rounded' && styles.roundedChipFrame, active && styles.chipFrameActive]}>
    {children}
  </Pressable>;
}

function VersionOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`选择版本 ${label}`}
    accessibilityState={{ selected }} onPress={onPress}
    style={[styles.versionOption, selected && styles.versionOptionSelected]}>
    <Text style={[styles.versionOptionText, selected && styles.versionOptionTextSelected]}>{label}</Text>
    {selected ? <Text style={styles.versionCheck}>✓</Text> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  filterBar: { padding: 16, gap: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  versionRow: { alignItems: 'flex-start' },
  filterLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 36, paddingTop: 1 },
  chipRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chipFrame: { borderWidth: 2, borderColor: 'transparent', borderRadius: 999, padding: 2, alignItems: 'center', justifyContent: 'center' },
  roundedChipFrame: { borderRadius: 10 },
  chipFrameActive: { borderColor: '#246BFD' },
  neutralChip: { minHeight: 30, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  neutralChipActive: { backgroundColor: '#246BFD', borderColor: '#246BFD' },
  neutralChipText: { color: '#374151', fontSize: 12 },
  neutralChipTextActive: { color: '#FFF', fontWeight: '700' },
  versionArea: { flex: 1, minWidth: 0, gap: 7 },
  versionControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  versionTrigger: { flex: 1, minHeight: 36, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF' },
  versionTriggerText: { flex: 1, minWidth: 0, color: '#111827', fontSize: 12, fontWeight: '600' },
  chevron: { color: '#6B7280', fontSize: 14, fontWeight: '800' },
  localeSwitch: { flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10 },
  localeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  localeButtonActive: { backgroundColor: '#246BFD' },
  localeText: { color: '#4B5563', fontSize: 12, fontWeight: '700' },
  localeTextActive: { color: '#FFF' },
  versionPicker: { maxHeight: 220, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFF' },
  versionList: { maxHeight: 218 },
  versionOption: { minHeight: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  versionOptionSelected: { backgroundColor: '#EAF1FF' },
  versionOptionText: { flex: 1, color: '#374151', fontSize: 12 },
  versionOptionTextSelected: { color: '#1D4ED8', fontWeight: '700' },
  versionCheck: { color: '#246BFD', fontSize: 13, fontWeight: '900' },
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
});
