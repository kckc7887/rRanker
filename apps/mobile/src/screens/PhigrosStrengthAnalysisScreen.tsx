import { detailTargetHref, encodeDetailTarget } from '@/domain/detail-target';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { AppModal } from '@/components/AppModal';
import { Card } from '@/components/Card';
import { RandomUnplayedChartCard } from '@/components/RandomChartsPage';
import { EmptyDataView } from '@/components/EmptyDataView';
import { ScoreCardArtworkScope } from '@/components/game-content/GameScoreCard';
import { PhigrosDifficultyBadge } from '@/components/phigros/PhigrosDifficultyBadge';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { PhigrosStrengthRadar } from '@/components/phigros/PhigrosStrengthRadar';
import { buildPhigrosKyouChartTagIndex } from '@/domain/phigros-kyou';
import type { ScoreRecord } from '@/domain/models';
import {
  analyzePhigrosStrength,
  describePhigrosStrengthUnexpectedPrimaryAxes,
  type PhigrosStrengthChartSample,
  type PhigrosStrengthRecommendation,
  type PhigrosTagRksStat,
} from '@/domain/phigros-strength-analysis';
import { phigrosChartNoteKey } from '@/domain/phigros-xing';
import { buildPhigrosNoteTotalByKey } from '@/features/phigros-best-image/phigros-best-image-custom';
import { useGameData } from '@/hooks/use-game-data';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { usePhigrosKyouChartTags } from '@/hooks/use-phigros-kyou';
import { useAppTheme } from '@/theme/app-theme';

const UNEXPECTED_PRIMARY_AXES = describePhigrosStrengthUnexpectedPrimaryAxes();

function chartKey(songId: string, levelIndex: number): string {
  return `${songId}\u0000${levelIndex}`;
}

function TagSongsSheet({
  tag,
  recordsByChart,
  titleMap,
  artworkUrl,
  noteTotalByKey,
  onClose,
  onOpenChart,
}: {
  tag: PhigrosTagRksStat | null;
  recordsByChart: ReadonlyMap<string, ScoreRecord>;
  titleMap: ReadonlyMap<string, string>;
  artworkUrl: (songId: string) => string | null;
  noteTotalByKey: Readonly<Record<string, number>>;
  onClose: () => void;
  onOpenChart: (chart: PhigrosStrengthChartSample) => void;
}) {
  const theme = useAppTheme();
  const charts = (tag?.charts ?? []).flatMap((chart) => {
    const record = recordsByChart.get(chartKey(chart.songId, chart.levelIndex));
    return record ? [{ chart, record }] : [];
  });
  return (
    <AppModal
      animationType="slide"
      presentationStyle="pageSheet"
      visible={tag != null}
      onRequestClose={onClose}
    >
      <ScoreCardArtworkScope>
      <View testID="phigros-strength-tag-songs-sheet" style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={[styles.sheetGrabber, { backgroundColor: theme.border }]} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderSpacer} />
          <Text style={[styles.sheetTitle, { color: theme.text }]}>{tag?.name ?? ''}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭标签歌曲列表"
            onPress={onClose}
            style={({ pressed }) => [styles.sheetClose, pressed && styles.pressed]}
          >
            <Text style={[styles.sheetCloseText, { color: theme.accent }]}>完成</Text>
          </Pressable>
        </View>
        <FlatList
          data={charts}
          keyExtractor={(item) => chartKey(item.chart.songId, item.chart.levelIndex)}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const title = titleMap.get(item.record.songId) ?? item.record.title;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`查看谱面 ${title}`}
                onPress={() => onOpenChart(item.chart)}
              >
                <PhigrosScoreCard
                  pressable={false}
                  record={item.record}
                  catalogTitle={title}
                  artworkSource={artworkUrl(item.record.songId)}
                  totalNotes={noteTotalByKey[phigrosChartNoteKey(item.record.songId, item.record.levelIndex)]}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={(
            <View style={styles.sheetEmpty}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>暂无达标谱面</Text>
            </View>
          )}
        />
      </View>
      </ScoreCardArtworkScope>
    </AppModal>
  );
}

function PracticeCard({
  recommendation,
  record,
  title,
  artworkSource,
  totalNotes,
  onOpenUnplayed,
}: {
  recommendation: PhigrosStrengthRecommendation;
  record: ScoreRecord | undefined;
  title: string;
  artworkSource: string | null;
  totalNotes: number | undefined;
  onOpenUnplayed: () => void;
}) {
  if (!record) {
    return (
      <RandomUnplayedChartCard
        badge={(
          <PhigrosDifficultyBadge
            constant={recommendation.difficultyConstant}
            levelIndex={recommendation.levelIndex}
          />
        )}
        onPress={onOpenUnplayed}
        title={title}
      />
    );
  }
  return (
    <PhigrosScoreCard
      record={record}
      catalogTitle={title}
      artworkSource={artworkSource}
      totalNotes={totalNotes}
    />
  );
}

export default function PhigrosStrengthAnalysisScreen() {
  const theme = useAppTheme();
  const [selectedTag, setSelectedTag] = useState<PhigrosTagRksStat | null>(null);
  const gameQuery = useGameData();
  const catalogQuery = usePhigrosCatalog();
  const tagsQuery = usePhigrosKyouChartTags();
  const payload = gameQuery.data?.payload;
  const phigrosPayload = payload?.kind === 'phigros' ? payload : null;
  const songs = catalogQuery.data?.snapshot.songs;
  const openSongChart = (songId: string, levelIndex: number) => {
    router.push(detailTargetHref(encodeDetailTarget({ game: 'phigros', songId, levelIndex })));
  };
  const openChartDetail = (chart: PhigrosStrengthChartSample) => {
    setSelectedTag(null);
    openSongChart(chart.songId, chart.levelIndex);
  };
  const tagIndex = useMemo(() => buildPhigrosKyouChartTagIndex(
    tagsQuery.data,
    catalogQuery.data?.snapshot,
  ), [catalogQuery.data?.snapshot, tagsQuery.data]);
  const analysis = useMemo(() => {
    if (!phigrosPayload || !tagsQuery.data || !catalogQuery.data?.snapshot) return null;
    return analyzePhigrosStrength(
      phigrosPayload.playerScore.value,
      phigrosPayload.records,
      tagIndex,
      tagsQuery.data.tags,
      catalogQuery.data.snapshot,
    );
  }, [catalogQuery.data?.snapshot, phigrosPayload, tagIndex, tagsQuery.data]);
  const titleMap = useMemo(() => new Map(
    (songs ?? []).map((song) => [song.id, song.title]),
  ), [songs]);
  const noteTotalByKey = useMemo(() => buildPhigrosNoteTotalByKey(songs ?? []), [songs]);
  const recordsByChart = useMemo(() => {
    const map = new Map<string, ScoreRecord>();
    for (const record of phigrosPayload?.records ?? []) {
      const key = chartKey(record.songId, record.levelIndex);
      const current = map.get(key);
      if (!current || record.rating > current.rating
        || (record.rating === current.rating && record.achievements > current.achievements)) {
        map.set(key, record);
      }
    }
    return map;
  }, [phigrosPayload?.records]);
  const artworkUrl = (songId: string) => catalogQuery.data?.provider?.getIllustrationLowresUrl(songId) ?? null;

  const retry = () => {
    void Promise.all([
      gameQuery.refetch(),
      catalogQuery.refetch(),
      tagsQuery.refetch(),
    ]);
  };
  const isLoading = gameQuery.isLoading || catalogQuery.isLoading || tagsQuery.isLoading;
  const hasError = gameQuery.isError || catalogQuery.isError || tagsQuery.isError;

  if (isLoading && !analysis) {
    return (
      <View style={[styles.page, styles.centered, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '实力分析' }} />
        <ActivityIndicator color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>正在整理成绩与谱面标签…</Text>
      </View>
    );
  }

  if (!phigrosPayload) {
    return (
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '实力分析' }} />
        <EmptyDataView
          title="尚未绑定 TapTap"
          detail="请在游戏管理中绑定 Phigros 的 TapTap 云存档后再查看实力分析。"
        />
      </View>
    );
  }

  if ((hasError && !analysis) || !analysis) {
    return (
      <View style={[styles.page, styles.centered, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '实力分析' }} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>暂时无法生成分析</Text>
        <Text style={[styles.errorDetail, { color: theme.textMuted }]}>成绩、曲库或 Kyou 谱面标签未能完整加载。</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重试实力分析"
          onPress={retry}
          style={({ pressed }) => [styles.retryButton, { backgroundColor: theme.accent }, pressed && styles.pressed]}
        >
          <Text style={[styles.retryText, { color: theme.onAccent }]}>重试</Text>
        </Pressable>
      </View>
    );
  }

  if (!analysis.hasExpectedPrimaryAxes) {
    return (
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '实力分析' }} />
        <EmptyDataView title="标签结构暂不可用" detail={UNEXPECTED_PRIMARY_AXES} />
      </View>
    );
  }

  const isStale = gameQuery.isDataStale
    || catalogQuery.data?.snapshot.source.isStale
    || tagsQuery.data?.source.isStale;

  return (
    <>
    <ScrollView
      style={[styles.page, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ title: '实力分析' }} />
      {isStale ? (
        <View style={[styles.staleBanner, { backgroundColor: theme.surfaceMuted, borderColor: theme.warning }]}>
          <Text style={[styles.staleText, { color: theme.textSecondary }]}>当前使用缓存数据，联网同步后结果会自动更新。</Text>
        </View>
      ) : null}

      {analysis.pool.totalCount === 0 ? (
        <Text style={[styles.emptyTitle, { color: theme.text }]}>暂无达标谱面</Text>
      ) : (
        <>
          <Card style={styles.radarCard}>
            <Text style={[styles.analysisTitle, { color: theme.text }]}>分析：{analysis.mainTagProfileLabel}</Text>
            <PhigrosStrengthRadar
              tags={analysis.mainTags}
              min={analysis.radarDomain.min}
              max={analysis.radarDomain.max}
              onTagPress={setSelectedTag}
            />
          </Card>
          <ScoreCardArtworkScope>
          <View style={styles.practiceSection}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>薄弱项练习</Text>
            {analysis.recommendations.length > 0 ? analysis.recommendations.map((recommendation) => {
              const record = recordsByChart.get(chartKey(recommendation.songId, recommendation.levelIndex));
              const title = titleMap.get(recommendation.songId) ?? recommendation.title;
              return (
                <PracticeCard
                  key={chartKey(recommendation.songId, recommendation.levelIndex)}
                  recommendation={recommendation}
                  record={record}
                  title={title}
                  artworkSource={artworkUrl(recommendation.songId)}
                  totalNotes={record ? noteTotalByKey[phigrosChartNoteKey(record.songId, record.levelIndex)] : undefined}
                  onOpenUnplayed={() => openSongChart(recommendation.songId, recommendation.levelIndex)}
                />
              );
            }) : (
              <Text style={[styles.emptyTitle, { color: theme.text }]}>暂无可提升推荐</Text>
            )}
          </View>
          </ScoreCardArtworkScope>
        </>
      )}
    </ScrollView>
    <TagSongsSheet
      tag={selectedTag}
      recordsByChart={recordsByChart}
      titleMap={titleMap}
      artworkUrl={artworkUrl}
      noteTotalByKey={noteTotalByKey}
      onClose={() => setSelectedTag(null)}
      onOpenChart={openChartDetail}
    />
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  loadingText: { fontSize: 14 },
  errorTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  errorDetail: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryButton: { minWidth: 104, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  staleBanner: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  staleText: { fontSize: 12, lineHeight: 17 },
  radarCard: { paddingBottom: 8, gap: 2 },
  analysisTitle: { fontSize: 17, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
  sectionTitle: { fontSize: 17, lineHeight: 23, fontWeight: '800' },
  practiceSection: { gap: 10 },
  emptyTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  sheet: { flex: 1 },
  sheetGrabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, marginBottom: 4 },
  sheetHeader: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  sheetHeaderSpacer: { width: 56 },
  sheetTitle: { flex: 1, fontSize: 17, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
  sheetClose: { width: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  sheetContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28, gap: 10 },
  sheetEmpty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
});
