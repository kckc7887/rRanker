import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { TufLevelSort, TufPassSort, TufSortOrder } from '@/domain/tuf';
import { useAppTheme } from '@/theme/app-theme';

export type TufDifficultyBand = 'all' | 'P' | 'G' | 'U';

const RECORD_SORTS: readonly { id: TufPassSort; label: string }[] = [
  { id: 'date', label: '日期' }, { id: 'score', label: 'Score' }, { id: 'speed', label: '速度' },
  { id: 'xacc', label: 'XACC' }, { id: 'difficulty', label: '难度' }, { id: 'impact', label: 'Impact' },
];

const LEVEL_SORTS: readonly { id: TufLevelSort; label: string }[] = [
  { id: 'RECENT', label: '最近更新' }, { id: 'DIFF', label: '难度' }, { id: 'CLEARS', label: '通关人数' },
  { id: 'TOTAL_CLEARS', label: '通关次数' }, { id: 'LIKES', label: '喜欢' },
  { id: 'BASESCORE', label: '基准分' }, { id: 'BPM', label: 'BPM' }, { id: 'TILES', label: '物量' },
  { id: 'TIME', label: '时长' },
];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
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

function SortOrderRow({ value, onChange }: { value: TufSortOrder; onChange: (value: TufSortOrder) => void }) {
  const theme = useAppTheme();
  return <View style={styles.row}>
    <Text style={[styles.spacerLabel, { color: theme.textMuted }]}>顺序</Text>
    <View style={styles.wrap}>
      <Chip label="降序 ↓" active={value === 'DESC'} onPress={() => onChange('DESC')} />
      <Chip label="升序 ↑" active={value === 'ASC'} onPress={() => onChange('ASC')} />
    </View>
  </View>;
}

export function TufRecordsFilterBar({
  expanded, sortBy, order, bestPerLevel, onExpandedChange, onSortByChange, onOrderChange, onBestPerLevelChange, onReset,
}: {
  expanded: boolean;
  sortBy: TufPassSort;
  order: TufSortOrder;
  bestPerLevel: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSortByChange: (sort: TufPassSort) => void;
  onOrderChange: (order: TufSortOrder) => void;
  onBestPerLevelChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const theme = useAppTheme();
  const sortLabel = RECORD_SORTS.find((item) => item.id === sortBy)?.label ?? sortBy;
  return <FilterShell expanded={expanded} summary={`${sortLabel} · ${order === 'DESC' ? '降序' : '升序'}${bestPerLevel ? ' · 每关最佳' : ''}`}
    onExpandedChange={onExpandedChange} onReset={onReset}>
    <View style={styles.row}><Text style={[styles.label, { color: theme.textMuted }]}>排序</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {RECORD_SORTS.map((item) => <Chip key={item.id} label={item.label} active={sortBy === item.id} onPress={() => onSortByChange(item.id)} />)}
      </ScrollView>
    </View>
    <SortOrderRow value={order} onChange={onOrderChange} />
    <Pressable accessibilityRole="switch" accessibilityLabel="每关最佳" accessibilityState={{ checked: bestPerLevel }}
      onPress={() => onBestPerLevelChange(!bestPerLevel)} style={styles.switchRow}>
      <View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.text }]}>每关最佳</Text>
        <Text style={[styles.switchHint, { color: theme.textMuted }]}>每个关卡只保留公开最佳成绩</Text></View>
      <Switch pointerEvents="none" value={bestPerLevel} />
    </Pressable>
  </FilterShell>;
}

export function TufCatalogFilterBar({
  expanded, sortBy, order, difficultyBand, includeSpecial, specialAvailable,
  onExpandedChange, onSortByChange, onOrderChange, onDifficultyBandChange, onIncludeSpecialChange, onReset,
}: {
  expanded: boolean;
  sortBy: TufLevelSort;
  order: TufSortOrder;
  difficultyBand: TufDifficultyBand;
  includeSpecial: boolean;
  specialAvailable: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSortByChange: (sort: TufLevelSort) => void;
  onOrderChange: (order: TufSortOrder) => void;
  onDifficultyBandChange: (band: TufDifficultyBand) => void;
  onIncludeSpecialChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const theme = useAppTheme();
  const sortLabel = LEVEL_SORTS.find((item) => item.id === sortBy)?.label ?? sortBy;
  return <FilterShell expanded={expanded} summary={`${sortLabel} · ${order === 'DESC' ? '降序' : '升序'} · ${difficultyBand === 'all' ? '全部 PGU' : `${difficultyBand} 段`}${includeSpecial ? ' + 特殊' : ''}`}
    onExpandedChange={onExpandedChange} onReset={onReset}>
    <View style={styles.row}><Text style={[styles.label, { color: theme.textMuted }]}>排序</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {LEVEL_SORTS.map((item) => <Chip key={item.id} label={item.label} active={sortBy === item.id} onPress={() => onSortByChange(item.id)} />)}
      </ScrollView>
    </View>
    <SortOrderRow value={order} onChange={onOrderChange} />
    <View style={styles.row}><Text style={[styles.label, { color: theme.textMuted }]}>难度</Text><View style={styles.wrap}>
      {(['all', 'P', 'G', 'U'] as const).map((band) => <Chip key={band} label={band === 'all' ? '全部' : band}
        active={difficultyBand === band} onPress={() => onDifficultyBandChange(band)} />)}
    </View></View>
    <Pressable accessibilityRole="switch" accessibilityLabel="包含特殊难度"
      accessibilityState={{ checked: includeSpecial, disabled: !specialAvailable }} disabled={!specialAvailable}
      onPress={() => onIncludeSpecialChange(!includeSpecial)} style={[styles.switchRow, !specialAvailable && styles.disabled]}>
      <View style={styles.switchCopy}><Text style={[styles.switchTitle, { color: theme.text }]}>包含特殊难度</Text>
        <Text style={[styles.switchHint, { color: theme.textMuted }]}>{specialAvailable ? '包含 Unranked、SPECIAL 与 LEGACY' : '正在读取 TUF 难度列表'}</Text></View>
      <Switch pointerEvents="none" disabled={!specialAvailable} value={includeSpecial && specialAvailable} />
    </Pressable>
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
  spacerLabel: { width: 36, fontSize: 12, fontWeight: '700' },
  chipRow: { gap: 6, alignItems: 'center' }, wrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 32, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: '700' }, switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchCopy: { flex: 1, gap: 2 }, switchTitle: { fontSize: 13, fontWeight: '700' }, switchHint: { fontSize: 11, lineHeight: 15 }, disabled: { opacity: 0.55 },
});
