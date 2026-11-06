import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppSheet } from '@/components/AppSheet';
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
  return <AppSheet title="谱面标签" subtitle={data && `${data.songTitle} · ${data.chartLabel}`}
    visible={data !== null} onRequestClose={onClose} testID="dxrating-config-tag-sheet"
    rightAction={{ label: '完成', accessibilityLabel: '关闭谱面标签', onPress: onClose }}>
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
  </AppSheet>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 28, gap: 10 },
  row: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 9 },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: '#0C4A6E', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  description: { fontSize: 13, lineHeight: 19 },
  strikethrough: { textDecorationLine: 'line-through' },
});
