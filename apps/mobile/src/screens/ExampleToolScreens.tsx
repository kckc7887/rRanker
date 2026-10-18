import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { detailTargetHref, encodeDetailTarget } from '@/domain/detail-target';
import { AppModal } from '@/components/AppModal';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { RandomChartsPage } from '@/components/RandomChartsPage';
import { ExampleScoreCard } from '@/components/example/ExampleSongContent';
import { ScoreCardArtworkScope } from '@/components/game-content/GameScoreCard';
import { SimaiDifficultyRadar } from '@/components/game-content/SimaiDifficultyRadar';
import { EXAMPLE_STRENGTH_AXES, EXAMPLE_STRENGTH_SCORES, type ExampleRecord } from '@/domain/example';
import { pickRandomItems, type RandomChartsCount } from '@/domain/random-charts';
import { useGameData } from '@/hooks/use-game-data';
import { useAppTheme } from '@/theme/app-theme';

export function ExampleRandomChartsScreen() {
  const query = useGameData(); const records = query.data?.payload.kind === 'example' ? query.data.payload.records : [];
  const [count, setCount] = useState<RandomChartsCount>(1); const [results, setResults] = useState<ExampleRecord[] | null>(null);
  return <RandomChartsPage count={count} onCountChange={setCount} filter={null} poolSize={records.length}
    onDraw={() => setResults(pickRandomItems(records, count, `${Date.now()}-${Math.random()}`))}
    hasDrawn={results !== null} resultCount={results?.length ?? 0} drawDisabled={!records.length}
    results={<ScoreCardArtworkScope>{results?.map(record => <ExampleScoreCard key={record.song.id} record={record} />)}</ScoreCardArtworkScope>}
    emptyMessage="没有可抽取的歌曲" poolError={query.isError ? '无法读取示例数据，请重试。' : null} onRetryPool={() => void query.refetch()} />;
}

export function ExampleStrengthAnalysisScreen() {
  const theme = useAppTheme(); const query = useGameData(); const [axis, setAxis] = useState<number | null>(null);
  const records = query.data?.payload.kind === 'example' ? query.data.payload.records : undefined;
  const close = () => setAxis(null);
  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <Stack.Screen options={{ title: '实力分析' }} />
    <QueryStateView data={records} isLoading={query.isPending} isError={query.isError} error={query.error} isEmpty={!records?.length}
      emptyText="同步数据后可查看实力分析" onRetry={() => void query.refetch()}
      renderData={data => <ScrollView contentContainerStyle={styles.content}>
        <Card><Text style={[styles.title, { color: theme.text }]}>精度突出，耐力待提升</Text>
          <SimaiDifficultyRadar scores={EXAMPLE_STRENGTH_SCORES} axisNames={EXAMPLE_STRENGTH_AXES}
            color={theme.accent} difficulty="example" onAxisPress={setAxis} /></Card>
        <Text style={[styles.title, { color: theme.text }]}>耐力练习</Text>
        <ScoreCardArtworkScope>{data.slice(37, 40).map(record => <ExampleScoreCard key={record.song.id} record={record} />)}</ScoreCardArtworkScope>
      </ScrollView>} />
    <AppModal visible={axis !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <View style={styles.header}><Text style={[styles.title, { color: theme.text }]}>{axis === null ? '' : `${EXAMPLE_STRENGTH_AXES[axis]} · ${EXAMPLE_STRENGTH_SCORES[axis].toFixed(1)}`}</Text>
          <Pressable onPress={close}><Text style={{ color: theme.accent }}>完成</Text></Pressable></View>
        <ScoreCardArtworkScope><FlatList data={records?.slice(0, 10)} contentContainerStyle={styles.content}
          keyExtractor={record => record.song.id} renderItem={({ item }) => <ExampleScoreCard record={item} onPress={() => {
            close(); router.push(detailTargetHref(encodeDetailTarget({ game: 'example', songId: item.song.id, levelIndex: 0 })));
          }} />} /></ScoreCardArtworkScope>
      </View>
    </AppModal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: '800' },
  header: { minHeight: 56, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
