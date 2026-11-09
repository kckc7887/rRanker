import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TagFilterSheet } from '@/components/game-content/TagFilterSheet';
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
    title="谱面标签" testID="phigros-kyou-tag-filter"
    groups={grouped.map(group => {
      const primary = group.type === 'primary';
      return {
        key: group.type, tags: group.tags,
        header: <View style={[styles.groupHeader, {
          backgroundColor: primary ? theme.accentSoft : theme.surfaceMuted,
          borderColor: primary ? theme.accent : theme.border,
        }]}>
          <Text style={[styles.groupTypeMark, { color: primary ? theme.accent : theme.textMuted }]}>{primary ? '主' : '细'}</Text>
          <Text style={[styles.groupName, { color: primary ? theme.accent : theme.textSecondary }]}>{group.label}</Text>
        </View>,
      };
    })}
    renderTag={(tag, selected) => {
      const primary = tag.type === 'primary';
      return <View style={[styles.tag, {
        backgroundColor: primary ? theme.accentSoft : theme.surfaceMuted,
        borderColor: primary ? theme.accent : theme.border,
      }]}>
        <Text style={[styles.tagTypeMark, { color: primary ? theme.accent : theme.textMuted }]}>{primary ? '主' : '细'}</Text>
        <Text style={[styles.tagText, { color: selected || primary ? theme.accent : theme.textSecondary }]}>{tag.name}</Text>
      </View>;
    }} />;
}

const styles = StyleSheet.create({
  groupHeader: { alignSelf: 'flex-start', minHeight: 28, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTypeMark: { fontSize: 10, lineHeight: 14, fontWeight: '900' },
  groupName: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  tag: { minHeight: 30, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  tagTypeMark: { fontSize: 9, lineHeight: 13, fontWeight: '900' },
  tagText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
