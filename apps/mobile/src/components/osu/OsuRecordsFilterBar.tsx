import { MetricFilterRangeRow } from '@/components/game-content/MetricFilterRows';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { FilterRow, FilterSheetRow, FilterShell, filterShellStyles, joinFilterSummary } from '@/components/game-content/FilterShell';
import type { RangeBounds } from '@/components/game-content/RangeSelector';
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

export function osuModsValueLabel(mods: readonly string[]): string {
  if (mods.length === 0) return '全部';
  return mods.map(modLabel).join(' · ');
}

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
      <FilterSheetRow label="模组" value={modsLabel} testID="osu-records-filter-mods"
        accessibilityLabel={`osu! 成绩模组筛选，当前 ${modsLabel}`}
        expanded={modsOpen} disabled={gameId === null} onPress={() => setModsOpen(true)} />

      <MetricFilterRangeRow label="难度" rowTestID="osu-records-filter-star-row" accessibilityLabel="osu! 星数范围" {...starBounds}
          step={0.01} lowerValue={starMin} upperValue={starMax}
          onLowerValueChange={onStarMinChange} onUpperValueChange={onStarMaxChange}
          formatValue={(value) => `${value.toFixed(2)}★`} testID="osu-records-filter-star" />

      <MetricFilterRangeRow label="达成率" wide rowTestID="osu-records-filter-accuracy-row" accessibilityLabel="osu! 达成率范围" minimum={0} maximum={100} step={0.01}
          lowerValue={accuracyMin} upperValue={accuracyMax}
          onLowerValueChange={onAccuracyMinChange} onUpperValueChange={onAccuracyMaxChange}
          formatValue={(value) => `${value.toFixed(2)}%`} testID="osu-records-filter-accuracy" />

      <FilterRow label="PP" testID="osu-records-filter-pp-row">
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
      </FilterRow>
      {gameId && modsOpen ? <OsuModFilterSheet visible gameId={gameId} selectedMods={mods}
        onApply={onModsChange} onClose={() => setModsOpen(false)} /> : null}
    </FilterShell>
  );
}
