import { useEffect, useMemo, useState } from 'react';
import { InteractionManager, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Card } from '@/components/Card';
import { GameSongCover } from '@/components/game-content/GameSongCover';
import { QueryStateView } from '@/components/QueryStateView';
import { TagEditor } from '@/components/TagEditor';
import { AchievementValue, ScoreStatusBadges } from '@/components/ScoreVisuals';
import { ChartCarousel } from '@/components/game-content/ChartCarousel';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { DetailPressable } from '@/components/game-content/DetailPressable';
import {
  SimaiSongHero, SimaiSongChrome, SimaiSongMetadata, SimaiChartResultLayout, SimaiNoteTable, SimaiNoteStatus,
  simaiChartActionStyle, simaiChartActionTextStyle,
} from '@/components/game-content/SimaiSongDetailLayout';
import { SIMAI_CHART_GAP, simaiSongDetailStyles as styles } from '@/components/game-content/SimaiSongDetailStyles';
import { MAJDATA_NAMES, MAJDATA_ORDER, majdataAsset, majdataDefaultDifficulty, majdataTags, type MajdataSong, type MajdataScore } from '@/domain/majdata';
import { buildTagHistory } from '@/domain/user-library';
import { useMajdataSong, useMajdataParsedChart } from '@/hooks/use-majdata';
import { useGameData } from '@/hooks/use-game-data';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useAppTheme } from '@/theme/app-theme';
import { ProviderError } from '@/providers/errors';
import { downloadSimaiPackage } from '@/features/chart-download-shared/simai-package';
import { useChartPackageDownload } from '@/features/chart-download-shared/use-chart-package-download';
import { majdataContentAdapter } from '@/features/game-content/adapters/majdata';
import { MajdataDifficultyBadge, majdataVisual } from './MajdataCards';

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
      <QueryStateView data={song} isLoading={!song && query.isLoading}
        isError={!song && query.isError && !noData} error={query.error}
        isEmpty={!song && !query.isLoading && (noData || !query.isError)} emptyText="找不到这首歌曲"
        onRetry={() => void query.refetch()}
        renderData={value => <MajdataDetailContent key={`${value.id}:${value.hash}:${initialLevelIndex ?? ''}`} song={value}
          initialLevelIndex={initialLevelIndex} library={library} />} />
      <SimaiSongChrome favorite={song ? {
        label: favorite ? `取消收藏 ${song.title}` : `收藏 ${song.title}`, active: favorite,
        disabled: library.isLoading || library.isUpdating,
        onPress: () => void library.setSongFavorite(song.id, !favorite),
      } : undefined} />
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
  const [visibleIndex, setVisibleIndex] = useState(initialIndex);
  const [deferredReady, setDeferredReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setDeferredReady(true));
    return () => task.cancel();
  }, []);
  const local = library.data?.find(item => item.key === library.songKey(song.id));
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
        : <ChartCarousel items={levels} cardWidth={cardWidth} gap={SIMAI_CHART_GAP} initialIndex={visibleIndex}
          accessibilityLabel="难度卡片" testID="majdata-chart-carousel" rootStyle={styles.carouselRoot} scrollStyle={styles.carouselScroll}
          contentContainerStyle={styles.carousel} keyExtractor={String} onIndexChange={setVisibleIndex}
          empty={<View style={styles.noCharts}><Text style={styles.meta}>暂无可用难度</Text></View>}
          renderItem={level => <MajdataChartCard song={song} level={level} width={cardWidth} library={library}
            best={records.find(score => score.chartInfo.id === song.id && score.chartLevel === level && score.hash === song.hash)}
            active={levels[visibleIndex] === level} />} />}
      <View style={styles.details}>
        <Card><Text style={[styles.section, { color: theme.text }]}>歌曲信息</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>简介：{song.description || '未提供'}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>标签：{majdataTags(song).join('、') || '无'}</Text>
          <Text selectable style={[styles.body, { color: theme.textSecondary }]}>HASH：{song.hash}</Text>
        </Card>
        <Card><TagEditor tags={local?.tags ?? []} presets={library.tagPresets ?? []}
          historyTags={buildTagHistory(library.data ?? [], library.songKey(song.id), library.tagPresets ?? [])}
          disabled={library.isUpdating} onPresetsChange={library.setTagPresets} testID="majdata-song-local-tags"
          onChange={tags => library.setTags({ kind: 'song', songId: song.id }, tags)} /></Card>
      </View>
    </> : <View testID="song-detail-deferred-placeholder" style={styles.deferredPlaceholder} />}
  </ScrollView>;
}

function MajdataChartCard({ song, level, width, library, best, active }: {
  song: MajdataSong; level: number; width: number; library: Library; best?: MajdataScore; active: boolean;
}) {
  const theme = useAppTheme();
  const visual = majdataVisual(level);
  const parsed = useMajdataParsedChart(active ? song : undefined, level);
  const download = useChartPackageDownload({ successMessage: '谱面文件已保存。' });
  const item = library.data?.find(entry => entry.key === library.chartKey(song.id, 'SD', level));
  const practice = item?.kind === 'chart' && item.practice;
  const statistics = parsed.data?.statistics;
  const notes = useMemo(() => majdataContentAdapter.normalizeChart({ song, level, statistics }).notes[0], [song, level, statistics]);
  const title = `${song.title} ${MAJDATA_NAMES[level]}`;
  const actions = simaiChartActionStyle(theme.dark, visual, false, level === 5);
  const actionText = simaiChartActionTextStyle(theme.dark, visual, false, level === 5);
  const startDownload = () => void download.start((options, includeVideo) => downloadSimaiPackage({
    title: song.title, suffix: MAJDATA_NAMES[level], resources: [
      { fileName: 'maidata.txt', url: majdataAsset(song.id, 'chart') },
      { fileName: 'track.mp3', url: majdataAsset(song.id, 'track') },
      { fileName: 'bg.auto', url: majdataAsset(song.id, 'image', true) },
      ...(includeVideo ? [{ fileName: 'pv.mp4', url: majdataAsset(song.id, 'video') }] : []),
    ],
  }, options), { optionalVideoUrl: majdataAsset(song.id, 'video') });
  return <GameChartResultCard testID={`majdata-chart-card-${level}`} style={[styles.chartCard, {
    width, backgroundColor: theme.dark ? theme.surface : visual.tint, borderColor: visual.color,
  }]}>
    <SimaiChartResultLayout identity={<MajdataDifficultyBadge level={level} />} level={song.levels[level]}
      result={<AchievementValue value={best?.acc.dx} />}
      badges={<ScoreStatusBadges flowing achievements={best?.acc.dx} fc={best ? ['', 'fc', 'fcp', 'ap', 'app'][best.comboState] : undefined} />} />
    {notes ? <SimaiNoteTable group={notes} accessibilityLabel="使用此谱面物量计算容错"
      onPress={() => router.push({ pathname: '/tools/tolerance', params: { gameId: 'majdata-net', songId: song.id, hash: song.hash, levelIndex: String(level) } })} />
      : <SimaiNoteStatus loading={!parsed.isError} onRetry={parsed.isError ? () => void parsed.refetch() : undefined} />}
    <DetailPressable accessibilityRole="button" accessibilityLabel={practice ? '已加入练习清单' : '加入练习清单'} disabled={library.isUpdating}
      onPress={() => void library.setChartPractice(song.id, 'SD', level, !practice)}
      style={[styles.action, simaiChartActionStyle(theme.dark, visual, Boolean(practice), level === 5)]}>
      <Text style={[styles.actionText, simaiChartActionTextStyle(theme.dark, visual, Boolean(practice), level === 5)]}>{practice ? '已加入练习清单' : '加入练习清单'}</Text>
    </DetailPressable>
    <DetailPressable accessibilityRole="button" accessibilityLabel={`查看谱面确认：${title}`}
      onPress={() => router.push({ pathname: '/songs/chart-preview', params: { gameId: 'majdata-net', songId: song.id, levelIndex: String(level), hash: song.hash, title } })}
      style={[styles.action, styles.chartSearchAction, actions]}><Text style={[styles.actionText, actionText]}>查看谱面确认</Text></DetailPressable>
    <DetailPressable accessibilityRole="button" accessibilityLabel={`下载谱面文件：${title}`} disabled={download.isRunning}
      accessibilityState={{ disabled: download.isRunning }} onPress={startDownload}
      style={[styles.action, styles.chartSearchAction, actions]}><Text style={[styles.actionText, actionText]}>下载谱面文件</Text></DetailPressable>
    <TagEditor tags={item?.tags ?? []} presets={library.tagPresets ?? []} disabled={library.isUpdating}
      historyTags={buildTagHistory(library.data ?? [], library.chartKey(song.id, 'SD', level), library.tagPresets ?? [])}
      onPresetsChange={library.setTagPresets} testID={`majdata-chart-local-tags-${level}`}
      onChange={tags => library.setTags({ kind: 'chart', songId: song.id, type: 'SD', levelIndex: level }, tags)} />
  </GameChartResultCard>;
}
