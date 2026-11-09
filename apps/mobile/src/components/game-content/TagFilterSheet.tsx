import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FilterSheetRow } from './FilterShell';
import { DetailPressable } from './DetailPressable';
import { AppSheet } from '@/components/AppSheet';
import { useAppTheme } from '@/theme/app-theme';

export type TagFilterState = 'ready' | 'loading' | 'unavailable';

export function TagFilterRow({ state, value, expanded, onOpen, children }: {
  state: TagFilterState; value: string; expanded: boolean; onOpen: () => void; children: ReactNode;
}) {
  const ready = state === 'ready';
  const text = ready ? value : (state === 'loading' ? '加载中' : '暂不可用');
  return <>
    <FilterSheetRow label="标签" value={text} disabled={!ready} expanded={expanded} onPress={onOpen}
      accessibilityLabel={`谱面标签筛选，${ready ? `当前 ${text}` : text}`} />
    {expanded && children}
  </>;
}

export function TagFilterSheet<T extends { id: number; name: string }>({ visible, tags, selectedTagIds, onApply, onClose, title, testID, groups, renderTag }: {
  visible: boolean; tags: readonly T[]; selectedTagIds: readonly number[]; onApply: (ids: number[]) => void;
  onClose: () => void; title: string; testID: string;
  groups: readonly { key: string | number; header: ReactNode; tags: readonly T[] }[];
  renderTag: (tag: T, selected: boolean) => ReactNode;
}) {
  const theme = useAppTheme();
  const [draftTagIds, setDraftTagIds] = useState(() => new Set(selectedTagIds));
  const toggleTag = (id: number) => setDraftTagIds((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const apply = () => { onApply(tags.filter((tag) => draftTagIds.has(tag.id)).map((tag) => tag.id)); onClose(); };
  return <AppSheet visible={visible} onShow={() => setDraftTagIds(new Set(selectedTagIds))} onRequestClose={onClose} testID={`${testID}-sheet`} title={title}
    leftAction={{ label: '清空', accessibilityLabel: '清空谱面标签筛选', disabled: draftTagIds.size === 0, onPress: () => setDraftTagIds(new Set()) }}
    rightAction={{ label: '完成', accessibilityLabel: '完成谱面标签筛选', onPress: apply }}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {groups.map((group) => <View key={group.key} testID={`${testID}-group-${group.key}`} style={styles.group}>
        {group.header}
        <View style={styles.tagWrap}>{group.tags.map((tag) => {
          const selected = draftTagIds.has(tag.id);
          return <DetailPressable key={tag.id} accessibilityRole="checkbox"
            accessibilityLabel={`谱面标签 ${tag.name}，${selected ? '已选中' : '未选中'}`}
            accessibilityState={{ checked: selected }} onPress={() => toggleTag(tag.id)}
            testID={`${testID}-option-${tag.id}`}
            style={({ pressed }) => [styles.tagFrame, { borderColor: selected ? theme.accent : 'transparent' }, pressed && styles.pressed]}>
            {renderTag(tag, selected)}
          </DetailPressable>;
        })}</View>
      </View>)}
    </ScrollView>
  </AppSheet>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 22 },
  group: { gap: 10 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tagFrame: { borderWidth: 2, borderRadius: 999, padding: 2 },
  pressed: { opacity: 0.65 },
});
