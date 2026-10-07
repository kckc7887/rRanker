import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { AppModal } from '@/components/AppModal';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { ScoreCardArtworkScope } from '@/components/game-content/GameScoreCard';
import { SimaiDifficultyRadar } from '@/components/game-content/SimaiDifficultyRadar';
import { chartVersionKey } from '@/domain/catalog';
import { detailTargetHref, encodeDetailTarget } from '@/domain/detail-target';
import type { Chart } from '@/domain/models';
import { useMaimaiStrength } from '@/hooks/use-maimai-strength';
import { useAppTheme } from '@/theme/app-theme';

export function MaimaiStrengthAnalysisScreen() {
  const theme = useAppTheme();
  const focused = useIsFocused();
  const [selectedAxis, setSelectedAxis] = useState<number | null>(null);
  const query = useMaimaiStrength(focused);
  const selected = selectedAxis === null ? undefined : query.analysis?.axes[selectedAxis];
  const openChart = (chart: Chart) => {
    setSelectedAxis(null);
    router.push(detailTargetHref(encodeDetailTarget({ game: 'maimai', songId: chart.songId, chartType: chart.type, levelIndex: chart.levelIndex })));
  };
  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <Stack.Screen options={{ title: '实力分析' }} />
    <QueryStateView isLoading={query.isLoading} isError={query.isError} isEmpty={false}
      data={query.analysis} onRetry={query.retry} renderData={analysis => <ScrollView
        contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {query.hasFeatureError ? <Pressable onPress={query.retryFailed}>
          <Text style={{ color: theme.accent }}>部分数据加载失败，点击重试</Text>
        </Pressable> : null}
        {query.pending ? <ActivityIndicator color={theme.accent} /> : null}
        {analysis.axes.every(axis => axis.value === null) ? (
          query.pending || query.hasFeatureError ? null : <Text style={[styles.emptyTitle, { color: theme.text }]}>暂无达标谱面</Text>
        ) : <>
          <Card style={styles.radarCard}>
            <Text style={[styles.analysisTitle, { color: theme.text }]}>分析：{analysis.conclusion}</Text>
            <SimaiDifficultyRadar scores={analysis.axes.map(axis => axis.value)} color={theme.accent}
              difficulty="strength" onAxisPress={setSelectedAxis} />
          </Card>
          <ScoreCardArtworkScope>
            <View style={styles.practiceSection}>
              <Text style={[styles.title, { color: theme.text }]}>薄弱项练习</Text>
              {analysis.recommendations.map(item => (
                <Pressable key={chartVersionKey(item.chart.songId, item.chart.type, item.chart.levelIndex)} onPress={() => openChart(item.chart)}>
                  <ScoreRecordCard record={item.record ?? item.chart} interactive={false} />
                </Pressable>
              ))}
              {!analysis.recommendations.length && !query.pending ? <Text style={[styles.emptyTitle, { color: theme.text }]}>暂无可提升推荐</Text> : null}
            </View>
          </ScoreCardArtworkScope>
        </>}
      </ScrollView>} />
    <AppModal visible={selected !== undefined} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedAxis(null)}>
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <View style={[styles.sheetGrabber, { backgroundColor: theme.border }]} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderSpacer} />
          <Text style={[styles.sheetTitle, { color: theme.text }]}>{selected?.name}</Text>
          <Pressable style={styles.sheetClose} onPress={() => setSelectedAxis(null)}><Text style={[styles.sheetCloseText, { color: theme.accent }]}>完成</Text></Pressable>
        </View>
        <ScoreCardArtworkScope>
          <FlatList data={selected?.samples ?? []} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
            keyExtractor={item => chartVersionKey(item.record.songId, item.record.type, item.record.levelIndex)}
            ListEmptyComponent={<Text style={{ color: theme.textSecondary }}>暂无达标谱面</Text>}
            renderItem={({ item }) => <Pressable onPress={() => openChart(item.record)}>
              <ScoreRecordCard record={item.record} interactive={false} />
            </Pressable>} />
        </ScoreCardArtworkScope>
      </View>
    </AppModal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  radarCard: { paddingBottom: 8, gap: 2 },
  analysisTitle: { fontSize: 17, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
  title: { fontSize: 17, lineHeight: 23, fontWeight: '800' },
  emptyTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  practiceSection: { gap: 10 },
  sheetGrabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, marginBottom: 4 },
  sheetHeader: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  sheetHeaderSpacer: { width: 56 },
  sheetTitle: { flex: 1, fontSize: 17, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
  sheetClose: { width: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
});
