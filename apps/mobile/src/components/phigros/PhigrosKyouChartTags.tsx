import { ChartTags } from '@/components/game-content/ChartTags';
import { Pressable as NativePressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import { AppSheet } from '@/components/AppSheet';
import { useNotification } from '@/components/AppNotification';
import type { PhigrosKyouResolvedTag, PhigrosKyouTagType } from '@/domain/phigros-kyou';
import { useAppTheme } from '@/theme/app-theme';

const GROUPS: readonly { type: PhigrosKyouTagType; label: string }[] = [
  { type: 'primary', label: '主要难点' },
  { type: 'secondary', label: '细分配置' },
];

export function PhigrosKyouChartTags({
  tags,
  onShowAll,
}: {
  tags: readonly PhigrosKyouResolvedTag[];
  onShowAll: (tags: readonly PhigrosKyouResolvedTag[]) => void;
}) {
  const theme = useAppTheme();
  const { showActionNotification } = useNotification();
  const showTag = (tag: PhigrosKyouResolvedTag) => showActionNotification({
    title: tag.name,
    message: `${tag.description || 'Kyou 暂未提供说明'}\n票数：${tag.votes} · ${tag.type === 'primary' ? '主要难点' : '细分配置'}`,
    variant: 'info',
    actions: [{ label: '知道了', tone: 'cancel' }],
  });

  return <ChartTags tags={tags} testID="phigros-kyou-chart-tags" onShowAll={() => onShowAll(tags)}
    moreColor={theme.accent} moreStyle={[styles.more, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}
    renderTag={tag => <GesturePressable key={tag.id} accessibilityRole="button"
          accessibilityLabel={`谱面标签 ${tag.name}，${tag.votes} 票，点击查看说明`}
          hitSlop={8} testID={`phigros-kyou-chart-tag-${tag.id}`} onPress={() => showTag(tag)}
          style={({ pressed }) => [styles.tag, {
            backgroundColor: tag.type === 'primary' ? theme.accentSoft : theme.surfaceMuted,
            borderColor: tag.type === 'primary' ? theme.accent : theme.border,
          }, pressed && styles.pressed]}>
          <Text style={[styles.typeMark, { color: tag.type === 'primary' ? theme.accent : theme.textMuted }]}>
            {tag.type === 'primary' ? '主' : '细'}
          </Text>
          <Text style={[styles.tagText, { color: tag.type === 'primary' ? theme.accent : theme.textSecondary }]}>{tag.name}</Text>
          <Text style={[styles.voteText, { color: tag.type === 'primary' ? theme.accent : theme.textMuted }]}>{tag.votes}</Text>
        </GesturePressable>} />;
}

export function PhigrosKyouChartTagsSheet({
  visible,
  tags,
  onClose,
}: {
  visible: boolean;
  tags: readonly PhigrosKyouResolvedTag[];
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const { showActionNotification } = useNotification();
  const showTag = (tag: PhigrosKyouResolvedTag) => showActionNotification({
    title: tag.name,
    message: `${tag.description || 'Kyou 暂未提供说明'}\n票数：${tag.votes} · ${tag.type === 'primary' ? '主要难点' : '细分配置'}`,
    variant: 'info',
    actions: [{ label: '知道了', tone: 'cancel' }],
  });
  return (
    <AppSheet title="谱面标签" visible={visible} onRequestClose={onClose} testID="phigros-kyou-chart-tags-sheet"
      rightAction={{ label: '完成', accessibilityLabel: '关闭谱面标签', onPress: onClose }}>
      <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          {GROUPS.map((group) => {
            const items = tags.filter((tag) => tag.type === group.type);
            if (items.length === 0) return null;
            return <View key={group.type} style={styles.group}>
              <View style={[styles.groupHeader, {
                backgroundColor: group.type === 'primary' ? theme.accentSoft : theme.surfaceMuted,
                borderColor: group.type === 'primary' ? theme.accent : theme.border,
              }]}>
                <Text style={[styles.groupTypeMark, { color: group.type === 'primary' ? theme.accent : theme.textMuted }]}>
                  {group.type === 'primary' ? '主' : '细'}
                </Text>
                <Text style={[styles.groupTitle, { color: group.type === 'primary' ? theme.accent : theme.textSecondary }]}>{group.label}</Text>
              </View>
              {items.map((tag) => <NativePressable key={tag.id} accessibilityRole="button"
                accessibilityLabel={`${tag.name}，${tag.votes} 票，点击查看说明`} onPress={() => showTag(tag)}
                style={({ pressed }) => [styles.row, {
                  backgroundColor: tag.type === 'primary' ? theme.accentSoft : theme.surface,
                  borderColor: tag.type === 'primary' ? theme.accent : theme.border,
                }, pressed && styles.pressed]}>
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowName, { color: theme.text }]}>{tag.name}</Text>
                  <Text style={[styles.rowDescription, { color: theme.textMuted }]}>{tag.description || '暂无说明'}</Text>
                </View>
                <Text style={[styles.rowVotes, { color: theme.accent }]}>{tag.votes} 票</Text>
              </NativePressable>)}
            </View>;
          })}
      </ScrollView>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  tag: { minHeight: 36, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  typeMark: { fontSize: 9, lineHeight: 13, fontWeight: '900' },
  tagText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  voteText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  more: { minWidth: 44, minHeight: 36, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
  sheetContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 22 },
  group: { gap: 8 },
  groupHeader: { alignSelf: 'flex-start', minHeight: 28, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTypeMark: { fontSize: 10, lineHeight: 14, fontWeight: '900' },
  groupTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  row: { minHeight: 58, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  rowDescription: { fontSize: 12, lineHeight: 17 },
  rowVotes: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
});
