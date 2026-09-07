import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '@/components/AppModal';
import { useAppTheme } from '@/theme/app-theme';
export const TagSheetPressable = Platform.OS === 'android' ? Pressable : GesturePressable;
const SheetPressable = TagSheetPressable;
export function TagFilterSheet<T extends { id: number }>({ visible, tags, selectedTagIds, onApply, onClose, title, testID, children }: {
  visible: boolean; tags: readonly T[]; selectedTagIds: readonly number[]; onApply: (ids: number[]) => void;
  onClose: () => void; title: string; testID: string;
  children: (selected: ReadonlySet<number>, toggle: (id: number) => void) => ReactNode;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [draftTagIds, setDraftTagIds] = useState(() => new Set(selectedTagIds));
  const toggleTag = (id: number) => setDraftTagIds((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const apply = () => { onApply(tags.filter((tag) => draftTagIds.has(tag.id)).map((tag) => tag.id)); onClose(); };
  return <AppModal
    animationType="slide"
    presentationStyle="pageSheet"
    visible={visible}
    onShow={() => setDraftTagIds(new Set(selectedTagIds))}
    onRequestClose={onClose}
  >
    <View testID={testID} style={[styles.page, {
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
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <SheetPressable accessibilityRole="button" accessibilityLabel="完成谱面标签筛选"
          onPress={apply} style={({ pressed }) => [styles.headerActionHit, pressed && styles.pressed]}>
          <Text style={[styles.headerAction, { color: theme.accent }]}>完成</Text>
        </SheetPressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children(draftTagIds, toggleTag)}
      </ScrollView>
    </View>
  </AppModal>;
}
export const TAG_FILTER_STYLES = StyleSheet.create({
  page: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, marginBottom: 4 },
  header: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  headerActionHit: { minWidth: 52, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  headerAction: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 22 },
  group: { gap: 10 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tagFrame: { borderWidth: 2, borderRadius: 999, padding: 2 },
  pressed: { opacity: 0.65 },
});
const styles = TAG_FILTER_STYLES;
