import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '@/components/AppModal';
import { useNotification } from '@/components/AppNotification';
import type { PhigrosKyouResolvedTag, PhigrosKyouTagType } from '@/domain/phigros-kyou';
import { useAppTheme } from '@/theme/app-theme';

const GROUPS: readonly { type: PhigrosKyouTagType; label: string }[] = [
  { type: 'primary', label: '主要难点' },
  { type: 'secondary', label: '细分配置' },
];

export function PhigrosKyouChartTags({ tags }: { tags: readonly PhigrosKyouResolvedTag[] }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { showActionNotification } = useNotification();
  const [showAll, setShowAll] = useState(false);
  if (tags.length === 0) return null;
  const visible = tags.slice(0, 4);
  const remaining = tags.length - visible.length;
  const showTag = (tag: PhigrosKyouResolvedTag) => showActionNotification({
    title: tag.name,
    message: `${tag.description || 'Kyou 暂未提供说明'}\n票数：${tag.votes} · ${tag.type === 'primary' ? '主要难点' : '细分配置'}`,
    variant: 'info',
    actions: [{ label: '知道了', tone: 'cancel' }],
  });

  return <>
    <View testID="phigros-kyou-chart-tags" style={styles.block}>
      <View style={styles.wrap}>
        {visible.map((tag) => <Pressable key={tag.id} accessibilityRole="button"
          accessibilityLabel={`谱面标签 ${tag.name}，${tag.votes} 票，点击查看说明`}
          testID={`phigros-kyou-chart-tag-${tag.id}`} onPress={() => showTag(tag)}
          style={({ pressed }) => [styles.tag, {
            backgroundColor: theme.surfaceMuted,
            borderColor: theme.border,
          }, pressed && styles.pressed]}>
          <Text style={[styles.tagText, { color: theme.textSecondary }]}>{tag.name}</Text>
          <Text style={[styles.voteText, { color: theme.textMuted }]}>{tag.votes}</Text>
        </Pressable>)}
        {remaining > 0 ? <Pressable accessibilityRole="button"
          accessibilityLabel={`查看全部${tags.length}个谱面标签，另有${remaining}个`}
          testID="phigros-kyou-chart-tags-more" onPress={() => setShowAll(true)}
          style={({ pressed }) => [styles.more, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }, pressed && styles.pressed]}>
          <Text style={[styles.moreText, { color: theme.textSecondary }]}>+{remaining}</Text>
        </Pressable> : null}
      </View>
    </View>
    <AppModal animationType="slide" presentationStyle="pageSheet" visible={showAll}
      onRequestClose={() => setShowAll(false)}>
      <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={[styles.title, { color: theme.text }]}>谱面标签</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭谱面标签"
            onPress={() => setShowAll(false)} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Text style={[styles.closeText, { color: theme.accent }]}>完成</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          {GROUPS.map((group) => {
            const items = tags.filter((tag) => tag.type === group.type);
            if (items.length === 0) return null;
            return <View key={group.type} style={styles.group}>
              <Text style={[styles.groupTitle, { color: theme.textMuted }]}>{group.label}</Text>
              {items.map((tag) => <Pressable key={tag.id} accessibilityRole="button"
                accessibilityLabel={`${tag.name}，${tag.votes} 票，点击查看说明`} onPress={() => showTag(tag)}
                style={({ pressed }) => [styles.row, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && styles.pressed]}>
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowName, { color: theme.text }]}>{tag.name}</Text>
                  <Text style={[styles.rowDescription, { color: theme.textMuted }]}>{tag.description || '暂无说明'}</Text>
                </View>
                <Text style={[styles.rowVotes, { color: theme.accent }]}>{tag.votes} 票</Text>
              </Pressable>)}
            </View>;
          })}
        </ScrollView>
      </View>
    </AppModal>
  </>;
}

const styles = StyleSheet.create({
  block: { marginTop: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { minHeight: 30, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  tagText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  voteText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  more: { minHeight: 30, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.65 },
  sheet: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, marginBottom: 4 },
  header: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpacer: { width: 52 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  close: { minWidth: 52, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  sheetContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 22 },
  group: { gap: 8 },
  groupTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  row: { minHeight: 58, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  rowDescription: { fontSize: 12, lineHeight: 17 },
  rowVotes: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
});
