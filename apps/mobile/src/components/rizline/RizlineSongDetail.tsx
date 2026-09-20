import { useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router, useNavigation } from 'expo-router';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { RemoteImage } from '@/components/RemoteImage';
import { TagEditor } from '@/components/TagEditor';
import { AutoScrollText } from '@/components/game-content/AutoScrollText';
import { ChartCarousel } from '@/components/game-content/ChartCarousel';
import { DetailGestureRoot, DetailPressable } from '@/components/game-content/DetailPressable';
import { FloatingSongDetailChrome } from '@/components/game-content/FloatingSongDetailChrome';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { SongMetadataTable } from '@/components/game-content/SongMetadataTable';
import { VERTICAL_SONG_DETAIL_STYLES as styles } from '@/components/game-content/SongDetailChromeStyles';
import { useNotification } from '@/components/AppNotification';
import { formatRizlineConstant, rizlineCoverUrl, rizlineDifficultyColors, rizlineDifficultyIndex, sortedRizlineCharts, type RizlineChart, type RizlineRecord, type RizlineSong } from '@/domain/rizline';
import { buildTagHistory } from '@/domain/user-library';
import { presentRizlineChart } from '@/features/game-content/adapters/rizline';
import { openRizlineChartPreview } from '@/features/rizline-chart-preview/chart-preview-open';
import { useGameData } from '@/hooks/use-game-data';
import { useRizlineCatalog } from '@/hooks/use-rizline-catalog';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useAppTheme } from '@/theme/app-theme';
import { RizlineAccuracyValue, RizlineDifficultyBadge, RizlineStatusBadge } from './RizlineScoreVisuals';

type Library = ReturnType<typeof useUserLibrary>;

export function RizlineSongDetail({ songId, initialLevelIndex }: { songId: string; initialLevelIndex?: number }) {
  const theme = useAppTheme(); const query = useRizlineCatalog(); const library = useUserLibrary();
  const { showNotification } = useNotification();
  const song = query.data?.snapshot.songs.find((item) => item.id === songId);
  const item = library.data?.find((entry) => entry.key === library.songKey(songId));
  const favorite = item?.kind === 'song' && item.favorite;
  return <><StatusBar style="light" /><View style={[styles.page, { backgroundColor: theme.background }]}>
    <QueryStateView<RizlineSong> isLoading={query.isLoading} isError={query.isError} error={query.error}
      isEmpty={!query.isLoading && !query.isError && !song} data={song} emptyText="找不到这首歌曲" onRetry={() => void query.refetch()}
      renderData={(data) => <RizlineSongDetailContent key={data.id} song={data} library={library} initialLevelIndex={initialLevelIndex} />} />
    <FloatingSongDetailChrome songTitle={song?.title} favorite={favorite} favoriteDisabled={library.isLoading || library.isUpdating}
      onToggleFavorite={song ? () => {
        void library.setSongFavorite(song.id, !favorite).catch(() => showNotification({ title: '收藏保存失败', message: '请重试。', variant: 'error' }));
      } : undefined} />
  </View></>;
}

function RizlineSongDetailContent({ song, library, initialLevelIndex }: { song: RizlineSong; library: Library; initialLevelIndex?: number }) {
  const theme = useAppTheme(); const { width } = useWindowDimensions(); const query = useGameData();
  const [coverFailed, setCoverFailed] = useState(false); const [ready, setReady] = useState(false);
  useEffect(() => { const task = InteractionManager.runAfterInteractions(() => setReady(true)); return () => task.cancel(); }, []);
  const charts = useMemo(() => sortedRizlineCharts(song.charts), [song.charts]);
  const records = query.data?.payload.kind === 'rizline' ? query.data.payload.records : [];
  const recordsByChart = new Map(records.map((record) => [record.chartId, record]));
  const requested = charts.findIndex((chart) => rizlineDifficultyIndex(chart.difficulty) === initialLevelIndex);
  const defaultIndex = Math.max(0, charts.findIndex((chart) => chart.difficulty === 'IN'));
  const initialIndex = requested >= 0 ? requested : defaultIndex;
  const songKey = library.songKey(song.id); const songItem = library.data?.find((entry) => entry.key === songKey);
  const cover = rizlineCoverUrl(song); const cardWidth = Math.max(280, width - 40);
  const seconds = song.durationSeconds;
  const duration = seconds === null ? '—' : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return <ScrollView testID="rizline-song-detail-scroll" contentContainerStyle={styles.content}>
    <View style={[styles.hero, { width, height: width }]}>
      {cover && !coverFailed ? <RemoteImage accessibilityLabel="曲绘" source={cover} cachePolicy="disk" cacheProfile="artwork" gameId="rizline"
        contentFit="cover" onError={() => setCoverFailed(true)} style={StyleSheet.absoluteFillObject} transition={120} />
        : <View style={[styles.heroPlaceholder, { backgroundColor: theme.input }]}><Text style={styles.heroPlaceholderNote}>♪</Text></View>}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.40)']} locations={[0, 1]} style={styles.heroShade} />
      <View style={styles.heroCopy}><Text numberOfLines={1} style={styles.songId}>#{song.id}</Text>
        <AutoScrollText testID="rizline-song-title-scroll" text={song.title} textStyle={styles.title} style={styles.singleLine} contentContainerStyle={styles.singleLineContent} />
        <Text numberOfLines={1} style={styles.artist}>{song.artist ?? '—'}</Text></View>
    </View>
    <SongMetadataTable accessibilityLabel="歌曲详情数据" items={[
      { key: 'bpm', label: 'BPM', value: song.bpm ?? '—', flex: 1 }, { key: 'duration', label: '时长', value: duration, flex: 1 },
      { key: 'illustrator', label: '曲绘画师', value: song.illustrator ?? '—', flex: 1 }, { key: 'pack', label: '曲包', value: song.packName, flex: 1 },
    ]} cellStyle={styles.metadataCell} labelStyle={styles.metadataLabel} measureStyle={styles.metadataValueMeasure} style={styles.metadataTable}
      testIDPrefix="rizline-metadata" valueBlockStyle={styles.metadataValueBlock} valueStyle={styles.metadataValue} />
    {ready ? <><ChartCarousel items={charts} initialIndex={initialIndex} cardWidth={cardWidth} gap={12} resetKey={song.id}
      accessibilityLabel="谱面难度卡片" testID="rizline-chart-carousel" rootStyle={styles.carouselRoot} scrollStyle={styles.carouselScroll}
      contentContainerStyle={styles.carousel} keyExtractor={(chart) => chart.id}
      empty={<Text style={[styles.noCharts, { color: theme.textMuted }]}>暂无谱面</Text>}
      renderItem={(chart) => <RizlineChartCard chart={chart} record={recordsByChart.get(chart.id)} library={library} cardWidth={cardWidth} songTitle={song.title} />} />
      <View style={styles.details}><Card><TagEditor testID="rizline-song-tags" tags={songItem?.kind === 'song' ? songItem.tags : []}
        presets={library.tagPresets} historyTags={buildTagHistory(library.data ?? [], songKey, library.tagPresets)} disabled={library.isUpdating || library.isLoading}
        onPresetsChange={library.setTagPresets} onChange={(tags) => library.setTags({ kind: 'song', songId: song.id }, tags)} /></Card></View>
    </> : <View style={styles.deferredPlaceholder} />}
  </ScrollView>;
}

function RizlineChartCard({ chart, record, library, cardWidth, songTitle }: {
  chart: RizlineChart; record?: RizlineRecord; library: Library; cardWidth: number; songTitle: string;
}) {
  const theme = useAppTheme(); const { showNotification } = useNotification();
  const navigation = useNavigation();
  const cancelPreviewNavigation = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPreviewNavigation.current?.(), []);
  const colors = rizlineDifficultyColors(chart.difficulty, theme.dark); const presentation = presentRizlineChart(chart, record);
  const levelIndex = rizlineDifficultyIndex(chart.difficulty); const key = library.chartKey(chart.songId, 'SD', levelIndex);
  const item = library.data?.find((entry) => entry.key === key); const practice = item?.kind === 'chart' && item.practice;
  return <GameChartResultCard testID={`rizline-chart-${chart.difficulty}`} accessibilityLabel={`${chart.difficulty} 难度卡片`}
    style={[styles.chartCard, { width: cardWidth, backgroundColor: theme.surface, borderColor: colors.bg }]}>
    <View style={styles.chartHeader}><RizlineDifficultyBadge difficulty={chart.difficulty} /><View style={styles.levelBlock}>
      <Text style={[styles.level, { color: theme.text }]}>{chart.level}</Text><Text style={[styles.constant, { color: theme.textMuted }]}>{formatRizlineConstant(chart.constant)}</Text>
    </View></View>
    <View style={styles.resultBlock}><Text style={[styles.resultLabel, { color: theme.textMuted }]}>{presentation.primaryMetric.label}</Text>
      <RizlineAccuracyValue record={record} text={presentation.primaryMetric.text} fontSize={34} lineHeight={40} />
      <View style={styles.badgeRow}><RizlineStatusBadge record={record} /></View>
    </View>
    <View style={styles.statRow}>{presentation.secondaryMetrics.map((metric) => <View key={metric.key} style={styles.statCell}>
      <Text style={[styles.resultLabel, { color: theme.textMuted }]}>{metric.label}</Text><Text style={[styles.statValue, { color: theme.text }]}>{metric.text}</Text>
    </View>)}</View>
    <View style={[styles.chartDivider, { backgroundColor: theme.border }]} />
    <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>谱师：{presentation.charter}</Text>
    <GameNoteTable mode="grid" group={presentation.notes[0]!} accessibilityLabel="谱面物量" containerStyle={[styles.notesTable, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}
      rowStyle={styles.notesRow} headerRowStyle={styles.notesHeaderRow} headerTextStyle={[styles.notesCell, styles.notesHeader, { color: theme.textMuted }]}
      valueTextStyle={[styles.notesCell, styles.notesValue, { color: theme.text }]} />
    <DetailGestureRoot><DetailPressable accessibilityRole="button" accessibilityLabel={practice ? '移出练习清单' : '加入练习清单'}
      disabled={library.isLoading || library.isUpdating} onPress={() => {
        void library.setChartPractice(chart.songId, 'SD', levelIndex, !practice).catch(() => showNotification({ title: '练习清单保存失败', message: '请重试。', variant: 'error' }));
      }} style={[styles.action, { borderColor: colors.bg, backgroundColor: colors.bg }]}>
      <Text style={[styles.actionText, { color: colors.fg }]}>{practice ? '移出练习清单' : '加入练习清单'}</Text>
    </DetailPressable></DetailGestureRoot>
    <DetailGestureRoot><DetailPressable accessibilityRole="button" accessibilityLabel={`查看谱面确认：${songTitle} ${chart.difficulty}`}
      onPress={() => {
        cancelPreviewNavigation.current?.();
        cancelPreviewNavigation.current = openRizlineChartPreview({
          songId: chart.songId,
          levelIndex,
          title: `${songTitle} ${chart.difficulty}`,
        }, {
          push: (href) => router.push(href),
          topRouteName: () => {
            const state = typeof navigation.getState === 'function' ? navigation.getState() : undefined;
            return state?.routes[state.index ?? 0]?.name;
          },
          onFail: (message) => showNotification({
            title: '无法打开谱面确认',
            message,
            variant: 'error',
          }),
        });
      }} style={[styles.action, styles.chartSearchAction, { borderColor: colors.bg, backgroundColor: colors.bg }]}>
      <Text style={[styles.actionText, { color: colors.fg }]}>查看谱面确认</Text>
    </DetailPressable></DetailGestureRoot>
    <TagEditor testID={`rizline-chart-tags-${chart.difficulty}`} tags={item?.kind === 'chart' ? item.tags : []} presets={library.tagPresets}
      historyTags={buildTagHistory(library.data ?? [], key, library.tagPresets)} disabled={library.isUpdating || library.isLoading}
      onPresetsChange={library.setTagPresets} onChange={(tags) => library.setTags({ kind: 'chart', songId: chart.songId, type: 'SD', levelIndex }, tags)} />
  </GameChartResultCard>;
}
