import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TagFilterSheet, TagSheetPressable as SheetPressable, TAG_FILTER_STYLES } from '@/components/game-content/TagFilterSheet';
import type { DxRatingChartTag } from '@/domain/dxrating-chart-tags';
import { useAppTheme } from '@/theme/app-theme';


interface DxRatingTagGroup {
  id: number;
  name: string;
  tags: DxRatingChartTag[];
}

export function DxRatingTagFilterSheet({
  visible,
  tags,
  selectedTagIds,
  onApply,
  onClose,
}: {
  visible: boolean;
  tags: readonly DxRatingChartTag[];
  selectedTagIds: readonly number[];
  onApply: (tagIds: number[]) => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const groups = useMemo(() => {
    const result: DxRatingTagGroup[] = [];
    const byId = new Map<number, DxRatingTagGroup>();
    for (const tag of tags) {
      let group = byId.get(tag.groupId);
      if (!group) {
        group = { id: tag.groupId, name: tag.groupName, tags: [] };
        byId.set(tag.groupId, group);
        result.push(group);
      }
      group.tags.push(tag);
    }
    return result;
  }, [tags]);

  return <TagFilterSheet visible={visible} tags={tags} selectedTagIds={selectedTagIds} onApply={onApply} onClose={onClose}
    title="标签" testID="dxrating-tag-filter-sheet">
    {(draftTagIds, toggleTag) => groups.map((group) => <View key={group.id} testID={`dxrating-tag-filter-group-${group.id}`} style={styles.group}>
          <Text style={[styles.groupName, { color: theme.textMuted }]}>{group.name}</Text>
          <View style={styles.tagWrap}>
            {group.tags.map((tag) => {
              const selected = draftTagIds.has(tag.id);
              return <SheetPressable key={tag.id} accessibilityRole="checkbox"
                accessibilityLabel={`谱面标签 ${tag.name}，${selected ? '已选中' : '未选中'}`}
                accessibilityState={{ checked: selected }} onPress={() => toggleTag(tag.id)}
                testID={`dxrating-tag-filter-option-${tag.id}`}
                style={({ pressed }) => [
                  styles.tagFrame,
                  { borderColor: selected ? theme.accent : 'transparent' },
                  pressed && styles.pressed,
                ]}>
                <View style={[styles.tag, { backgroundColor: tag.color }]}>
                  <Text style={styles.tagText}>{tag.name}</Text>
                </View>
              </SheetPressable>;
            })}
          </View>
        </View>)}
  </TagFilterSheet>;
}

const styles = StyleSheet.create({
  ...TAG_FILTER_STYLES,
  groupName: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  tag: { minHeight: 30, borderRadius: 999, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  tagText: { color: '#0C4A6E', fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
