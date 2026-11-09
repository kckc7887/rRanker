import { MetricFilterRangeRow } from '@/components/game-content/MetricFilterRows';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { FilterRow, NeutralChip, FilterShell } from '@/components/game-content/FilterShell';
import {
  ARCADE_MAX_DISTANCE_KM,
  buildArcadeFilterSummary,
  type ArcadeGameTitle,
} from '@/domain/arcade-shops';

const EXPANDED_BODY_MAX_RATIO = 0.52;

export type ArcadeFilterBarProps = {
  collapsed: boolean;
  minDistanceKm: number;
  radiusKm: number;
  titleIds: readonly number[];
  gameTitles: readonly ArcadeGameTitle[];
  onCollapsedChange: (collapsed: boolean) => void;
  onMinDistanceChange: (minDistanceKm: number) => void;
  onRadiusChange: (radiusKm: number) => void;
  onTitleIdsChange: (titleIds: number[]) => void;
  onReset: () => void;
};

export function ArcadeFilterBar({
  collapsed,
  minDistanceKm,
  radiusKm,
  titleIds,
  gameTitles,
  onCollapsedChange,
  onMinDistanceChange,
  onRadiusChange,
  onTitleIdsChange,
  onReset,
}: ArcadeFilterBarProps) {
  const { height: windowHeight } = useWindowDimensions();
  const expandedBodyMaxHeight = Math.round(windowHeight * EXPANDED_BODY_MAX_RATIO);
  const summary = buildArcadeFilterSummary({
    minDistanceKm,
    radiusKm,
    titleIds,
    gameTitles,
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
        <MetricFilterRangeRow label="距离"
            minimum={0}
            maximum={ARCADE_MAX_DISTANCE_KM}
            step={1}
            lowerValue={String(minDistanceKm)}
            upperValue={String(radiusKm)}
            onLowerValueChange={value => onMinDistanceChange(Number(value || 0))}
            onUpperValueChange={value => onRadiusChange(Number(value || ARCADE_MAX_DISTANCE_KM))}
            formatValue={value => `${value} km`}
            accessibilityLabel="机厅距离范围"
            testID="arcade-distance" />

        <FilterRow label="机型" wide style={styles.filterRowTop}>
          <View style={styles.chipWrap}>
            <NeutralChip label="任意" active={titleIds.length === 0} onPress={() => onTitleIdsChange([])} />
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
        </FilterRow>
      </ScrollView>
    </FilterShell>
  );
}

const styles = StyleSheet.create({
  filterBarExpanded: { flexShrink: 1 },
  expandedBody: { gap: 10, paddingBottom: 4 },
  filterRowTop: { alignItems: 'flex-start' },
  chipWrap: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
});
