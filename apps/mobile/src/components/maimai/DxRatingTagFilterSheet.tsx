import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppModal } from '@/components/AppModal';
import type { DxRatingChartTag } from '@/domain/dxrating-chart-tags';
import { useAppTheme } from '@/theme/app-theme';

const SheetPressable = Platform.OS === 'android' ? Pressable : GesturePressable;

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
  const insets = useSafeAreaInsets();
  const [draftTagIds, setDraftTagIds] = useState<Set<number>>(() => new Set(selectedTagIds));
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

  const toggleTag = (tagId: number) => {
    setDraftTagIds((current) => {
      const next = new Set(current);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const apply = () => {
    onApply(tags.filter((tag) => draftTagIds.has(tag.id)).map((tag) => tag.id));
    onClose();
  };

  return <AppModal
    animationType="slide"
    presentationStyle="pageSheet"
    visible={visible}
    onShow={() => setDraftTagIds(new Set(selectedTagIds))}
    onRequestClose={onClose}
  >
    <View testID="dxrating-tag-filter-sheet" style={[styles.page, {
      backgroundColor: theme.background,
      paddingBottom: Math.max(insets.bottom, 12),
    }]}>
      <View style={[styles.grabber, { backgroundColor: theme.border }]} />
      <View style={styles.header}>
        <SheetPressable accessibilityRole="button" accessibilityLabel="清空谱面标签筛选"
          accessibilityState={{ disabled: draftTagIds.size === 0 }}
          disabled={draftTagIds.size === 0} onPress={() => setDraftTagIds(new Set())}
          style={({ pressed }) => [styles.headerActionHit, pressed && styles.pressed]}>
          <Text style={[styles.headerAction, { color: draftTagIds.size === 0 ? theme.textMuted : theme.accent }]}>清空</Text>
        </SheetPressable>
        <Text style={[styles.title, { color: theme.text }]}>标签</Text>
        <SheetPressable accessibilityRole="button" accessibilityLabel="完成谱面标签筛选"
          onPress={apply} style={({ pressed }) => [styles.headerActionHit, pressed && styles.pressed]}>
          <Text style={[styles.headerAction, { color: theme.accent }]}>完成</Text>
        </SheetPressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {groups.map((group) => <View key={group.id} testID={`dxrating-tag-filter-group-${group.id}`} style={styles.group}>
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
      </ScrollView>
    </View>
  </AppModal>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, marginBottom: 4 },
  header: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  headerActionHit: { minWidth: 52, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  headerAction: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 22 },
  group: { gap: 10 },
  groupName: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tagFrame: { borderWidth: 2, borderRadius: 999, padding: 2 },
  tag: { minHeight: 30, borderRadius: 999, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  tagText: { color: '#0C4A6E', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
