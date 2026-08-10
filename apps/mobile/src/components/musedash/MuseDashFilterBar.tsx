import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FilterAnchoredDropdown, type FilterSelectOption } from '@/components/FilterAnchoredDropdown';
import { MUSE_DASH_DIFFICULTY_LABELS } from '@/domain/muse-dash';
import { useAppTheme } from '@/theme/app-theme';

export type MuseDashRecordSort = 'rating' | 'score' | 'acc';
export type MuseDashPlatform = 'all' | 'mobile' | 'pc';
export type MuseDashDifficultySlot = 'all' | 0 | 1 | 2 | 3 | 4;

const RECORD_SORTS: readonly FilterSelectOption<MuseDashRecordSort>[] = [
  { value: 'rating', label: 'Rating' },
  { value: 'score', label: '分数' },
  { value: 'acc', label: 'ACC' },
];

const PLATFORMS: readonly FilterSelectOption<MuseDashPlatform>[] = [
  { value: 'all', label: '全部' },
  { value: 'mobile', label: '移动端' },
  { value: 'pc', label: 'PC 端' },
];

const DIFFICULTY_SLOTS: readonly FilterSelectOption<string>[] = [
  { value: 'all', label: '全部' },
  ...MUSE_DASH_DIFFICULTY_LABELS.map((label, index) => ({ value: String(index), label })),
];

function CollapseToggleAction({ expanded, label }: { expanded: boolean; label: string }) {
  const theme = useAppTheme();
  return <View style={styles.collapseActionRow}>
    <Text style={[styles.collapseAction, { color: theme.accent }]}>{label}</Text>
    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.accent} />
  </View>;
}

function ResetFilterButton({ onPress }: { onPress: () => void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="重置筛选" onPress={onPress}
    hitSlop={8} style={({ pressed }) => [styles.resetButton, pressed && styles.resetButtonPressed]}>
    <Text style={[styles.resetButtonText, { color: theme.accent }]}>重置</Text>
  </Pressable>;
}

export function MuseDashRecordsFilterBar({
  expanded, sortBy, platform, onExpandedChange, onSortByChange, onPlatformChange, onReset,
}: {
  expanded: boolean;
  sortBy: MuseDashRecordSort;
  platform: MuseDashPlatform;
  onExpandedChange: (expanded: boolean) => void;
  onSortByChange: (sort: MuseDashRecordSort) => void;
  onPlatformChange: (platform: MuseDashPlatform) => void;
  onReset: () => void;
}) {
  const theme = useAppTheme();
  const [openDropdown, setOpenDropdown] = useState<'sort' | 'platform' | null>(null);
  const sortLabel = RECORD_SORTS.find((item) => item.value === sortBy)?.label ?? sortBy;
  const platformLabel = PLATFORMS.find((item) => item.value === platform)?.label ?? '全部';
  const summary = `${sortLabel} · ${platformLabel}`;
  if (!expanded) {
    return (
      <View style={[styles.collapsedBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`展开筛选，当前 ${summary}`}
          accessibilityState={{ expanded: false }} onPress={() => onExpandedChange(true)}
          style={styles.collapsedMain}>
          <Text style={[styles.collapsedLabel, { color: theme.textMuted }]}>筛选</Text>
          <Text numberOfLines={1} style={[styles.collapsedSummary, { color: theme.text }]}>{summary}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <ResetFilterButton onPress={onReset} />
          <Pressable accessible={false} hitSlop={8} onPress={() => onExpandedChange(true)} style={styles.headerAction}>
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
          <ResetFilterButton onPress={onReset} />
          <Pressable accessibilityRole="button" accessibilityLabel="收起筛选"
            accessibilityState={{ expanded: true }}
            onPress={() => { setOpenDropdown(null); onExpandedChange(false); }} hitSlop={8}
            style={styles.headerAction}>
            <CollapseToggleAction expanded label="收起" />
          </Pressable>
        </View>
      </View>
      <View style={styles.filterRow}>
        <Text style={[styles.filterLabel, { color: theme.textMuted }]}>排序</Text>
        <View style={styles.dropdownControls}>
          <FilterAnchoredDropdown
            open={openDropdown === 'sort'}
            onOpenChange={(open) => setOpenDropdown(open ? 'sort' : null)}
            valueLabel={sortLabel}
            accessibilityLabel={`排序筛选，当前 ${sortLabel}`}
            options={RECORD_SORTS}
            selectedValue={sortBy}
            onSelect={onSortByChange}
            optionAccessibilityPrefix="选择排序"
          />
          <FilterAnchoredDropdown
            open={openDropdown === 'platform'}
            onOpenChange={(open) => setOpenDropdown(open ? 'platform' : null)}
            valueLabel={platformLabel}
            accessibilityLabel={`平台筛选，当前 ${platformLabel}`}
            options={PLATFORMS}
            selectedValue={platform}
            onSelect={onPlatformChange}
            optionAccessibilityPrefix="选择平台"
          />
        </View>
      </View>
    </View>
  );
}

export function MuseDashCatalogFilterBar({
  expanded, difficultySlot, onExpandedChange, onDifficultySlotChange, onReset,
}: {
  expanded: boolean;
  difficultySlot: MuseDashDifficultySlot;
  onExpandedChange: (expanded: boolean) => void;
  onDifficultySlotChange: (slot: MuseDashDifficultySlot) => void;
  onReset: () => void;
}) {
  const theme = useAppTheme();
  const [openDropdown, setOpenDropdown] = useState(false);
  const slotLabel = DIFFICULTY_SLOTS.find((item) => item.value === String(difficultySlot))?.label ?? '全部';
  const summary = `难度 ${slotLabel}`;
  if (!expanded) {
    return (
      <View style={[styles.collapsedBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`展开筛选，当前 ${summary}`}
          accessibilityState={{ expanded: false }} onPress={() => onExpandedChange(true)}
          style={styles.collapsedMain}>
          <Text style={[styles.collapsedLabel, { color: theme.textMuted }]}>筛选</Text>
          <Text numberOfLines={1} style={[styles.collapsedSummary, { color: theme.text }]}>{summary}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <ResetFilterButton onPress={onReset} />
          <Pressable accessible={false} hitSlop={8} onPress={() => onExpandedChange(true)} style={styles.headerAction}>
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
          <ResetFilterButton onPress={onReset} />
          <Pressable accessibilityRole="button" accessibilityLabel="收起筛选"
            accessibilityState={{ expanded: true }}
            onPress={() => { setOpenDropdown(false); onExpandedChange(false); }} hitSlop={8}
            style={styles.headerAction}>
            <CollapseToggleAction expanded label="收起" />
          </Pressable>
        </View>
      </View>
      <View style={styles.filterRow}>
        <Text style={[styles.filterLabel, { color: theme.textMuted }]}>难度</Text>
        <View style={styles.dropdownControls}>
          <FilterAnchoredDropdown
            open={openDropdown}
            onOpenChange={setOpenDropdown}
            valueLabel={slotLabel}
            accessibilityLabel={`难度筛选，当前 ${slotLabel}`}
            options={DIFFICULTY_SLOTS}
            selectedValue={String(difficultySlot)}
            onSelect={(value) => onDifficultySlotChange(value === 'all' ? 'all' : Number(value) as MuseDashDifficultySlot)}
            optionAccessibilityPrefix="选择难度"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  filterBar: { padding: 16, gap: 10, borderBottomWidth: 1 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterLabel: { color: '#6B7280', fontSize: 12, fontWeight: '600', width: 36, paddingTop: 1 },
  dropdownControls: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
