import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FilterShell, filterShellStyles, joinFilterSummary } from '@/components/game-content/FilterShell';
import { RangeSelector, type RangeBounds } from '@/components/game-content/RangeSelector';
import type { OsuGameId } from '@/domain/game-mode-family';
import { OSU_MOD_FILTER_NONE } from '@/domain/osu-filters';
import { useAppTheme } from '@/theme/app-theme';
import { OsuModFilterSheet } from './OsuModFilterSheet';

export interface OsuRecordsFilterBarProps {
  collapsed: boolean;
  gameId?: OsuGameId | null;
  mods: readonly string[];
  starMin: string;
  starMax: string;
  accuracyMin: string;
  accuracyMax: string;
  ppMin: string;
  ppMax: string;
  starBounds?: RangeBounds;
  onCollapsedChange: (collapsed: boolean) => void;
  onModsChange: (values: string[]) => void;
  onStarMinChange: (value: string) => void;
  onStarMaxChange: (value: string) => void;
  onAccuracyMinChange: (value: string) => void;
  onAccuracyMaxChange: (value: string) => void;
  onPpMinChange: (value: string) => void;
  onPpMaxChange: (value: string) => void;
  onReset: () => void;
}

function modLabel(flag: string): string {
  return flag === OSU_MOD_FILTER_NONE ? '无模组' : flag;
}

/** 模组触发器值标签：空选「全部」；NM 显示「无模组」；其余 acronym 以「 · 」连接（同曲库页多选口径）。 */
export function osuModsValueLabel(mods: readonly string[]): string {
  if (mods.length === 0) return '全部';
  return mods.map(modLabel).join(' · ');
}

/** 收起态摘要：仅列生效条件（全默认时「全部」）；模组以 acronym「+」连接（NM 显示「无模组」）。 */
export function buildOsuRecordsFilterSummary({
  mods,
  starMin,
  starMax,
  accuracyMin,
  accuracyMax,
  ppMin,
  ppMax,
}: Pick<OsuRecordsFilterBarProps,
  'mods' | 'starMin' | 'starMax' | 'accuracyMin' | 'accuracyMax' | 'ppMin' | 'ppMax'>): string {
  return joinFilterSummary([
    mods.length ? `模组 ${mods.map(modLabel).join('+')}` : null,
    starMin || starMax ? `星数 ${starMin || '不限'}~${starMax || '不限'}` : null,
    accuracyMin || accuracyMax ? `达成率 ${accuracyMin || '不限'}~${accuracyMax || '不限'}%` : null,
    ppMin || ppMax ? `PP ${ppMin || '不限'}~${ppMax || '不限'}` : null,
  ]);
}

/**
 * osu! 成绩筛选栏：模组多选（NM 无模组与其余互斥）+ 星数/达成率/PP 三组上下限；
 * 复用公共 FilterShell / FilterCheckboxList / 数值范围行（同曲库页与 Phigros 数值行模式）。
 */
export function OsuRecordsFilterBar({
  collapsed,
  gameId = 'osu-standard',
  mods,
  starMin,
  starMax,
  accuracyMin,
  accuracyMax,
  ppMin,
  ppMax,
  starBounds = { minimum: 0, maximum: 10 },
  onCollapsedChange,
  onModsChange,
  onStarMinChange,
  onStarMaxChange,
  onAccuracyMinChange,
  onAccuracyMaxChange,
  onPpMinChange,
  onPpMaxChange,
  onReset,
}: OsuRecordsFilterBarProps) {
  const theme = useAppTheme();
  const [modsOpen, setModsOpen] = useState(false);
  const modsLabel = osuModsValueLabel(mods);
  const summary = buildOsuRecordsFilterSummary({
    mods, starMin, starMax, accuracyMin, accuracyMax, ppMin, ppMax,
  });

  const inputStyle = [
    filterShellStyles.rangeInput,
    { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
  ];

  return (
    <FilterShell collapsed={collapsed} summary={summary} barStyle={filterShellStyles.filterBarPlain}
      expandLabelPrefix="展开 osu! 成绩筛选" collapseLabel="收起 osu! 成绩筛选" resetLabel="重置 osu! 成绩筛选"
      onCollapsedChange={onCollapsedChange} onReset={onReset}
      onCollapse={() => { setModsOpen(false); onCollapsedChange(true); }}>
      <View testID="osu-records-filter-mods" style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>模组</Text>
        <Pressable
          accessibilityLabel={`osu! 成绩模组筛选，当前 ${modsLabel}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: modsOpen }}
          disabled={gameId === null}
          onPress={() => setModsOpen(true)}
          style={({ pressed }) => [styles.modTrigger, {
            backgroundColor: theme.input,
            borderColor: theme.border,
          }, pressed && styles.pressed]}
        >
          <Text numberOfLines={1} style={[styles.modTriggerText, { color: theme.text }]}>{modsLabel}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      </View>

      <View testID="osu-records-filter-star-row" style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>难度</Text>
        <RangeSelector accessibilityLabel="osu! 星数范围" minimum={starBounds.minimum} maximum={starBounds.maximum}
          step={0.01} lowerValue={starMin} upperValue={starMax}
          onLowerValueChange={onStarMinChange} onUpperValueChange={onStarMaxChange}
          formatValue={(value) => `${value.toFixed(2)}★`} testID="osu-records-filter-star" />
      </View>

      <View testID="osu-records-filter-accuracy-row" style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabel, filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>达成率</Text>
        <RangeSelector accessibilityLabel="osu! 达成率范围" minimum={0} maximum={100} step={0.01}
          lowerValue={accuracyMin} upperValue={accuracyMax}
          onLowerValueChange={onAccuracyMinChange} onUpperValueChange={onAccuracyMaxChange}
          formatValue={(value) => `${value.toFixed(2)}%`} testID="osu-records-filter-accuracy" />
      </View>

      <View testID="osu-records-filter-pp-row" style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>PP</Text>
        <View style={filterShellStyles.rangeRow}>
          <TextInput accessibilityLabel="最低 PP" autoCorrect={false} keyboardType="decimal-pad"
            testID="osu-records-filter-pp-min"
            placeholder="下限" placeholderTextColor={theme.textMuted} value={ppMin} onChangeText={onPpMinChange}
            style={inputStyle} />
          <Text style={filterShellStyles.rangeSeparator}>~</Text>
          <TextInput accessibilityLabel="最高 PP" autoCorrect={false} keyboardType="decimal-pad"
            testID="osu-records-filter-pp-max"
            placeholder="上限" placeholderTextColor={theme.textMuted} value={ppMax} onChangeText={onPpMaxChange}
            style={inputStyle} />
        </View>
      </View>
      {gameId && modsOpen ? <OsuModFilterSheet visible gameId={gameId} selectedMods={mods}
        onApply={onModsChange} onClose={() => setModsOpen(false)} /> : null}
    </FilterShell>
  );
}

const styles = StyleSheet.create({
  modTrigger: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  modTriggerText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  pressed: { opacity: 0.62 },
});
