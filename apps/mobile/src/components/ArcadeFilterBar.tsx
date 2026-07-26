import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NeutralChip } from '@/components/MaimaiFilterBar';
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
  const summary = buildArcadeFilterSummary({
    radiusKm,
    titleIds,
    gameTitles,
    originLabel,
  });

  const toggleTitleId = (titleId: number) => {
    onTitleIdsChange(
      titleIds.includes(titleId)
        ? titleIds.filter((id) => id !== titleId)
        : [...titleIds, titleId],
    );
  };

  if (collapsed) {
    return (
      <View style={[styles.collapsedBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`展开筛选，当前 ${summary}`}
          accessibilityState={{ expanded: false }}
          onPress={() => onCollapsedChange(false)}
          style={styles.collapsedMain}
        >
          <Text style={[styles.collapsedLabel, { color: theme.textMuted }]}>筛选</Text>
          <Text numberOfLines={1} style={[styles.collapsedSummary, { color: theme.text }]}>{summary}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <ResetFilterButton onPress={onReset} />
          <Pressable accessible={false} hitSlop={8} onPress={() => onCollapsedChange(false)} style={styles.headerAction}>
            <CollapseToggleAction expanded={false} label="展开" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.filterBar,
        styles.filterBarExpanded,
        { backgroundColor: theme.surface, borderBottomColor: theme.border },
      ]}
    >
      <View style={styles.expandedHeader}>
        <Text style={[styles.expandedTitle, { color: theme.text }]}>筛选</Text>
        <View style={styles.headerActions}>
          <ResetFilterButton onPress={onReset} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="收起筛选"
            accessibilityState={{ expanded: true }}
            onPress={() => onCollapsedChange(true)}
            hitSlop={8}
            style={styles.headerAction}
          >
            <CollapseToggleAction expanded label="收起" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ maxHeight: expandedBodyMaxHeight }}
        contentContainerStyle={styles.expandedBody}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <View style={[styles.filterRow, styles.filterRowTop]}>
          <Text style={[styles.filterLabel, { color: theme.textMuted }]}>原点</Text>
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

        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, { color: theme.textMuted }]}>距离</Text>
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

        <View style={[styles.filterRow, styles.filterRowTop]}>
          <Text style={[styles.filterLabel, styles.wideFilterLabel, { color: theme.textMuted }]}>机型</Text>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="重置筛选"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.resetButton, pressed && styles.resetButtonPressed]}
    >
      <Text style={[styles.resetButtonText, { color: theme.accent }]}>重置</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterBar: { padding: 16, gap: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  filterBarExpanded: { flexShrink: 1 },
  expandedBody: { gap: 10, paddingBottom: 4 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterRowTop: { alignItems: 'flex-start' },
  filterLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 36, paddingTop: 1 },
  wideFilterLabel: { width: 44 },
  chipWrap: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  originBlock: { flex: 1, minWidth: 0, gap: 8 },
  originLabel: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
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
