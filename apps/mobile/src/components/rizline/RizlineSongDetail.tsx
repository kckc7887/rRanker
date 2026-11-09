import { SongDetailHero } from '@/components/game-content/SongDetailHero';
import { useStackScreenReady } from '@/components/CachedTabScreen';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useNavigation } from 'expo-router';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { RemoteImage } from '@/components/RemoteImage';
import { LibraryTagEditor } from '@/components/game-content/LibraryTagEditor';
import { ChartCarousel, type ChartCarouselItemState } from '@/components/game-content/ChartCarousel';
import { DetailGestureRoot } from '@/components/game-content/DetailPressable';
import { SongDetailChrome } from '@/components/game-content/SongDetailChrome';
import { ChartAction, GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { SongMetadataTable } from '@/components/game-content/SongMetadataTable';
import { VERTICAL_SONG_DETAIL_STYLES as styles } from '@/components/game-content/SongDetailChromeStyles';
import { useNotification } from '@/components/AppNotification';
import { formatRizlineConstant, rizlineCoverUrl, rizlineDifficultyColors, rizlineDifficultyIndex, sortedRizlineCharts, type RizlineChart, type RizlineRecord, type RizlineSong } from '@/domain/rizline';
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
  const song = query.data?.snapshot.songs.find((item) => item.id === songId);
  const item = library.data?.find((entry) => entry.key === library.songKey(songId));
  const favorite = item?.kind === 'song' && item.favorite;
  return <><StatusBar style="light" /><View style={[styles.page, { backgroundColor: theme.background }]}>
    <QueryStateView<RizlineSong> isLoading={query.isPending} isError={query.isError} error={query.error}
      isEmpty={!query.isPending && !query.isError && !song} data={song} emptyText="找不到这首歌曲" onRetry={() => void query.refetch()}
      renderData={(data) => <RizlineSongDetailContent key={data.id} song={data} library={library} initialLevelIndex={initialLevelIndex} />} />
    <SongDetailChrome songTitle={song?.title} favorite={favorite} favoriteDisabled={library.isLoading || library.isUpdating}
      onToggleFavorite={song ? () => {
        void library.setSongFavorite(song.id, !favorite);
      } : undefined} />
  </View></>;
}

function RizlineSongDetailContent({ song, library, initialLevelIndex }: { song: RizlineSong; library: Library; initialLevelIndex?: number }) {
  const theme = useAppTheme(); const { width } = useWindowDimensions(); const query = useGameData();
  const [coverFailed, setCoverFailed] = useState(false); const ready = useStackScreenReady();
  const charts = useMemo(() => sortedRizlineCharts(song.charts), [song.charts]);
  const records = query.data?.payload.kind === 'rizline' ? query.data.payload.records : [];
  const recordsByChart = new Map(records.map((record) => [record.chartId, record]));
  const requested = charts.findIndex((chart) => rizlineDifficultyIndex(chart.difficulty) === initialLevelIndex);
  const defaultIndex = Math.max(0, charts.findIndex((chart) => chart.difficulty === 'IN'));
  const initialIndex = requested >= 0 ? requested : defaultIndex;
  const cover = rizlineCoverUrl(song); const cardWidth = Math.max(280, width - 40);
  const seconds = song.durationSeconds;
  const duration = seconds === null ? '—' : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return <ScrollView testID="rizline-song-detail-scroll" contentContainerStyle={styles.content}>
    <SongDetailHero size={width} id={`#${song.id}`} title={song.title} artist={song.artist ?? '—'} titleTestID="rizline-song-title-scroll"
        cover={cover && !coverFailed ? <RemoteImage accessibilityLabel="曲绘" source={cover} cacheProfile="artwork" gameId="rizline"
        contentFit="cover" onError={() => setCoverFailed(true)} style={StyleSheet.absoluteFill} transition={120} /> : undefined} />
    <SongMetadataTable accessibilityLabel="歌曲详情数据" items={[
      { key: 'bpm', label: 'BPM', value: song.bpm ?? '—', flex: 1 }, { key: 'duration', label: '时长', value: duration, flex: 1 },
      { key: 'illustrator', label: '曲绘画师', value: song.illustrator ?? '—', flex: 1 }, { key: 'pack', label: '曲包', value: song.packName, flex: 1 },
    ]}
      testIDPrefix="rizline-metadata" />
    {ready ? <><ChartCarousel items={charts} initialIndex={initialIndex} cardWidth={cardWidth} gap={12} resetKey={song.id}
      accessibilityLabel="谱面难度卡片" testID="rizline-chart-carousel" rootStyle={styles.carouselRoot} scrollStyle={styles.carouselScroll}
      contentContainerStyle={styles.carousel} keyExtractor={(chart) => library.chartKey(chart.songId, 'SD', rizlineDifficultyIndex(chart.difficulty))}
      empty={<Text style={[styles.noCharts, { color: theme.textMuted }]}>暂无谱面</Text>}
      renderItem={(chart, carouselState) => <RizlineChartCard carouselState={carouselState} chart={chart} record={recordsByChart.get(chart.id)} library={library} cardWidth={cardWidth} songTitle={song.title} />} />
      <View style={styles.details}><Card><LibraryTagEditor library={library} target={{ kind: 'song', songId: song.id }}
        testID="rizline-song-tags" disabled={library.isUpdating || library.isLoading} /></Card></View>
    </> : <View style={styles.deferredPlaceholder} />}
  </ScrollView>;
}

function RizlineChartCard({ chart, record, library, cardWidth, songTitle, carouselState }: {
  chart: RizlineChart; record?: RizlineRecord; library: Library; cardWidth: number; songTitle: string; carouselState: ChartCarouselItemState;
}) {
  const theme = useAppTheme(); const { showNotification } = useNotification();
  const navigation = useNavigation();
  const cancelPreviewNavigation = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPreviewNavigation.current?.(), []);
  const colors = rizlineDifficultyColors(chart.difficulty, theme.dark); const presentation = presentRizlineChart(chart, record);
  const levelIndex = rizlineDifficultyIndex(chart.difficulty); const key = library.chartKey(chart.songId, 'SD', levelIndex);
  const item = library.data?.find((entry) => entry.key === key); const practice = item?.kind === 'chart' && item.practice;
  return <GameChartResultCard testID={`rizline-chart-${chart.difficulty}`} accessibilityLabel={`${chart.difficulty} 难度卡片`}
    style={[styles.chartCard, { width: cardWidth, backgroundColor: theme.surface, borderColor: colors.bg }]}
      summary={{
        difficulty: <RizlineDifficultyBadge difficulty={chart.difficulty} />, level: chart.level, constant: formatRizlineConstant(chart.constant),
      label: presentation.primaryMetric.label ?? '', value: <RizlineAccuracyValue record={record} text={presentation.primaryMetric.text} fontSize={34} lineHeight={40} />,
      badges: <RizlineStatusBadge record={record} />, metrics: presentation.secondaryMetrics, charter: presentation.charter,
      }}>
    <GameNoteTable mode="grid" group={presentation.notes[0]!} accessibilityLabel="谱面物量" />
    <DetailGestureRoot><ChartAction label={practice ? '移出练习清单' : '加入练习清单'}
      disabled={library.isLoading || library.isUpdating}
      onPress={() => {
        void library.setChartPractice(chart.songId, 'SD', levelIndex, !practice);
      }}
      stack="first" style={{ borderColor: colors.bg, backgroundColor: colors.bg }}
      textStyle={{ color: colors.fg }} /></DetailGestureRoot>
    <DetailGestureRoot><ChartAction label="查看谱面确认"
      accessibilityLabel={`查看谱面确认：${songTitle} ${chart.difficulty}`}
      onPress={() => {
        cancelPreviewNavigation.current?.();
        cancelPreviewNavigation.current = openRizlineChartPreview({
          songId: chart.songId,
          levelIndex,
          title: songTitle,
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
      }}
      stack="next" style={{ borderColor: colors.bg, backgroundColor: colors.bg }}
      textStyle={{ color: colors.fg }} /></DetailGestureRoot>
    <LibraryTagEditor library={library} target={{ kind: 'chart', songId: chart.songId, type: 'SD', levelIndex }}
      {...carouselState.tagEditor} testID={`rizline-chart-tags-${chart.difficulty}`} disabled={library.isUpdating || library.isLoading} />
  </GameChartResultCard>;
}
