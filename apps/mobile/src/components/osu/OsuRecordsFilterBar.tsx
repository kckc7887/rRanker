import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { FilterCheckboxList, type FilterCheckboxOption } from '@/components/game-content/FilterCheckboxList';
import { FilterShell, filterShellStyles, joinFilterSummary } from '@/components/game-content/FilterShell';
import {
  OSU_MOD_FILTER_NONE,
  OSU_RECORDS_MOD_FILTERS,
} from '@/domain/osu-filters';
import { useAppTheme } from '@/theme/app-theme';

export interface OsuRecordsFilterBarProps {
  collapsed: boolean;
  mods: readonly string[];
  starMin: string;
  starMax: string;
  accuracyMin: string;
  accuracyMax: string;
  ppMin: string;
  ppMax: string;
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
  mods,
  starMin,
  starMax,
  accuracyMin,
  accuracyMax,
  ppMin,
  ppMax,
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
  const modOptions = useMemo<FilterCheckboxOption<string>[]>(
    () => OSU_RECORDS_MOD_FILTERS.map((item) => ({ value: item.flag, label: item.label })),
    [],
  );
  const modsLabel = osuModsValueLabel(mods);
  const summary = buildOsuRecordsFilterSummary({
    mods, starMin, starMax, accuracyMin, accuracyMax, ppMin, ppMax,
  });

  // NM 互斥：新勾 NM 时清除其余；NM 已选时新勾具体模组则移除 NM。
  const handleModsChange = (values: string[]) => {
    const hasNone = values.includes(OSU_MOD_FILTER_NONE);
    if (hasNone && !mods.includes(OSU_MOD_FILTER_NONE)) {
      onModsChange([OSU_MOD_FILTER_NONE]);
      return;
    }
    if (hasNone && mods.includes(OSU_MOD_FILTER_NONE) && values.length > 1) {
      onModsChange(values.filter((value) => value !== OSU_MOD_FILTER_NONE));
      return;
    }
    onModsChange(values);
  };

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
        <FilterCheckboxList
          accessibilityLabel={`osu! 成绩模组筛选，当前 ${modsLabel}`}
          caption="模组"
          onOpenChange={setModsOpen}
          open={modsOpen}
          optionAccessibilityPrefix="选择模组"
          options={modOptions}
          selectedValues={mods}
          onValuesChange={handleModsChange}
          valueLabel={modsLabel}
        />
      </View>

      <View testID="osu-records-filter-star-row" style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>难度</Text>
        <View style={filterShellStyles.rangeRow}>
          <TextInput accessibilityLabel="最低星数" autoCorrect={false} keyboardType="decimal-pad"
            testID="osu-records-filter-star-min"
            placeholder="下限" placeholderTextColor={theme.textMuted} value={starMin} onChangeText={onStarMinChange}
            style={inputStyle} />
          <Text style={filterShellStyles.rangeSeparator}>~</Text>
          <TextInput accessibilityLabel="最高星数" autoCorrect={false} keyboardType="decimal-pad"
            testID="osu-records-filter-star-max"
            placeholder="上限" placeholderTextColor={theme.textMuted} value={starMax} onChangeText={onStarMaxChange}
            style={inputStyle} />
        </View>
      </View>

      <View testID="osu-records-filter-accuracy-row" style={filterShellStyles.filterRow}>
        <Text style={[filterShellStyles.filterLabel, filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>达成率</Text>
        <View style={filterShellStyles.rangeRow}>
          <TextInput accessibilityLabel="最低达成率" autoCorrect={false} keyboardType="decimal-pad"
            testID="osu-records-filter-accuracy-min"
            placeholder="下限" placeholderTextColor={theme.textMuted} value={accuracyMin} onChangeText={onAccuracyMinChange}
            style={inputStyle} />
          <Text style={filterShellStyles.rangeSeparator}>~</Text>
          <TextInput accessibilityLabel="最高达成率" autoCorrect={false} keyboardType="decimal-pad"
            testID="osu-records-filter-accuracy-max"
            placeholder="上限" placeholderTextColor={theme.textMuted} value={accuracyMax} onChangeText={onAccuracyMaxChange}
            style={inputStyle} />
        </View>
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
    </FilterShell>
  );
}
