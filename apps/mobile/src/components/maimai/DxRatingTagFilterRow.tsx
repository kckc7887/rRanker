import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DxRatingTagFilterState } from '@/components/MaimaiFilterBar';
import { filterShellStyles } from '@/components/game-content/FilterShell';
import { DxRatingTagFilterSheet } from '@/components/maimai/DxRatingTagFilterSheet';
import type { DxRatingChartTag } from '@/domain/dxrating-chart-tags';
import { useAppTheme } from '@/theme/app-theme';

export function DxRatingTagFilterRow({
  visible,
  tags,
  selectedTagIds,
  state,
  value,
  onApply,
  onOpen,
  onClose,
}: {
  visible: boolean;
  tags: readonly DxRatingChartTag[];
  selectedTagIds: readonly number[];
  state: DxRatingTagFilterState;
    value: string;
  onApply: (tagIds: number[]) => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();

  return (
    <View style={filterShellStyles.filterRow}>
      <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>标签</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`谱面标签筛选，${state === 'ready' ? `当前 ${value}` : value}`}
        accessibilityState={{ disabled: state !== 'ready', expanded: visible }}
        disabled={state !== 'ready'}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.tagFilterTrigger,
          { backgroundColor: theme.input, borderColor: theme.border },
          state !== 'ready' && styles.disabled,
          pressed && styles.tagFilterTriggerPressed,
        ]}
      >
        <Text numberOfLines={1} style={[styles.tagFilterValue, { color: theme.text }]}>{value}</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </Pressable>
      {visible ? (
        <DxRatingTagFilterSheet
          visible
          tags={tags}
          selectedTagIds={selectedTagIds}
          onApply={onApply}
          onClose={onClose}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tagFilterTrigger: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagFilterValue: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20 },
  tagFilterTriggerPressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
