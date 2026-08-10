import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MUSE_DASH_DIFFICULTY_LABELS } from '@/domain/muse-dash';
import { useAppTheme } from '@/theme/app-theme';

export type MuseDashRecordSort = 'rating' | 'score' | 'acc';
export type MuseDashPlatform = 'all' | 'mobile' | 'pc';
export type MuseDashDifficultySlot = 'all' | 0 | 1 | 2 | 3 | 4;

const RECORD_SORTS: readonly { id: MuseDashRecordSort; label: string }[] = [
  { id: 'rating', label: 'Rating' }, { id: 'score', label: '分数' }, { id: 'acc', label: 'ACC' },
];

const DIFFICULTY_SLOTS: readonly { id: MuseDashDifficultySlot; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 0, label: MUSE_DASH_DIFFICULTY_LABELS[0] }, { id: 1, label: MUSE_DASH_DIFFICULTY_LABELS[1] },
  { id: 2, label: MUSE_DASH_DIFFICULTY_LABELS[2] }, { id: 3, label: MUSE_DASH_DIFFICULTY_LABELS[3] }, { id: 4, label: MUSE_DASH_DIFFICULTY_LABELS[4] },
];

function Chip({
  label, active, onPress, accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ selected: active }} onPress={onPress}
    style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }, active && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
    <Text style={[styles.chipText, { color: active ? '#FFFFFF' : theme.textSecondary }]}>{label}</Text>
  </Pressable>;
}

function FilterShell({
  expanded, summary, onExpandedChange, onReset, children,
}: {
  expanded: boolean;
  summary: string;
  onExpandedChange: (expanded: boolean) => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  const theme = useAppTheme();
  if (!expanded) {
    return <Pressable accessibilityRole="button" accessibilityLabel="展开筛选器" onPress={() => onExpandedChange(true)}
      style={[styles.collapsed, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Ionicons name="options-outline" size={16} color={theme.textMuted} />
      <Text style={[styles.collapsedTitle, { color: theme.text }]}>筛选</Text>
      <Text numberOfLines={1} style={[styles.summary, { color: theme.textMuted }]}>{summary}</Text>
      <Text style={[styles.actionText, { color: theme.accent }]}>展开</Text>
      <Ionicons name="chevron-down" size={14} color={theme.accent} />
    </Pressable>;
  }
  return <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={styles.header}>
      <Text style={[styles.headerTitle, { color: theme.text }]}>筛选与排序</Text>
      <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="重置筛选" onPress={onReset} style={styles.headerButton}>
          <Text style={[styles.actionText, { color: theme.accent }]}>重置</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="收起筛选器" onPress={() => onExpandedChange(false)} style={styles.headerButton}>
          <Text style={[styles.actionText, { color: theme.accent }]}>收起</Text>
          <Ionicons name="chevron-up" size={14} color={theme.accent} />
        </Pressable>
      </View>
    </View>
    {children}
  </View>;
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
  const sortLabel = RECORD_SORTS.find((item) => item.id === sortBy)?.label ?? sortBy;
  const platformLabel = platform === 'all' ? '全部平台' : platform === 'pc' ? 'PC 端' : '移动端';
  return <FilterShell expanded={expanded} summary={`${sortLabel} · ${platformLabel}`}
    onExpandedChange={onExpandedChange} onReset={onReset}>
    <View style={styles.row}><Text style={[styles.label, { color: theme.textMuted }]}>排序</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {RECORD_SORTS.map((item) => <Chip key={item.id} label={item.label} accessibilityLabel={`排序 ${item.label}`}
          active={sortBy === item.id} onPress={() => onSortByChange(item.id)} />)}
      </ScrollView>
    </View>
    <View style={styles.row}><Text style={[styles.label, { color: theme.textMuted }]}>平台</Text><View style={styles.wrap}>
      {(['all', 'mobile', 'pc'] as const).map((item) => <Chip key={item} label={item === 'all' ? '全部' : item === 'pc' ? 'PC 端' : '移动端'}
        accessibilityLabel={`平台 ${item === 'all' ? '全部' : item === 'pc' ? 'PC 端' : '移动端'}`}
        active={platform === item} onPress={() => onPlatformChange(item)} />)}
    </View></View>
  </FilterShell>;
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
  const slotLabel = DIFFICULTY_SLOTS.find((item) => item.id === difficultySlot)?.label ?? '全部';
  return <FilterShell expanded={expanded} summary={`难度 ${slotLabel}`}
    onExpandedChange={onExpandedChange} onReset={onReset}>
    <View style={styles.row}><Text style={[styles.label, { color: theme.textMuted }]}>难度</Text><View style={styles.wrap}>
      {DIFFICULTY_SLOTS.map((item) => <Chip key={String(item.id)} label={item.label} accessibilityLabel={`难度 ${item.label}`}
        active={difficultySlot === item.id}
        onPress={() => onDifficultySlotChange(item.id)} />)}
    </View></View>
  </FilterShell>;
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  collapsed: { minHeight: 48, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 7 },
  collapsedTitle: { fontSize: 12, fontWeight: '800' }, summary: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '600' },
  header: { minHeight: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 13, fontWeight: '800' }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerButton: { minHeight: 28, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 2 }, actionText: { fontSize: 12, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, label: { width: 36, fontSize: 12, fontWeight: '700' },
  chipRow: { gap: 6, alignItems: 'center' }, wrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 32, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: '700' },
});
