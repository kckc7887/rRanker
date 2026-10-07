import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { AppModal } from '@/components/AppModal';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { ScoreCardArtworkScope } from '@/components/game-content/GameScoreCard';
import { MaimaiDifficultyRadar } from '@/components/maimai/MaimaiDifficultyRadar';
import { chartVersionKey } from '@/domain/catalog';
import { detailTargetHref, encodeDetailTarget } from '@/domain/detail-target';
import type { Chart } from '@/domain/models';
import type { MaimaiStrengthTarget } from '@/domain/maimai-strength-analysis';
import { useMaimaiStrength } from '@/hooks/use-maimai-strength';
import { useAppTheme } from '@/theme/app-theme';

const TARGETS = [{ value: 99, label: 'SS' }, { value: 100, label: 'SSS' }, { value: 100.5, label: 'SSS+' }] as const;

export function MaimaiStrengthAnalysisScreen() {
  const theme = useAppTheme();
  const focused = useIsFocused();
  const [target, setTarget] = useState<MaimaiStrengthTarget>(100);
  const [selectedAxis, setSelectedAxis] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const query = useMaimaiStrength(target, focused);
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
        <View style={styles.targets}>
          {TARGETS.map(item => <Pressable key={item.value} onPress={() => { setTarget(item.value); setSelectedAxis(null); }}
            style={[styles.target, { backgroundColor: target === item.value ? theme.accent : theme.surfaceMuted }]}>
            <Text style={[styles.targetText, { color: target === item.value ? theme.onAccent : theme.text }]}>{item.label} · {item.value}%</Text>
          </Pressable>)}
        </View>
        {query.isStale ? <Text style={{ color: theme.textSecondary }}>当前使用缓存成绩，联网同步后结果会自动更新。</Text> : null}
        <Text style={[styles.status, { color: theme.textSecondary }]}>
          特征文件 {query.completed}/{query.total} · 缺失谱面 {query.missing} · 失败文件 {query.failed}
          {query.pending || query.failed > 0 ? ' · 暂定结果' : ''}
        </Text>
        {query.failed > 0 ? <Pressable onPress={query.retryFailed}><Text style={{ color: theme.accent }}>重试失败特征</Text></Pressable> : null}
        <Card>
          <Text style={[styles.title, { color: theme.text }]}>{analysis.conclusion}</Text>
          <MaimaiDifficultyRadar scores={analysis.axes.map(axis => axis.value)} color={theme.accent}
            difficulty="strength" onAxisPress={setSelectedAxis} />
          {analysis.axes.map((axis, index) => <Pressable key={axis.name} onPress={() => setSelectedAxis(index)} style={styles.axis}>
            <Text style={[styles.axisName, { color: theme.text }]}>{axis.name}</Text>
            <Text style={{ color: theme.accent }}>{axis.value?.toFixed(1) ?? '暂无数据'}</Text>
            <Text style={{ color: theme.textSecondary }}>{axis.samples.length} 张{axis.samples.length < 10 ? ' · 样本较少' : ''} ›</Text>
          </Pressable>)}
        </Card>
        <Pressable onPress={() => setShowExplanation(value => !value)}>
          <Text style={{ color: theme.accent }}>计算说明 {showExplanation ? '收起' : '展开'}</Text>
        </Pressable>
        {showExplanation ? <Text style={[styles.explanation, { color: theme.textSecondary }]}>
          每个维度取达到目标达成率的最高 10 个正值求平均，不足 10 张按实际数量计算。数值表示在目标达成率下已展现的能力，刻度为 0–10；任一维度少于 3 张时暂不判断强弱。五维差距不超过 0.3 视为较均衡。
          {'\n'}练习范围取达标成绩中定数最高 10 张的平均值 −0.5 至 +0.3，优先推荐达到目标后能提升薄弱维度的谱面。
        </Text> : null}
        <Text style={[styles.title, { color: theme.text }]}>薄弱项练习</Text>
        <ScoreCardArtworkScope>
          {analysis.recommendations.map(item => <Card key={chartVersionKey(item.chart.songId, item.chart.type, item.chart.levelIndex)} style={styles.practice}>
            <Text style={{ color: theme.accent }}>训练：{item.axes.join('、')} · 目标 {target}%</Text>
            <Text style={{ color: theme.textSecondary }}>{item.record ? `当前 ${item.record.achievements.toFixed(4)}%` : '未游玩'}</Text>
            <Pressable onPress={() => openChart(item.chart)}>
              <ScoreRecordCard record={item.record ?? item.chart} interactive={false} />
            </Pressable>
          </Card>)}
        </ScoreCardArtworkScope>
        {!analysis.recommendations.length ? <Text style={{ color: theme.textSecondary }}>
          {!analysis.sufficient ? '样本不足，请补充成绩或降低掌握目标' : query.pending ? '正在加载适级谱面…' : '暂无可提升推荐'}
        </Text> : null}
      </ScrollView>} />
    <AppModal visible={selected !== undefined} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedAxis(null)}>
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.title, { color: theme.text }]}>{selected?.name} · 支撑成绩</Text>
          <Pressable onPress={() => setSelectedAxis(null)}><Text style={{ color: theme.accent }}>完成</Text></Pressable>
        </View>
        <ScoreCardArtworkScope>
          <FlatList data={selected?.samples ?? []} contentContainerStyle={styles.content}
            keyExtractor={item => chartVersionKey(item.record.songId, item.record.type, item.record.levelIndex)}
            ListEmptyComponent={<Text style={{ color: theme.textSecondary }}>暂无达标谱面</Text>}
            renderItem={({ item }) => <View style={styles.practice}>
              <Text style={{ color: theme.accent }}>{selected?.name} {item.value.toFixed(1)}</Text>
              <Pressable onPress={() => openChart(item.record)}><ScoreRecordCard record={item.record} interactive={false} /></Pressable>
            </View>} />
        </ScoreCardArtworkScope>
      </View>
    </AppModal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  targets: { flexDirection: 'row', gap: 8 },
  target: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  targetText: { fontSize: 13, fontWeight: '700' },
  status: { fontSize: 12, lineHeight: 18 },
  title: { fontSize: 17, fontWeight: '700', lineHeight: 25 },
  axis: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  axisName: { flex: 1, fontSize: 15, fontWeight: '600' },
  explanation: { fontSize: 13, lineHeight: 21 },
  practice: { gap: 8, marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
});
