import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DxRatingTagFilterState } from '@/components/MaimaiFilterBar';
import { filterShellStyles } from '@/components/game-content/FilterShell';
import { DxRatingTagFilterSheet } from '@/components/maimai/DxRatingTagFilterSheet';
import type { DxRatingChartTag } from '@/domain/dxrating-chart-tags';
import { useAppTheme } from '@/theme/app-theme';

/**
 * 舞萌谱面标签筛选入口：触发行与弹层都属于舞萌模块。
 *
 * 公共筛选条只保留通用能力，本入口经组合边界的扩展注册表注入；
 * 弹层开关状态仍由调用方持有，重置筛选时由调用方收起。
 */
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
  /** 已格式化的当前选择文案，由公共筛选条按公共格式化入口提供。 */
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
