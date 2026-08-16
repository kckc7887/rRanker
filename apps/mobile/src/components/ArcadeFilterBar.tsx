import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { NeutralChip } from '@/components/MaimaiFilterBar';
import { FilterShell, filterShellStyles } from '@/components/game-content/FilterShell';
import {
  ARCADE_RADIUS_OPTIONS,
  buildArcadeFilterSummary,
  type ArcadeGameTitle,
  type ArcadeOrigin,
  type ArcadeRadiusKm,
} from '@/domain/arcade-shops';
import { useAppTheme } from '@/theme/app-theme';

/** Keep room for search + a slice of the shop list when filters are expanded. */
const EXPANDED_BODY_MAX_RATIO = 0.52;

export type ArcadeFilterBarProps = {
  collapsed: boolean;
  origin: ArcadeOrigin | null;
  radiusKm: ArcadeRadiusKm;
  titleIds: readonly number[];
  gameTitles: readonly ArcadeGameTitle[];
  locatingOrigin?: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onUseGpsOrigin: () => void;
  onEditOrigin: () => void;
  onRadiusChange: (radiusKm: ArcadeRadiusKm) => void;
  onTitleIdsChange: (titleIds: number[]) => void;
  onReset: () => void;
};

export function ArcadeFilterBar({
  collapsed,
  origin,
  radiusKm,
  titleIds,
  gameTitles,
  locatingOrigin = false,
  onCollapsedChange,
  onUseGpsOrigin,
  onEditOrigin,
  onRadiusChange,
  onTitleIdsChange,
  onReset,
}: ArcadeFilterBarProps) {
  const theme = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const expandedBodyMaxHeight = Math.round(windowHeight * EXPANDED_BODY_MAX_RATIO);
  const originLabel = origin?.label?.trim() || (locatingOrigin ? '定位中…' : '未设置');
  // Collapsed summary only shows a custom origin address; GPS "当前位置" stays out of the chip line.
  const summary = buildArcadeFilterSummary({
    radiusKm,
    titleIds,
    gameTitles,
    originLabel: origin?.source === 'custom' ? originLabel : undefined,
  });

  const toggleTitleId = (titleId: number) => {
    onTitleIdsChange(
      titleIds.includes(titleId)
        ? titleIds.filter((id) => id !== titleId)
        : [...titleIds, titleId],
    );
  };

  return (
    <FilterShell collapsed={collapsed} summary={summary} barExtraStyle={styles.filterBarExpanded}
      onCollapsedChange={onCollapsedChange} onReset={onReset}>
      <ScrollView
        style={{ maxHeight: expandedBodyMaxHeight }}
        contentContainerStyle={styles.expandedBody}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={[filterShellStyles.filterRow, styles.filterRowTop]}>
          <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>原点</Text>
          <View style={styles.originBlock}>
            <Text numberOfLines={2} style={[styles.originLabel, { color: theme.text }]}>
              {originLabel}
            </Text>
            <View style={styles.chipWrap}>
              <NeutralChip
                label={locatingOrigin && origin?.source !== 'custom' ? '定位中…' : '当前位置'}
                active={origin?.source === 'gps'}
                onPress={onUseGpsOrigin}
                accessibilityLabel="使用当前定位作为搜索原点"
              />
              <NeutralChip
                label="搜索地址"
                active={origin?.source === 'custom'}
                onPress={onEditOrigin}
                accessibilityLabel="搜索地址设为搜索原点"
              />
            </View>
          </View>
        </View>

        <View style={filterShellStyles.filterRow}>
          <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>距离</Text>
          <View style={styles.chipWrap}>
            {ARCADE_RADIUS_OPTIONS.map((radius) => (
              <NeutralChip
                key={radius}
                label={`${radius} km`}
                active={radiusKm === radius}
                onPress={() => onRadiusChange(radius)}
                accessibilityLabel={`筛选距离 ${radius} 公里`}
              />
            ))}
          </View>
        </View>

        <View style={[filterShellStyles.filterRow, styles.filterRowTop]}>
          <Text style={[filterShellStyles.filterLabel, filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>机型</Text>
          <View style={styles.chipWrap}>
            {gameTitles.map((title) => (
              <NeutralChip
                key={title.id}
                label={title.name}
                active={titleIds.includes(title.id)}
                onPress={() => toggleTitleId(title.id)}
                accessibilityLabel={`筛选机型 ${title.name}`}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </FilterShell>
  );
}

// 机厅查找专属样式：展开态收缩、滚动体与原点/机型行；其余公共样式见 game-content/FilterShell。
const styles = StyleSheet.create({
  filterBarExpanded: { flexShrink: 1 },
  expandedBody: { gap: 10, paddingBottom: 4 },
  filterRowTop: { alignItems: 'flex-start' },
  chipWrap: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  originBlock: { flex: 1, minWidth: 0, gap: 8 },
  originLabel: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
