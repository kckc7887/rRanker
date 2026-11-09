import { SongInformationCard } from '@/components/game-content/SongInformationCard';
import { SongDetailChrome } from '@/components/game-content/SongDetailChrome';
import { useStackScreenReady } from '@/components/CachedTabScreen';
import { useMemo } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Card } from '@/components/Card';
import { GameSongCover } from '@/components/game-content/GameSongCover';
import { QueryStateView } from '@/components/QueryStateView';
import { LibraryTagEditor } from '@/components/game-content/LibraryTagEditor';
import { AchievementValue, ScoreStatusBadges } from '@/components/ScoreVisuals';
import { ChartCarousel, type ChartCarouselItemState } from '@/components/game-content/ChartCarousel';
import { ChartAction, GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { SimaiDifficultyRadar } from '@/components/game-content/SimaiDifficultyRadar';
import {
  SimaiSongHero, SimaiSongMetadata, SimaiChartResultLayout, SimaiNoteTable, SimaiNoteStatus,
  simaiChartActionStyle, simaiChartActionTextStyle,
} from '@/components/game-content/SimaiSongDetailLayout';
import { SIMAI_CHART_GAP, simaiSongDetailStyles as styles } from '@/components/game-content/SimaiSongDetailStyles';
import { MAJDATA_NAMES, MAJDATA_ORDER, majdataAsset, majdataDefaultDifficulty, majdataNoteGroup, majdataTags, type MajdataSong, type MajdataScore } from '@/domain/majdata';
import { useMajdataSong, useMajdataParsedChart } from '@/hooks/use-majdata';
import { useGameData } from '@/hooks/use-game-data';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useAppTheme } from '@/theme/app-theme';
import { ProviderError } from '@/providers/errors';
import { downloadSimaiPackage } from '@/features/chart-download-shared/simai-package';
import { useChartPackageDownload } from '@/features/chart-download-shared/use-chart-package-download';
import { MajdataDifficultyBadge, majdataVisual } from './MajdataCards';
import { buildMaxedMajdataScore } from '@/providers/maxed-majdata-test-provider';

type Library = ReturnType<typeof useUserLibrary>;

export function MajdataSongDetail({ songId, initialLevelIndex }: { songId: string; initialLevelIndex?: number }) {
  const theme = useAppTheme();
  const query = useMajdataSong(songId);
  const song = query.data;
  const library = useUserLibrary();
  const local = library.data?.find(item => item.key === library.songKey(songId));
  const favorite = local?.kind === 'song' && local.favorite;
  const noData = query.error instanceof ProviderError && query.error.code === 'no_data';
  return <>
    <StatusBar style="light" />
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <QueryStateView data={song} isLoading={!song && query.isPending}
        isError={!song && query.isError && !noData} error={query.error}
        isEmpty={!song && (noData || query.isSuccess)} emptyText="找不到这首歌曲"
        onRetry={() => void query.refetch()}
        renderData={value => <MajdataDetailContent key={`${value.id}:${value.hash}:${initialLevelIndex ?? ''}`} song={value}
          initialLevelIndex={initialLevelIndex} library={library} />} />
      <SongDetailChrome songTitle={song?.title} favorite={favorite} favoriteDisabled={library.isLoading || library.isUpdating}
        onToggleFavorite={song ? () => void library.setSongFavorite(song.id, !favorite) : undefined} />
    </View>
  </>;
}

function MajdataDetailContent({ song, initialLevelIndex, library }: { song: MajdataSong; initialLevelIndex?: number; library: Library }) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const game = useGameData();
  const records = game.data?.payload.kind === 'majdata-net' ? game.data.payload.snapshot.records : [];
  const levels = useMemo(() => MAJDATA_ORDER.filter(level => song.levels[level]?.trim()), [song.levels]);
  const initial = majdataDefaultDifficulty(song, initialLevelIndex);
  const initialIndex = Math.max(0, levels.findIndex(level => level === initial));
  const deferredReady = useStackScreenReady();
  const requestedMissing = initialLevelIndex !== undefined && !song.levels[initialLevelIndex]?.trim();
  const cardWidth = Math.max(280, width - 40);
  return <ScrollView testID="majdata-song-detail-scroll" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <SimaiSongHero size={width} id={song.id} title={song.title} artist={song.artist || undefined}
      cover={<GameSongCover source={majdataAsset(song.id, 'image', true)} gameId="majdata-net" size={width} borderRadius={0} />} />
    <SimaiSongMetadata testIDPrefix="majdata-metadata" items={[
      { key: 'author', label: '作者', value: song.designer || '未提供', flex: 1 },
      { key: 'published', label: '发布时间', value: new Date(song.timestamp).toLocaleString(), flex: 1 },
    ]} />
    {deferredReady ? <>
      {requestedMissing ? <View style={styles.noCharts}><Text style={[styles.meta, { color: theme.textMuted }]}>所选难度不可用</Text></View>
        : <ChartCarousel items={levels} cardWidth={cardWidth} gap={SIMAI_CHART_GAP} initialIndex={initialIndex}
          accessibilityLabel="难度卡片" testID="majdata-chart-carousel" rootStyle={styles.carouselRoot} scrollStyle={styles.carouselScroll}
          contentContainerStyle={styles.carousel} keyExtractor={level => library.chartKey(song.id, 'SD', level)}
          empty={<View style={styles.noCharts}><Text style={styles.meta}>暂无可用难度</Text></View>}
          renderItem={(level, carouselState) => <MajdataChartCard carouselState={carouselState} song={song} level={level} width={cardWidth} library={library}
            example={game.data?.providerId === 'majdata-net-test'}
            best={records.find(score => score.chartInfo.id === song.id && score.chartLevel === level && score.hash === song.hash)} />} />}
      <View style={styles.details}>
        <SongInformationCard fields={[
          { label: '简介', value: song.description || '未提供' },
          { label: '标签', value: majdataTags(song).join('、') || '无' },
          { label: 'HASH', value: song.hash, selectable: true },
        ]} />
        <Card><LibraryTagEditor library={library} target={{ kind: 'song', songId: song.id }}
          testID="majdata-song-local-tags" /></Card>
      </View>
    </> : <View testID="song-detail-deferred-placeholder" style={styles.deferredPlaceholder} />}
  </ScrollView>;
}

function MajdataChartCard({ song, level, width, library, best, carouselState, example }: {
  song: MajdataSong; level: number; width: number; library: Library; best?: MajdataScore; carouselState: ChartCarouselItemState; example: boolean;
}) {
  const theme = useAppTheme();
  const visual = majdataVisual(level);
  const parsed = useMajdataParsedChart(song, level);
  const download = useChartPackageDownload({ successMessage: '谱面文件已保存。' });
  const item = library.data?.find(entry => entry.key === library.chartKey(song.id, 'SD', level));
  const practice = item?.kind === 'chart' && item.practice;
  const counts = parsed.data?.statistics?.counts;
  const generated = example && counts ? buildMaxedMajdataScore(song, level, counts) : undefined;
  const result = example ? generated?.dxScore === 0 ? undefined : generated : best;
  const notes = useMemo(() => majdataNoteGroup(counts), [counts]);
  const title = `${song.title} ${MAJDATA_NAMES[level]}`;
  const actions = simaiChartActionStyle(theme.dark, visual, false, level === 5);
  const actionText = simaiChartActionTextStyle(theme.dark, visual, false, level === 5);
  const startDownload = () => {
    carouselState.onDownloadRunningChange(true);
    void download.start((options, includeVideo) => downloadSimaiPackage({
      title: song.title, suffix: MAJDATA_NAMES[level], resources: [
        { fileName: 'maidata.txt', url: majdataAsset(song.id, 'chart') },
        { fileName: 'track.mp3', url: majdataAsset(song.id, 'track') },
        { fileName: 'bg.auto', url: majdataAsset(song.id, 'image', true) },
        ...(includeVideo ? [{ fileName: 'pv.mp4', url: majdataAsset(song.id, 'video') }] : []),
      ],
    }, options), { optionalVideoUrl: majdataAsset(song.id, 'video') })
      .finally(() => carouselState.onDownloadRunningChange(false));
  };
  return <GameChartResultCard testID={`majdata-chart-card-${level}`} style={[styles.chartCard, {
    width, backgroundColor: theme.dark ? theme.surface : visual.tint, borderColor: visual.color,
  }]}>
    <SimaiChartResultLayout identity={<MajdataDifficultyBadge level={level} />} level={song.levels[level]}
      result={<AchievementValue value={result?.acc.dx} />}
      badges={<ScoreStatusBadges flowing achievements={result?.acc.dx} fc={result ? ['', 'fc', 'fcp', 'ap', 'app'][result.comboState] : undefined} />} />
    {parsed.data?.difficultyScores ? <SimaiDifficultyRadar scores={parsed.data.difficultyScores} color={visual.color} difficulty={String(level)} /> : null}
    {notes ? <SimaiNoteTable group={notes} accessibilityLabel="使用此谱面物量计算容错"
      onPress={() => router.push({ pathname: '/tools/tolerance', params: { gameId: 'majdata-net', songId: song.id, hash: song.hash, levelIndex: String(level) } })} />
      : <SimaiNoteStatus loading={!parsed.isError} onRetry={parsed.isError ? () => void parsed.refetch() : undefined} />}
    <ChartAction label={practice ? '已加入练习清单' : '加入练习清单'}
      disabled={library.isUpdating}
      onPress={() => void library.setChartPractice(song.id, 'SD', level, !practice)}
      stack="first" style={simaiChartActionStyle(theme.dark, visual, Boolean(practice), level === 5)}
      textStyle={simaiChartActionTextStyle(theme.dark, visual, Boolean(practice), level === 5)} />
    <ChartAction label="查看谱面确认"
      accessibilityLabel={`查看谱面确认：${title}`}
      onPress={() => router.push({ pathname: '/songs/chart-preview', params: { gameId: 'majdata-net', songId: song.id, levelIndex: String(level), hash: song.hash, title: song.title } })}
      stack="next" style={actions}
      textStyle={actionText} />
    <ChartAction label="下载谱面文件"
      accessibilityLabel={`下载谱面文件：${title}`}
      disabled={download.isRunning}
      accessibilityState={{ disabled: download.isRunning }}
      onPress={startDownload}
      stack="next" style={actions}
      textStyle={actionText} />
    <LibraryTagEditor library={library} target={{ kind: 'chart', songId: song.id, type: 'SD', levelIndex: level }}
      {...carouselState.tagEditor} testID={`majdata-chart-local-tags-${level}`} />
  </GameChartResultCard>;
}
