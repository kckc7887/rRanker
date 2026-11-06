import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useIsFocused } from 'expo-router';
import { StrengthConclusion, StrengthPractice, StrengthSongsSheet } from '@/components/game-content/StrengthAnalysis';
import { QueryStateView } from '@/components/QueryStateView';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
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
          <StrengthConclusion title={`分析：${analysis.conclusion}`}>
            <SimaiDifficultyRadar scores={analysis.axes.map(axis => axis.value)} color={theme.accent}
              difficulty="strength" onAxisPress={setSelectedAxis} />
          </StrengthConclusion>
          <StrengthPractice title="薄弱项练习">
            {analysis.recommendations.map(item => (
              <Pressable key={chartVersionKey(item.chart.songId, item.chart.type, item.chart.levelIndex)} onPress={() => openChart(item.chart)}>
                <ScoreRecordCard record={item.record ?? item.chart} interactive={false} />
              </Pressable>
            ))}
            {!analysis.recommendations.length && !query.pending ? <Text style={[styles.emptyTitle, { color: theme.text }]}>暂无可提升推荐</Text> : null}
          </StrengthPractice>
        </>}
      </ScrollView>} />
    <StrengthSongsSheet visible={selected !== undefined} title={selected?.name ?? ''} onClose={() => setSelectedAxis(null)}
      data={selected?.samples ?? []}
      keyExtractor={item => chartVersionKey(item.record.songId, item.record.type, item.record.levelIndex)}
      ListEmptyComponent={<Text style={{ color: theme.textSecondary }}>暂无达标谱面</Text>}
      renderItem={({ item }) => <Pressable onPress={() => openChart(item.record)}>
        <ScoreRecordCard record={item.record} interactive={false} />
      </Pressable>} />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  emptyTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
});
