import { SimaiSongHero, SimaiSongChrome, SimaiSongMetadata, SimaiChartResultLayout, SimaiNoteTable, simaiChartActionStyle, simaiChartActionTextStyle } from '@/components/game-content/SimaiSongDetailLayout';
import { simaiSongDetailStyles } from '@/components/game-content/SimaiSongDetailStyles';
import { MajdataSongDetail } from '@/components/majdata/MajdataSongDetail';
import { useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  InteractionManager,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Card } from '@/components/Card';
import { CollectionImage } from '@/components/CollectionImage';
import { DetailGestureRoot, DetailPressable } from '@/components/game-content/DetailPressable';
import { ChartCarousel as SharedChartCarousel } from '@/components/game-content/ChartCarousel';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { type SongMetadataItem } from '@/components/game-content/SongMetadataTable';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import { ChunithmSongDetail } from '@/components/chunithm/ChunithmSongDetail';
import {
  DxRatingChartTagSheet,
  type DxRatingChartTagSheetData,
} from '@/components/maimai/DxRatingChartTagSheet';
import { OsuSongDetail } from '@/components/osu/OsuSongDetail';
import { PhigrosSongDetail } from '@/components/phigros/PhigrosSongDetail';
import { QueryStateView } from '@/components/QueryStateView';
import { AchievementValue, ChartTypeBadge, DIFFICULTY_VISUAL, DifficultyBadge, ScoreStatusBadges } from '@/components/ScoreVisuals';
import { SongCover } from '@/components/SongCover';
import { TagEditor } from '@/components/TagEditor';
import { useNotification } from '@/components/AppNotification';
import { normalizeSongId } from '@/domain/catalog';
import { COLLECTION_KIND_LABEL, collectionsForSong } from '@/domain/collections';
import { isOsuGameId } from '@/domain/game-mode-family';
import {
  dxRatingTagsForChart,
  type DxRatingChartTagsSnapshot,
  type DxRatingChartTag,
} from '@/domain/dxrating-chart-tags';
import type {
  BuddyChartNotes,
  Chart,
  ChartNotes,
  ChartType,
  CollectionItem,
  Difficulty,
  GameVersion,
  ScoreRecord,
  Song,
} from '@/domain/models';
import { buildTagHistory } from '@/domain/user-library';
import {
  localizedVersionName,
  VERSION_NAME_MAPPINGS,
  type VersionNameLocale,
} from '@/domain/version-names';
import {
  normalizeTrophyTone,
  TROPHY_BADGE_THEMES,
} from '@/features/best-image/best-image-badge-theme';
import { useCollections } from '@/hooks/use-collections';
import { useDetailedCatalog, useMaimaiSongDetail } from '@/hooks/use-detailed-catalog';
import { useDxRatingChartTags } from '@/hooks/use-dxrating-chart-tags';
import { maimaiChartPreviewChartId, maimaiChartPreviewVideoUrl } from '@/domain/maimai-chart-preview';
import {
  downloadMaimaiChartPackage,
} from '@/features/maimai-chart-download/maimai-chart-download';
import { useChartPackageDownload } from '@/features/chart-download-shared/use-chart-package-download';
import { ProviderError } from '@/providers/errors';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { TufLevelDetailScreen } from '@/screens/TufScreens';
import { MuseDashSongDetailScreen } from '@/screens/MuseDashScreens';
import { PhiraSongDetailScreen } from '@/screens/PhiraScreens';

const CARD_GAP = 12;
const DIFFICULTY_ORDER: Record<Difficulty, number> = {
  utage: 0, remaster: 1, master: 2, expert: 3, advanced: 4, basic: 5, unknown: 6,
};

type LibraryHook = ReturnType<typeof useUserLibrary>;

export default function SongDetailScreen() {
  const theme = useAppTheme();
  const activeGameId = useSession((s) => s.activeGameId);
  const { songId, chartType, levelIndex, scoreId } = useLocalSearchParams<{
    songId: string; chartType?: string; levelIndex?: string; scoreId?: string;
  }>();
  const parsedLevelIndex = levelIndex === undefined ? undefined : Number(levelIndex);
  const initialLevelIndex = Number.isInteger(parsedLevelIndex) && parsedLevelIndex! >= 0 ? parsedLevelIndex : undefined;
  const parsedScoreId = scoreId === undefined ? undefined : Number(scoreId);
  const initialScoreId = Number.isInteger(parsedScoreId) && parsedScoreId! >= 0 ? parsedScoreId : undefined;

  if (activeGameId === 'phigros') {
    return <PhigrosSongDetail songId={songId} levelIndex={initialLevelIndex} />;
  }
  if (activeGameId === 'majdata-net') return <MajdataSongDetail songId={songId} initialLevelIndex={initialLevelIndex} />;
  if (activeGameId === 'phira') return <PhiraSongDetailScreen chartId={songId} />;
  if (activeGameId === 'chunithm') {
    return <ChunithmSongDetail songId={songId} initialLevelIndex={initialLevelIndex} />;
  }
  if (activeGameId === 'adofai') {
    return <TufLevelDetailScreen levelId={songId} />;
  }
  if (activeGameId === 'musedash') {
    return <MuseDashSongDetailScreen songId={songId} />;
  }
  // osu! 四模式共用歌曲详情页，songId = beatmapset id；levelIndex = 成绩卡带入的 beatmap id（优先定位该难度）。
  if (activeGameId && isOsuGameId(activeGameId)) {
    return <OsuSongDetail beatmapsetId={songId} initialBeatmapId={initialLevelIndex} initialScoreId={initialScoreId} />;
  }

  return <MaimaiSongDetailScreen
    songId={songId}
    chartType={chartType}
    initialLevelIndex={initialLevelIndex}
    themeBackground={theme.background}
  />;
}

function MaimaiSongDetailScreen({
  songId,
  chartType,
  initialLevelIndex,
  themeBackground,
}: {
  songId?: string;
  chartType?: string;
  initialLevelIndex?: number;
  themeBackground: string;
}) {
  const catalog = useDetailedCatalog(false);
  const dxratingTags = useDxRatingChartTags();
  const scores = useScoreSnapshot(false);
  const library = useUserLibrary();
  const song = useMemo(() => {
    const songs = catalog.data?.songs;
    return songs?.find((item) => item.id === songId) ??
      (songId ? songs?.find((item) => item.id === normalizeSongId(songId)) : undefined);
  }, [catalog.data?.songs, songId]);
  const songDetail = useMaimaiSongDetail(song?.id ?? songId, catalog.data, !!songId);
  const resolvedSong = songDetail.data ?? song;
  const initialChartType = chartType === 'SD' || chartType === 'DX' || chartType === 'UTAGE'
    ? chartType
    : undefined;
  const songItem = resolvedSong ? library.data?.find((item) => item.key === library.songKey(resolvedSong.id)) : undefined;
  const favorite = songItem?.kind === 'song' && songItem.favorite;
  const favoriteDisabled = library.isLoading || library.isUpdating;
  const onToggleFavorite = resolvedSong ? () => void library.setSongFavorite(resolvedSong.id, !favorite) : undefined;
  const versions = useMemo<GameVersion[]>(() => {
    if (catalog.data) return catalog.data.versions;
    const mapped = VERSION_NAME_MAPPINGS.map((version) => ({
      id: version.versionId,
      title: version.china,
    }));
    if (resolvedSong?.versionId !== undefined &&
      !mapped.some((version) => version.id === resolvedSong.versionId)) {
      mapped.push({ id: resolvedSong.versionId, title: resolvedSong.version });
    }
    return mapped;
  }, [catalog.data, resolvedSong]);
  const detailData = resolvedSong ? { song: resolvedSong, versions } : undefined;
  const isNoData = songDetail.error instanceof ProviderError && songDetail.error.code === 'no_data';
  return <>
    <StatusBar style="light" />
    <View style={[styles.page, { backgroundColor: themeBackground }]}>
      <QueryStateView<{ song: Song; versions: GameVersion[] }>
        isLoading={!resolvedSong && songDetail.isLoading}
        isError={!resolvedSong && songDetail.isError && !isNoData}
        isEmpty={!resolvedSong && !songDetail.isLoading && (isNoData || !songDetail.isError)}
        error={songDetail.error} onRetry={() => void songDetail.refetch()}
        emptyText="找不到这首歌曲" data={detailData} renderData={(item) => <Detail song={item.song} records={scores.data?.records ?? []}
          versions={item.versions} library={library}
          dxratingTags={dxratingTags.data}
          notesLoading={songDetail.isLoading}
          notesError={songDetail.isError}
          onRetryNotes={() => void songDetail.refetch()}
          initialChartType={initialChartType} initialLevelIndex={initialLevelIndex} />} />
      <SongDetailChrome
        song={resolvedSong} favorite={favorite}
        favoriteDisabled={favoriteDisabled}
        onToggleFavorite={onToggleFavorite}
      />
    </View>
  </>;
}

function SongDetailChrome({ song, favorite, favoriteDisabled, onToggleFavorite }: {
  song?: Song; favorite: boolean; favoriteDisabled: boolean; onToggleFavorite?: () => void;
}) {
  return <SimaiSongChrome favorite={song && onToggleFavorite ? {
    label: favorite ? `取消收藏 ${song.title}` : `收藏 ${song.title}`,
    active: favorite, disabled: favoriteDisabled, onPress: onToggleFavorite,
  } : undefined} />;
}

function Detail({ song, versions, records, dxratingTags, library, notesLoading, notesError, onRetryNotes, initialChartType, initialLevelIndex }: {
  song: Song;
  versions: GameVersion[];
  records: ScoreRecord[];
  dxratingTags?: DxRatingChartTagsSnapshot;
  library: LibraryHook;
  notesLoading: boolean;
  notesError: boolean;
  onRetryNotes: () => void;
  initialChartType?: ChartType;
  initialLevelIndex?: number;
}) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const [versionLocale, setVersionLocale] = useState<VersionNameLocale>('china');
  const [tagSheetData, setTagSheetData] = useState<DxRatingChartTagSheetData | null>(null);
  useEffect(() => setTagSheetData(null), [song.id]);
  const songItem = library.data?.find((item) => item.key === library.songKey(song.id));
  const availableChartTypes = useMemo(() => new Set(song.charts.map((chart) => chart.type)), [song.charts]);
  const availableChartTypeList = useMemo(
    () => (['DX', 'SD', 'UTAGE'] as const).filter((type) => availableChartTypes.has(type)),
    [availableChartTypes],
  );
  const defaultChartType: ChartType = initialChartType && availableChartTypes.has(initialChartType)
    ? initialChartType
    : availableChartTypeList[0] ?? 'SD';
  const [selectedChartType, setSelectedChartType] = useState<ChartType>(defaultChartType);
  useEffect(() => setSelectedChartType(defaultChartType), [defaultChartType, song.id]);
  const sortedCharts = useMemo(() => song.charts.filter((chart) => chart.type === selectedChartType)
    .sort((left, right) => DIFFICULTY_ORDER[left.difficulty] - DIFFICULTY_ORDER[right.difficulty]),
  [selectedChartType, song.charts]);
  const canSwitchChartType = availableChartTypeList.length > 1;
  const selectedChartTypeIndex = availableChartTypeList.indexOf(selectedChartType);
  const nextChartType = canSwitchChartType
    ? availableChartTypeList[(selectedChartTypeIndex + 1) % availableChartTypeList.length]
    : undefined;
  const cardWidth = Math.max(280, width - 40);
  const masterIndex = Math.max(0, sortedCharts.findIndex((chart) => chart.difficulty === 'master'));
  const requestedIndex = selectedChartType === initialChartType && initialLevelIndex !== undefined
    ? sortedCharts.findIndex((chart) => chart.levelIndex === initialLevelIndex) : -1;
  const initialIndex = requestedIndex >= 0 ? requestedIndex : masterIndex;
  const [visibleChartState, setVisibleChartState] = useState<{
    songId: string;
    chartType: ChartType;
    index: number;
  }>({ songId: song.id, chartType: selectedChartType, index: initialIndex });
  const visibleChartIndex = visibleChartState.songId === song.id &&
    visibleChartState.chartType === selectedChartType
    ? visibleChartState.index
    : initialIndex;
  const visibleChart = sortedCharts[visibleChartIndex] ?? sortedCharts[initialIndex];
  const visibleVersionId = visibleChart?.versionId ?? song.versionId;
  const visibleVersionTitle = versions.find((version) => version.id === visibleVersionId)?.title ?? song.version;
  const versionName = localizedVersionName(visibleVersionId, visibleVersionTitle, versionLocale);
  const [deferredReady, setDeferredReady] = useState(false);
  useEffect(() => {
    setDeferredReady(false);
    const task = InteractionManager.runAfterInteractions(() => setDeferredReady(true));
    return () => task.cancel();
  }, [song.id]);
  const metadataItems: SongMetadataItem[] = [
    { key: 'genre', label: '分类', value: song.genre ?? '未知', flex: 1 },
    { key: 'bpm', label: 'BPM', value: song.bpm?.toString() ?? '未知', flex: 0.65 },
    {
      key: 'version',
      label: '版本',
      value: versionName,
      flex: 1.8,
      cellStyle: styles.versionCell,
      rootStyle: styles.versionCellRoot,
      valueRowStyle: styles.versionValueRow,
      valuePressableStyle: styles.versionName,
      accessory: (
        <DetailPressable
          accessibilityLabel="切换版本名称"
          accessibilityRole="button"
          hitSlop={4}
          onPress={() => setVersionLocale((value) => value === 'china' ? 'japan' : 'china')}
          style={({ pressed }) => [styles.versionToggle, pressed && styles.switchPressed]}
        >
          <Ionicons name="swap-horizontal" color={theme.accent} size={14} />
        </DetailPressable>
      ),
    },
    ...(song.region
      ? [{ key: 'region', label: '区域', value: song.region, flex: 1 }]
      : []),
  ];

  return <><ScrollView testID="song-detail-scroll" contentContainerStyle={styles.content}
    keyboardShouldPersistTaps="handled">
    <SimaiSongHero size={width} id={song.id} title={song.title} artist={song.artist}
      cover={<SongCover songId={song.id} size={width} borderRadius={0} />} />
    <SimaiSongMetadata items={metadataItems} />

    {deferredReady ? <>
      <ChartCarousel key={`${song.id}:${selectedChartType}:${initialIndex}`} charts={sortedCharts} records={records} song={song}
        library={library} cardWidth={cardWidth} initialIndex={initialIndex} canSwitchChartType={canSwitchChartType}
        nextChartType={nextChartType} dxratingTags={dxratingTags} notesLoading={notesLoading}
        notesError={notesError} onRetryNotes={onRetryNotes}
        onShowAllDxRatingTags={setTagSheetData}
        onVisibleIndexChange={(index) => setVisibleChartState({
          songId: song.id,
          chartType: selectedChartType,
          index,
        })}
        onToggleChartType={() => nextChartType && setSelectedChartType(nextChartType)} />

      <View style={styles.details}>
        <SongCollectionsCard songId={song.id} />
        <Card><Text style={[styles.section, { color: theme.text }]}>歌曲信息</Text><AliasLine aliases={song.aliases} />
          <Text style={[styles.body, { color: theme.textSecondary }]}>版权：{song.rights || '未提供'}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>状态：{song.disabled ? '禁用' : song.locked ? '锁定' : '可用'}</Text></Card>
        <Card><TagEditor tags={songItem?.tags ?? []} presets={library.tagPresets ?? []}
          historyTags={buildTagHistory(library.data ?? [], library.songKey(song.id), library.tagPresets ?? [])}
          disabled={library.isUpdating} onPresetsChange={library.setTagPresets}
          onChange={(tags) => library.setTags({ kind: 'song', songId: song.id }, tags)} /></Card>
      </View>
    </> : <View testID="song-detail-deferred-placeholder" style={styles.deferredPlaceholder} />}
  </ScrollView>
  <DxRatingChartTagSheet data={tagSheetData} onClose={() => setTagSheetData(null)} />
  </>;
}

function SongCollectionsCard({ songId }: { songId: string }) {
  const theme = useAppTheme();
  const collections = useCollections();
  const matched = useMemo(
    () => collectionsForSong(collections.data?.items ?? [], songId),
    [collections.data?.items, songId],
  );
  return <DetailGestureRoot style={styles.scrollActionRoot}>
    <Card testID="song-collections-card">
      <Text style={[styles.section, { color: theme.text }]}>收藏品</Text>
      {collections.isLoading ? <Text style={[styles.meta, { color: theme.textMuted }]}>正在加载收藏品…</Text> : null}
      {collections.isError ? <View style={styles.collectionError}>
        <Text style={[styles.meta, { color: theme.textMuted }]}>收藏品加载失败</Text>
        <DetailPressable accessibilityRole="button" accessibilityLabel="重试加载收藏品"
          onPress={() => void collections.refetch()} hitSlop={8} style={styles.aliasAction}>
          <Text style={[styles.aliasActionText, { color: theme.accent }]}>重试</Text>
        </DetailPressable>
      </View> : null}
      {!collections.isLoading && !collections.isError && matched.length === 0
        ? <Text style={[styles.meta, { color: theme.textMuted }]}>无曲目专属收藏品</Text> : null}
      {matched.map((item) => <CollectionRow key={`${item.kind}:${item.id}`} item={item} />)}
    </Card>
  </DetailGestureRoot>;
}

function TrophyName({ name, color }: { name: string; color?: string | null }) {
  const tone = normalizeTrophyTone(color);
  if (tone === 'rainbow') {
    return <LayeredGradientBadge
      contentStyle={styles.trophyNameRainbowContent}
      label={name}
      numberOfLines={1}
      style={styles.trophyNameFrame}
      textStyle={styles.trophyNameText}
      tone="rainbow"
    />;
  }
  const theme = TROPHY_BADGE_THEMES[tone];
  return <View style={[styles.trophyNameFrame, styles.trophyNameSolid, { borderColor: theme.border, backgroundColor: theme.background }]}>
    <Text style={[styles.trophyNameText, { color: theme.text }]} numberOfLines={1}>{name}</Text>
  </View>;
}

function CollectionRow({ item }: { item: CollectionItem }) {
  const theme = useAppTheme();
  return <View style={[styles.collectionRow, { borderTopColor: theme.border }]} accessibilityLabel={`${COLLECTION_KIND_LABEL[item.kind]} ${item.name}`}>
    {item.kind === 'trophy' ? null
      : <CollectionImage kind={item.kind} collectionId={item.id} size={item.kind === 'plate' ? 28 : 40} />}
    <View style={styles.collectionCopy}>
      <Text style={[styles.collectionKind, { color: theme.textMuted }]}>{COLLECTION_KIND_LABEL[item.kind]}</Text>
      {item.kind === 'trophy'
        ? <TrophyName name={item.name} color={item.color} />
        : <Text style={[styles.collectionName, { color: theme.text }]}>{item.name}</Text>}
      {item.description ? <Text style={[styles.collectionDesc, { color: theme.textMuted }]} numberOfLines={2}>{item.description}</Text> : null}
    </View>
  </View>;
}

function AliasLine({ aliases }: { aliases?: string[] }) {
  const theme = useAppTheme();
  const text = `别名：${aliases?.join('、') || '无'}`;
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => { setExpanded(false); setOverflow(false); }, [text]);
  return <DetailGestureRoot style={styles.aliasBlock}>
    <Text accessible={false} testID="alias-overflow-measure" style={[styles.body, styles.aliasMeasure, { color: theme.textSecondary }]}
      onTextLayout={(event) => setOverflow(event.nativeEvent.lines.length > 1)}>{text}</Text>
    <Text testID="song-alias-text" numberOfLines={expanded ? undefined : 1} style={[styles.body, { color: theme.textSecondary }]}>{text}</Text>
    {overflow ? <DetailPressable accessibilityRole="button" accessibilityLabel={expanded ? '收起别名' : '展开别名'}
      onPress={() => setExpanded((value) => !value)} hitSlop={6} style={styles.aliasAction}>
      <Text style={[styles.aliasActionText, { color: theme.accent }]}>{expanded ? '收起' : '展开'}</Text>
    </DetailPressable> : null}
  </DetailGestureRoot>;
}


function ChartCarousel({ charts, records, song, library, cardWidth, initialIndex, canSwitchChartType, nextChartType, dxratingTags, notesLoading, notesError, onRetryNotes, onShowAllDxRatingTags, onVisibleIndexChange, onToggleChartType }: {
  charts: Chart[];
  records: ScoreRecord[];
  song: Song;
  library: LibraryHook;
  cardWidth: number;
  initialIndex: number;
  canSwitchChartType: boolean;
  nextChartType?: ChartType;
  dxratingTags?: DxRatingChartTagsSnapshot;
  notesLoading: boolean;
  notesError: boolean;
  onRetryNotes: () => void;
  onShowAllDxRatingTags: (data: DxRatingChartTagSheetData) => void;
  onVisibleIndexChange: (index: number) => void;
  onToggleChartType: () => void;
}) {
  const recordsByChart = useMemo(() => {
    const indexed = new Map<string, ScoreRecord>();
    for (const record of records) {
      if (String(record.songId) !== song.id && normalizeSongId(record.songId) !== song.id) continue;
      const key = `${record.type}:${record.levelIndex}`;
      const current = indexed.get(key);
      if (!current || record.achievements > current.achievements) indexed.set(key, record);
    }
    return indexed;
  }, [records, song.id]);
  return <SharedChartCarousel
    accessibilityLabel="难度卡片"
    cardWidth={cardWidth}
    contentContainerStyle={styles.carousel}
    empty={<View style={styles.noCharts}><Text style={styles.meta}>暂无可用难度</Text></View>}
    gap={CARD_GAP}
    initialIndex={initialIndex}
    items={charts}
    keyExtractor={(chart) => `${chart.type}:${chart.levelIndex}`}
    onIndexChange={onVisibleIndexChange}
    renderItem={(chart) => {
        const best = recordsByChart.get(`${chart.type}:${chart.levelIndex}`);
        const chartTags = dxRatingTagsForChart(dxratingTags, song, chart);
        return <ChartCard chart={chart} best={best} song={song}
          library={library} width={cardWidth} canSwitchChartType={canSwitchChartType}
          nextChartType={nextChartType} dxratingTags={chartTags}
          notesLoading={notesLoading} notesError={notesError} onRetryNotes={onRetryNotes}
          onShowAllDxRatingTags={onShowAllDxRatingTags}
          onToggleChartType={onToggleChartType} />;
    }}
    rootStyle={styles.carouselRoot}
    scrollStyle={styles.carouselScroll}
  />;
}

async function openBilibiliChartSearch(query: string): Promise<void> {
  const keyword = encodeURIComponent(query);
  const webUrl = `https://search.bilibili.com/all?keyword=${keyword}`;
  if (Platform.OS === 'web') {
    await Linking.openURL(webUrl);
    return;
  }
  try {
    await Linking.openURL(`bilibili://search?keyword=${keyword}`);
  } catch {
    await Linking.openURL(webUrl);
  }
}

function ChartCard({ chart, best, song, library, width, canSwitchChartType, nextChartType, dxratingTags, notesLoading, notesError, onRetryNotes, onShowAllDxRatingTags, onToggleChartType }: {
  chart: Chart;
  best?: ScoreRecord;
  song: Song;
  library: LibraryHook;
  width: number;
  canSwitchChartType: boolean;
  nextChartType?: ChartType;
  dxratingTags: DxRatingChartTag[];
  notesLoading: boolean;
  notesError: boolean;
  onRetryNotes: () => void;
  onShowAllDxRatingTags: (data: DxRatingChartTagSheetData) => void;
  onToggleChartType: () => void;
}) {
  const theme = useAppTheme();
  const { showActionNotification } = useNotification();
  const { isRunning: downloadRunning, start: startChartDownload } = useChartPackageDownload({
    successMessage: '可将 .adx.zip 文件导入 AstroDX 游玩。',
  });
  const visual = DIFFICULTY_VISUAL[chart.difficulty];
  const chartItem = library.data?.find((item) => item.key === library.chartKey(song.id, chart.type, chart.levelIndex));
  const practice = chartItem?.kind === 'chart' && chartItem.practice;
  const chartTypeKeyword = canSwitchChartType ? ` ${chart.type}` : '';
  const chartSearchQuery = `${song.title}${chartTypeKeyword} ${visual.label} 谱面确认`;
  const previewTitle = `${song.title}${chartTypeKeyword} ${visual.label}`;
  const chartLabel = chart.type === 'UTAGE'
    ? `U·TA·GE · ${chart.level}`
    : `${chart.type} · ${visual.label} · ${chart.level}`;
  const chartTagPresets = dxratingTags.map((tag) => tag.name);

  const openChartPreview = (buddySide?: 0 | 1 | 'dual') => {
    router.push({
      pathname: '/songs/chart-preview',
      params: {
        songId: song.id,
        chartType: chart.type,
        levelIndex: String(chart.levelIndex),
        title: previewTitle,
        ...(buddySide === undefined ? {} : { buddySide: String(buddySide) }),
      },
    } as Href);
  };

  const handleViewChartPreview = () => {
    if (chart.utage?.isBuddy) {
      showActionNotification({
        title: '选择预览谱面',
        message: '该宴谱为 Buddy 双人谱，可选择确认某一侧，或同屏查看两侧谱面。',
        variant: 'info',
        actions: [
          { label: '1P 谱面', onPress: () => openChartPreview(0) },
          { label: '2P 谱面', onPress: () => openChartPreview(1) },
          { label: '1P+2P 同屏', onPress: () => openChartPreview('dual') },
          { label: '取消', tone: 'cancel' },
        ],
      });
      return;
    }
    openChartPreview();
  };

  const showDxRatingTagDescription = (tag: DxRatingChartTag) => {
    showActionNotification({
      title: tag.name,
      message: tag.description || 'DXRating 暂未提供说明',
      ...(tag.descriptionSegments.some((segment) => segment.strikethrough)
        ? { messageSegments: tag.descriptionSegments }
        : {}),
      variant: 'info',
      actions: [{ label: '知道了', tone: 'cancel' }],
    });
  };

  const downloadLevelLabel = chart.type === 'UTAGE'
    ? chart.utage?.kanji ?? 'U·TA·GE'
    : chart.level;

  const handleDownloadChart = () => {
    void startChartDownload((options, includeVideo) => downloadMaimaiChartPackage({
      songId: song.id, chartType: chart.type, levelIndex: chart.levelIndex,
      levelLabel: downloadLevelLabel, title: song.title, includeVideo,
    }, options), { optionalVideoUrl: maimaiChartPreviewVideoUrl(maimaiChartPreviewChartId(song.id, chart.type)) });
  };

  return <GameChartResultCard
    testID={chart.type === 'UTAGE' ? 'maimai-utage-chart-card' : undefined}
    style={[styles.chartCard, {
      width,
      backgroundColor: theme.dark ? theme.surface : visual.tint,
      borderColor: visual.color,
    }]}>
    <SimaiChartResultLayout
      identity={<><DifficultyBadge difficulty={chart.difficulty} />
        {chart.type === 'UTAGE' && !canSwitchChartType ? null : <ChartTypeSwitch type={chart.type} nextType={nextChartType}
          canSwitch={canSwitchChartType} onToggle={onToggleChartType} />}</>}
      level={chart.type === 'UTAGE' ? chart.utage?.kanji ?? 'U·TA·GE' : chart.level}
      secondaryLevel={chart.type === 'UTAGE' ? chart.level : chart.difficultyConstant.toFixed(1)}
      result={<AchievementValue value={best?.achievements} />}
      badges={<ScoreStatusBadges flowing rate={best?.rate} achievements={best?.achievements} fc={best?.fc} fs={best?.fs} />}
      extraMetric={chart.type === 'UTAGE' ? null : <DetailPressable accessibilityRole="link" accessibilityLabel={`使用定数 ${chart.difficultyConstant.toFixed(1)} 打开 Rating 计算器`}
        onPress={() => router.push({ pathname: '/tools/rating', params: { constant: chart.difficultyConstant.toFixed(1) } } as Href)}
        style={({ pressed }) => [styles.ratingAction, pressed && styles.switchPressed]}>
        <Text style={[styles.rating, { color: theme.textMuted }]}>Rating <Text style={[styles.ratingValue, { color: theme.text }]}>{best?.rating ?? '—'}</Text></Text>
        <Text style={[styles.ratingHint, { color: theme.textMuted }]}>点击 Rating，前往计算器并带入定数</Text>
      </DetailPressable>} />
    {chart.type === 'UTAGE' ? null
      : <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>谱师：{chart.charter || '未提供'}</Text>}
    {chart.utage?.description
      ? <Text style={[styles.utageDescription, { color: theme.textSecondary }]}>{chart.utage.description}</Text>
      : null}
    <DxRatingTags tags={dxratingTags}
      onTagPress={showDxRatingTagDescription}
      onShowAll={() => onShowAllDxRatingTags({ songTitle: song.title, chartLabel, tags: dxratingTags })} />
    <ChartNotesTables chart={chart} loading={notesLoading} error={notesError} onRetry={onRetryNotes} />
    <DetailPressable accessibilityRole="button" accessibilityLabel={practice ? '已加入练习清单' : '加入练习清单'}
      disabled={library.isUpdating}
      onPress={() => void library.setChartPractice(song.id, chart.type, chart.levelIndex, !practice)}
      style={[styles.action, chartActionStyle(theme.dark, chart.difficulty, visual, practice)]}>
      <Text style={[styles.actionText, chartActionTextStyle(theme.dark, chart.difficulty, visual, practice)]}>
        {practice ? '已加入练习清单' : '加入练习清单'}
      </Text>
    </DetailPressable>
    <DetailPressable accessibilityRole="link" accessibilityLabel={`搜索谱面确认：${chartSearchQuery}`}
      onPress={() => void openBilibiliChartSearch(chartSearchQuery)}
      style={[styles.action, styles.chartSearchAction, chartActionStyle(theme.dark, chart.difficulty, visual, false)]}>
      <Text style={[styles.actionText, chartActionTextStyle(theme.dark, chart.difficulty, visual, false)]}>搜索Ｂ站视频</Text>
    </DetailPressable>
    <DetailPressable accessibilityRole="button" accessibilityLabel={`查看谱面确认：${previewTitle}`}
      onPress={handleViewChartPreview}
      style={[styles.action, styles.chartSearchAction, chartActionStyle(theme.dark, chart.difficulty, visual, false)]}>
      <Text style={[styles.actionText, chartActionTextStyle(theme.dark, chart.difficulty, visual, false)]}>查看谱面确认</Text>
    </DetailPressable>
    <DetailPressable accessibilityRole="button" accessibilityLabel={`下载谱面文件：${previewTitle}`}
      accessibilityState={{ disabled: downloadRunning }} disabled={downloadRunning}
      onPress={() => void handleDownloadChart()}
      style={[styles.action, styles.chartSearchAction, chartActionStyle(theme.dark, chart.difficulty, visual, false)]}>
      <Text style={[styles.actionText, chartActionTextStyle(theme.dark, chart.difficulty, visual, false)]}>
        下载谱面文件
      </Text>
    </DetailPressable>
    <TagEditor tags={chartItem?.tags ?? []} presets={chartTagPresets} presetsEditable={false}
      historyTags={buildTagHistory(library.data ?? [], library.chartKey(song.id, chart.type, chart.levelIndex), chartTagPresets)}
      disabled={library.isUpdating} testID={`maimai-chart-local-tags-${chart.type}-${chart.levelIndex}`}
      onChange={(tags) => library.setTags({ kind: 'chart', songId: song.id, type: chart.type, levelIndex: chart.levelIndex }, tags)} />
  </GameChartResultCard>;
}

function DxRatingTags({ tags, onTagPress, onShowAll }: {
  tags: DxRatingChartTag[];
  onTagPress: (tag: DxRatingChartTag) => void;
  onShowAll: () => void;
}) {
  const theme = useAppTheme();
  if (tags.length === 0) return null;
  const visible = tags.slice(0, 4);
  const remaining = tags.length - visible.length;
  return <View testID="dxrating-config-tags" style={styles.configurationBlock}>
    <View style={styles.configurationTags}>
      {visible.map((tag) => <DetailPressable key={tag.id}
        accessibilityRole="button"
        accessibilityLabel={`谱面标签 ${tag.name}，点击查看说明`}
        testID={`dxrating-config-tag-${tag.id}`}
        onPress={() => onTagPress(tag)}
        style={({ pressed }) => [styles.configurationTag, { backgroundColor: tag.color }, pressed && styles.switchPressed]}>
        <Text style={styles.configurationTagText}>{tag.name}</Text>
      </DetailPressable>)}
      {remaining > 0 ? <DetailPressable
        accessibilityRole="button"
        accessibilityLabel={`查看全部${tags.length}个谱面标签，另有${remaining}个`}
        testID="dxrating-config-tags-more"
        onPress={onShowAll}
        style={({ pressed }) => [styles.configurationMore, {
          backgroundColor: theme.surfaceMuted,
          borderColor: theme.border,
        }, pressed && styles.switchPressed]}>
        <Text style={[styles.configurationMoreText, { color: theme.textSecondary }]}>+{remaining}</Text>
      </DetailPressable> : null}
    </View>
  </View>;
}

function chartActionStyle(dark: boolean, difficulty: Difficulty, visual: (typeof DIFFICULTY_VISUAL)[Difficulty], filled: boolean) {
  return simaiChartActionStyle(dark, visual, filled, difficulty === 'remaster');
}
function chartActionTextStyle(dark: boolean, difficulty: Difficulty, visual: (typeof DIFFICULTY_VISUAL)[Difficulty], filled: boolean) {
  return simaiChartActionTextStyle(dark, visual, filled, difficulty === 'remaster');
}

function ChartTypeSwitch({ type, nextType, canSwitch, onToggle }: {
  type: ChartType; nextType?: ChartType; canSwitch: boolean; onToggle: () => void;
}) {
  const theme = useAppTheme();
  return <DetailPressable accessibilityRole="button"
    accessibilityLabel={canSwitch && nextType ? `切换为${nextType}谱面` : `${type}谱面`}
    accessibilityState={{ disabled: !canSwitch }} disabled={!canSwitch} onPress={onToggle}
    style={({ pressed }) => [styles.chartTypeRow, pressed && styles.switchPressed]}>
    <View pointerEvents="none"><ChartTypeBadge type={type} /></View>
    {canSwitch ? <Text pointerEvents="none" style={[styles.chartTypeHint, { color: theme.textMuted }]}>·点击切换·</Text> : null}
  </DetailPressable>;
}

const NOTE_COLUMNS: readonly { label: string; key: keyof ChartNotes }[] = [
  { label: 'TAP', key: 'tap' }, { label: 'HOLD', key: 'hold' }, { label: 'SLIDE', key: 'slide' },
  { label: 'TOUCH', key: 'touch' }, { label: 'BREAK', key: 'break' }, { label: '总计', key: 'total' },
];

function isBuddyChartNotes(notes: Chart['notes']): notes is BuddyChartNotes {
  return !!notes && 'left' in notes && 'right' in notes;
}

function isMaimaiChartNotes(notes: Chart['notes']): notes is ChartNotes {
  return !!notes && 'slide' in notes && 'touch' in notes;
}

function ChartNotesTables({ chart, loading, error, onRetry }: {
  chart: Chart;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const theme = useAppTheme();
  if (loading && !chart.notes) {
    return <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>正在加载谱面物量…</Text>;
  }
  if (error && !chart.notes) {
    return <DetailGestureRoot style={styles.scrollActionRoot}>
      <View style={styles.collectionError}>
        <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>谱面物量暂不可用</Text>
        <DetailPressable accessibilityRole="button" accessibilityLabel="重试谱面物量"
          onPress={onRetry} hitSlop={8} style={styles.aliasAction}>
          <Text style={[styles.aliasActionText, { color: theme.accent }]}>重试</Text>
        </DetailPressable>
      </View>
    </DetailGestureRoot>;
  }
  if (chart.utage?.isBuddy) {
    if (!isBuddyChartNotes(chart.notes)) {
      return <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>物量未提供</Text>;
    }
    return <View style={styles.buddyNotes}>
      <NotesTable label="1P" notes={chart.notes.left} />
      <NotesTable label="2P" notes={chart.notes.right} />
    </View>;
  }
  return <NotesTable notes={isMaimaiChartNotes(chart.notes) ? chart.notes : undefined} />;
}

function NotesTable({ notes, label }: { notes?: ChartNotes; label?: string }) {
  const theme = useAppTheme();
  if (!notes) return <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>物量未提供</Text>;
  const noteGroup = {
    key: label ?? 'notes',
    label,
    values: NOTE_COLUMNS.map((column) => ({
      key: column.key,
      label: column.label,
      value: notes[column.key],
    })),
  };
  const openTolerance = () => router.push({
    pathname: '/tools/tolerance',
    params: {
      tap: String(notes.tap), hold: String(notes.hold), slide: String(notes.slide),
      touch: String(notes.touch), break: String(notes.break),
    },
  } as Href);
  return <SimaiNoteTable group={noteGroup} label={label} onPress={openTolerance}
    accessibilityLabel={`使用${label ? `${label} ` : '此'}谱面物量计算容错`} />;
}

const styles = { ...simaiSongDetailStyles, ...StyleSheet.create({
  ratingAction: { alignSelf: 'flex-start', gap: 3 },
  ratingHint: { color: '#6B7280', fontSize: 11 },
  versionCellRoot: { flex: 1.8, minWidth: 0 },
  versionCell: { flex: 1 },
  versionValueRow: { minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  versionName: { flex: 1, minWidth: 0 },
  versionToggle: { width: 16, height: 16, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  chartTypeRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chartTypeHint: { color: '#8A93A3', fontSize: 9, fontWeight: '600' },
  gradientFill: { ...StyleSheet.absoluteFillObject },
  rating: { color: '#667085', fontSize: 12, fontWeight: '700', marginTop: 10 },
  ratingValue: { color: '#172033', fontSize: 17, fontWeight: '900' },
  utageDescription: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  configurationBlock: { marginTop: 10 },
  configurationTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  configurationTag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  configurationTagText: { color: '#0C4A6E', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  configurationMore: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  configurationMoreText: { fontSize: 11, lineHeight: 15, fontWeight: '700' },
  buddyNotes: { gap: 9 },
  aliasBlock: { position: 'relative', alignItems: 'stretch' },
  aliasMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 },
  aliasAction: { alignSelf: 'flex-end', paddingHorizontal: 2, paddingVertical: 3 },
  aliasActionText: { color: '#5967C9', fontSize: 12, fontWeight: '700' },
  collectionError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  collectionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  collectionCopy: { flex: 1, minWidth: 0, gap: 2 },
  collectionKind: { color: '#8A93A3', fontSize: 11, fontWeight: '700' },
  collectionName: { color: '#182130', fontSize: 14, fontWeight: '700' },
  collectionDesc: { color: '#6B7280', fontSize: 12, lineHeight: 17 },
  trophyNameFrame: { alignSelf: 'flex-start', maxWidth: '100%', height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  trophyNameSolid: { borderWidth: 1, paddingHorizontal: 10 },
  trophyNameRainbowContent: { paddingHorizontal: 8 },
  trophyNameText: { fontSize: 12, lineHeight: 16, fontWeight: '400', textAlign: 'center', includeFontPadding: false }
}) };
