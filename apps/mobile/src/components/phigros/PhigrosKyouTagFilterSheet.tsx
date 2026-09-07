import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TagFilterSheet, TagSheetPressable as SheetPressable, TAG_FILTER_STYLES } from '@/components/game-content/TagFilterSheet';
import type { PhigrosKyouTag, PhigrosKyouTagType } from '@/domain/phigros-kyou';
import { useAppTheme } from '@/theme/app-theme';


const GROUPS: readonly { type: PhigrosKyouTagType; label: string }[] = [
  { type: 'primary', label: '主要难点' },
  { type: 'secondary', label: '细分配置' },
];

export function PhigrosKyouTagFilterSheet({
  visible,
  tags,
  selectedTagIds,
  onApply,
  onClose,
}: {
  visible: boolean;
  tags: readonly PhigrosKyouTag[];
  selectedTagIds: readonly number[];
  onApply: (tagIds: number[]) => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const grouped = useMemo(() => GROUPS.map((group) => ({
    ...group,
    tags: tags.filter((tag) => tag.type === group.type),
  })), [tags]);

  return <TagFilterSheet visible={visible} tags={tags} selectedTagIds={selectedTagIds} onApply={onApply} onClose={onClose}
    title="谱面标签" testID="phigros-kyou-tag-filter-sheet">
    {(draftTagIds, toggleTag) => grouped.map((group) => <View key={group.type} testID={`phigros-kyou-tag-filter-group-${group.type}`} style={styles.group}>
          <View style={[styles.groupHeader, {
            backgroundColor: group.type === 'primary' ? theme.accentSoft : theme.surfaceMuted,
            borderColor: group.type === 'primary' ? theme.accent : theme.border,
          }]}>
            <Text style={[styles.groupTypeMark, { color: group.type === 'primary' ? theme.accent : theme.textMuted }]}>
              {group.type === 'primary' ? '主' : '细'}
            </Text>
            <Text style={[styles.groupName, { color: group.type === 'primary' ? theme.accent : theme.textSecondary }]}>{group.label}</Text>
          </View>
          <View style={styles.tagWrap}>
            {group.tags.map((tag) => {
              const selected = draftTagIds.has(tag.id);
              return <SheetPressable key={tag.id} accessibilityRole="checkbox"
                accessibilityLabel={`谱面标签 ${tag.name}，${selected ? '已选中' : '未选中'}`}
                accessibilityState={{ checked: selected }} onPress={() => toggleTag(tag.id)}
                testID={`phigros-kyou-tag-filter-option-${tag.id}`}
                style={({ pressed }) => [styles.tagFrame, {
                  borderColor: selected ? theme.accent : 'transparent',
                }, pressed && styles.pressed]}>
                <View style={[styles.tag, {
                  backgroundColor: tag.type === 'primary' ? theme.accentSoft : theme.surfaceMuted,
                  borderColor: tag.type === 'primary' ? theme.accent : theme.border,
                }]}>
                  <Text style={[styles.tagTypeMark, { color: tag.type === 'primary' ? theme.accent : theme.textMuted }]}>
                    {tag.type === 'primary' ? '主' : '细'}
                  </Text>
                  <Text style={[styles.tagText, { color: selected || tag.type === 'primary' ? theme.accent : theme.textSecondary }]}>{tag.name}</Text>
                </View>
              </SheetPressable>;
            })}
          </View>
        </View>)}
  </TagFilterSheet>;
}

const styles = StyleSheet.create({
  ...TAG_FILTER_STYLES,
  groupHeader: { alignSelf: 'flex-start', minHeight: 28, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTypeMark: { fontSize: 10, lineHeight: 14, fontWeight: '900' },
  groupName: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  tag: { minHeight: 30, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  tagTypeMark: { fontSize: 9, lineHeight: 13, fontWeight: '900' },
  tagText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
