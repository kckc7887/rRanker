import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '@/components/AppModal';
import type { DxRatingChartTag } from '@/domain/dxrating-chart-tags';
import { useAppTheme } from '@/theme/app-theme';

export interface DxRatingChartTagSheetData {
  songTitle: string;
  chartLabel: string;
  tags: DxRatingChartTag[];
}

export function DxRatingChartTagSheet({ data, onClose }: {
  data: DxRatingChartTagSheetData | null;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  return <AppModal
    animationType="slide"
    presentationStyle="pageSheet"
    visible={data !== null}
    onRequestClose={onClose}
  >
    <View testID="dxrating-config-tag-sheet" style={[styles.page, {
      backgroundColor: theme.background,
      paddingBottom: Math.max(insets.bottom, 12),
    }]}>
      <View style={[styles.grabber, { backgroundColor: theme.border }]} />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: theme.text }]}>谱面标签</Text>
          {data ? <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={2}>
            {data.songTitle} · {data.chartLabel}
          </Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭谱面标签"
          hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.doneHit, pressed && styles.pressed]}>
          <Text style={[styles.done, { color: theme.accent }]}>完成</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {data?.tags.map((tag) => <View key={tag.id} accessibilityLabel={`${tag.name}：${tag.description || '暂无说明'}`}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.chip, { backgroundColor: tag.color }]}>
            <Text style={styles.chipText}>{tag.name}</Text>
          </View>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {tag.descriptionSegments.length
              ? tag.descriptionSegments.map((segment, index) => <Text
                  key={`${index}-${segment.text}`}
                  style={segment.strikethrough ? styles.strikethrough : undefined}
                  testID={segment.strikethrough ? `dxrating-tag-description-strikethrough-${tag.id}-${index}` : undefined}
                >{segment.text}</Text>)
              : 'DXRating 暂未提供说明'}
          </Text>
        </View>)}
      </ScrollView>
    </View>
  </AppModal>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  headerCopy: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  subtitle: { fontSize: 12, lineHeight: 17 },
  doneHit: { paddingVertical: 3, paddingHorizontal: 4 },
  done: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 28, gap: 10 },
  row: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 9 },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: '#0C4A6E', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  description: { fontSize: 13, lineHeight: 19 },
  strikethrough: { textDecorationLine: 'line-through' },
  pressed: { opacity: 0.65 },
});
