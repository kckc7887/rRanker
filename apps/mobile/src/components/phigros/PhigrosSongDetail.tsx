import { SongInformationCard } from '@/components/game-content/SongInformationCard';
import { useCachedTabActive, useStackScreenReady } from '@/components/CachedTabScreen';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RemoteImage as Image } from '@/components/RemoteImage';
import { router, useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Card } from '@/components/Card';
import { ChartCarousel as SharedChartCarousel, type ChartCarouselItemState } from '@/components/game-content/ChartCarousel';
import { ChartAction, GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { SongMetadataTable, type SongMetadataItem } from '@/components/game-content/SongMetadataTable';
import { SongDetailChrome } from '@/components/game-content/SongDetailChrome';
import { VERTICAL_SONG_DETAIL_STYLES as PHIGROS_SONG_DETAIL_STYLES } from '@/components/game-content/SongDetailChromeStyles';
import { SongDetailHero } from '@/components/game-content/SongDetailHero';
import { LibraryTagEditor } from '@/components/game-content/LibraryTagEditor';
import { PhigrosKyouChartTags, PhigrosKyouChartTagsSheet } from './PhigrosKyouChartTags';
import { PhigrosScoreValue } from './PhigrosScoreValue';
import { PhigrosRateBadge, resolvePhigrosRate } from './PhigrosRateBadge';
import { PhigrosXingBadge } from './PhigrosXingBadge';
import { QueryStateView } from '@/components/QueryStateView';
import { useNotification } from '@/components/AppNotification';
import type { Chart, PhigrosChartNotes, ScoreRecord, Song } from '@/domain/models';
import { formatPhigrosSongRks, PHIGROS_MAX_SCORE } from '@/domain/phigros';
import {
  buildPhigrosKyouChartTagIndex,
  phigrosKyouPresentedTagsForChart,
  type PhigrosKyouChartTagIndex,
  type PhigrosKyouResolvedTag,
} from '@/domain/phigros-kyou';
import { phigrosLevelColors, phigrosLevelLabel } from '@/domain/phigros-level-theme';
import { resolvePhigrosXingKind } from '@/domain/phigros-xing';
import { useGameData } from '@/hooks/use-game-data';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { usePhigrosKyouChartTags } from '@/hooks/use-phigros-kyou';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useAppTheme } from '@/theme/app-theme';
import { openChartPreviewNavigation } from '@/features/chart-preview-shared/chart-preview-open';
import { useChartPackageDownload } from '@/features/chart-download-shared/use-chart-package-download';
import { downloadPhigrosChartAsPhiraPackage } from '@/features/phigros-chart-download/chart-package-download';

const PHIGROS_CHART_TYPE = 'SD' as const;


const CARD_GAP = 12;
const IN_LEVEL_INDEX = 2;

type LibraryHook = ReturnType<typeof useUserLibrary>;

export function PhigrosSongDetail({
  songId,
  levelIndex,
}: {
  songId?: string;
  levelIndex?: number;
}) {
  const theme = useAppTheme();
  const catalog = usePhigrosCatalog();
  const kyouChartTags = usePhigrosKyouChartTags();
  const gameData = useGameData(false);
  const library = useUserLibrary();
  const song = useMemo(() => {
    const songs = catalog.data?.snapshot.songs;
    return songs?.find((item) => item.id === songId);
  }, [catalog.data?.snapshot.songs, songId]);

  const records = useMemo(() => {
    const payload = gameData.data?.payload;
    if (payload?.kind === 'phigros') return payload.records;
    return [] as ScoreRecord[];
  }, [gameData.data?.payload]);

  const provider = catalog.data?.provider ?? null;
  const kyouTagIndex = useMemo(() => buildPhigrosKyouChartTagIndex(
    kyouChartTags.data,
    catalog.data?.snapshot,
  ), [catalog.data?.snapshot, kyouChartTags.data]);
  const illustrationUrl = songId && provider ? provider.getIllustrationUrl(songId) : null;
  const blurUrl = songId && provider ? provider.getIllustrationBlurUrl(songId) : null;
  const lowresUrl = songId && provider ? provider.getIllustrationLowresUrl(songId) : null;
  const songItem = song ? library.data?.find((item) => item.key === library.songKey(song.id)) : undefined;
  const favorite = songItem?.kind === 'song' && songItem.favorite;
  const favoriteDisabled = library.isLoading || library.isUpdating;
  const onToggleFavorite = song ? () => void library.setSongFavorite(song.id, !favorite) : undefined;

  return <>
    <StatusBar style="light" />
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <QueryStateView<Song>
        isLoading={catalog.isLoading}
        isError={catalog.isError}
        isEmpty={!!catalog.data && !song}
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
        emptyText="找不到这首歌曲"
        data={song}
        renderData={(item) => (
          <Detail
            song={item}
            records={records}
            kyouTagIndex={kyouTagIndex}
            illustrationUrl={illustrationUrl}
            blurUrl={blurUrl}
            lowresUrl={lowresUrl}
            initialLevelIndex={levelIndex}
            library={library}
            catalogFetching={catalog.isFetching}
            onEnsureLatestNoteCounts={() => void catalog.refetch()}
          />
        )}
      />
      <SongDetailChrome
        songTitle={song?.title}
        favorite={favorite}
        favoriteDisabled={favoriteDisabled}
        onToggleFavorite={onToggleFavorite}
      />
    </View>
  </>;
}


function Detail({
  song,
  records,
  kyouTagIndex,
  illustrationUrl,
  blurUrl,
  lowresUrl,
  initialLevelIndex,
  library,
  catalogFetching,
  onEnsureLatestNoteCounts,
}: {
  song: Song;
  records: ScoreRecord[];
  kyouTagIndex: PhigrosKyouChartTagIndex;
  illustrationUrl: string | null;
  blurUrl: string | null;
  lowresUrl: string | null;
  initialLevelIndex?: number;
  library: LibraryHook;
  catalogFetching: boolean;
  onEnsureLatestNoteCounts: () => void;
}) {
  const { width } = useWindowDimensions();
  const active = useCachedTabActive();
  const sortedCharts = useMemo(
    () => [...song.charts].sort((a, b) => b.levelIndex - a.levelIndex),
    [song.charts],
  );
  const hasAnyNotes = useMemo(
    () => song.charts.some((chart) => asPhigrosNotes(chart.notes)),
    [song.charts],
  );
  const [triedNotesRefresh, setTriedNotesRefresh] = useState(false);
  useEffect(() => {
    setTriedNotesRefresh(false);
  }, [song.id]);
  useEffect(() => {
    if (!active || hasAnyNotes || triedNotesRefresh) return;
    setTriedNotesRefresh(true);
    onEnsureLatestNoteCounts();
  }, [active, hasAnyNotes, triedNotesRefresh, onEnsureLatestNoteCounts]);
  const notesPending = !hasAnyNotes && (!triedNotesRefresh || catalogFetching);
  const defaultIndex = Math.max(0, sortedCharts.findIndex((c) => c.levelIndex === IN_LEVEL_INDEX));
  const requestedIndex = initialLevelIndex === undefined
    ? -1
    : sortedCharts.findIndex((c) => c.levelIndex === initialLevelIndex);
  const initialIndex = requestedIndex >= 0 ? requestedIndex : defaultIndex;
  const cardWidth = Math.max(280, width - 40);
  const deferredReady = useStackScreenReady();
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverStage, setCoverStage] = useState<'full' | 'lowres' | 'blur'>('full');
  const { isRunning: downloadRunning, start: startChartDownload } = useChartPackageDownload({
    successMessage: '可将 ZIP 文件导入 Phira 游玩。',
  });

  useEffect(() => {
    setCoverFailed(false);
    setCoverStage('full');
  }, [song.id]);

  const coverSource = coverStage === 'full'
    ? illustrationUrl
    : coverStage === 'lowres'
      ? lowresUrl
      : blurUrl;
  const metadataItems: SongMetadataItem[] = [
    { key: 'illustrator', label: '曲绘画师', value: song.illustrator ?? '未知', flex: 1 },
    ...(song.version ? [{ key: 'chapter', label: '章节', value: song.version, flex: 1 }] : []),
  ];

  return (
    <ScrollView testID="phigros-song-detail-scroll" contentContainerStyle={styles.content}>
      <SongDetailHero size={width} id={`#${song.id}`} title={song.title} artist={song.artist ?? '曲师未知'} titleTestID="phigros-song-title-scroll"
      cover={coverFailed || !coverSource ? undefined : (
          <Image
            accessibilityLabel="曲绘"
                  cacheProfile="artwork"
            gameId="phigros"
            contentFit="cover"
            onError={() => {
              if (coverStage === 'full' && lowresUrl) {
                setCoverStage('lowres');
                return;
              }
              if (coverStage !== 'blur' && blurUrl) {
                setCoverStage('blur');
                return;
              }
              setCoverFailed(true);
            }}
            source={coverSource}
            style={StyleSheet.absoluteFill}
            transition={120}
          />
        )} />

      <SongMetadataTable
        accessibilityLabel="歌曲详情数据"
        items={metadataItems}
        testIDPrefix="phigros-metadata"
      />

      {deferredReady ? <>
        <ChartCarousel
          key={`${song.id}:${initialIndex}`}
          charts={sortedCharts}
          records={records}
          song={song}
          library={library}
          cardWidth={cardWidth}
          initialIndex={initialIndex}
          notesPending={notesPending}
          kyouTagIndex={kyouTagIndex}
          downloadRunning={downloadRunning}
          onDownloadChart={(chart) => {
            void startChartDownload((options) => downloadPhigrosChartAsPhiraPackage({
              songId: song.id,
              levelIndex: chart.levelIndex,
              title: song.title,
            }, options));
          }}
        />
        <View style={styles.details}>
          <SongInformationCard prominent style={styles.songInformation} aliases={song.aliases} aliasPrefix="phigros-alias" />
          <Card>
            <LibraryTagEditor library={library} target={{ kind: 'song', songId: song.id }} />
          </Card>
        </View>
      </> : <View testID="phigros-song-detail-deferred-placeholder" style={styles.deferredPlaceholder} />}
    </ScrollView>
  );
}

function ChartCarousel({
  charts,
  records,
  song,
  library,
  cardWidth,
  initialIndex,
  notesPending,
  kyouTagIndex,
  downloadRunning,
  onDownloadChart,
}: {
  charts: Chart[];
  records: ScoreRecord[];
  song: Song;
  library: LibraryHook;
  cardWidth: number;
  initialIndex: number;
  notesPending: boolean;
  kyouTagIndex: PhigrosKyouChartTagIndex;
  downloadRunning: boolean;
  onDownloadChart: (chart: Chart) => void;
}) {
  const [expandedTags, setExpandedTags] = useState<ReturnType<typeof phigrosKyouPresentedTagsForChart>>([]);
  return (
    <>
      <SharedChartCarousel
        accessibilityLabel="难度卡片"
        cardWidth={cardWidth}
        contentContainerStyle={styles.carousel}
        empty={(
          <View style={styles.noCharts}>
            <Text style={styles.meta}>暂无可用难度</Text>
          </View>
        )}
        gap={CARD_GAP}
        initialIndex={initialIndex}
        items={charts}
        keyExtractor={(chart) => library.chartKey(song.id, PHIGROS_CHART_TYPE, chart.levelIndex)}
        renderItem={(chart, carouselState) => {
          const best = records
            .filter((record) => record.songId === song.id && record.levelIndex === chart.levelIndex)
            .sort((left, right) => (right.dxScore ?? 0) - (left.dxScore ?? 0))[0];
          return (
            <ChartCard
              carouselState={carouselState}
              chart={chart}
              best={best}
              song={song}
              library={library}
              width={cardWidth}
              notesPending={notesPending}
              kyouTags={phigrosKyouPresentedTagsForChart(kyouTagIndex, song.id, chart.levelIndex)}
              onShowAllKyouTags={setExpandedTags}
              downloadRunning={downloadRunning}
              onDownloadChart={onDownloadChart}
            />
          );
        }}
        rootStyle={styles.carouselRoot}
        scrollStyle={styles.carouselScroll}
        testID="phigros-chart-carousel"
      />
      <PhigrosKyouChartTagsSheet
        visible={expandedTags.length > 0}
        tags={expandedTags}
        onClose={() => setExpandedTags([])}
      />
    </>
  );
}

function ChartCard({
  carouselState,
  chart,
  best,
  song,
  library,
  width,
  notesPending,
  kyouTags,
  onShowAllKyouTags,
  downloadRunning,
  onDownloadChart,
}: {
  carouselState: ChartCarouselItemState;
  chart: Chart;
  best?: ScoreRecord;
  song: Song;
  library: LibraryHook;
  width: number;
  notesPending: boolean;
  kyouTags: ReturnType<typeof phigrosKyouPresentedTagsForChart>;
  onShowAllKyouTags: (tags: readonly PhigrosKyouResolvedTag[]) => void;
  downloadRunning: boolean;
  onDownloadChart: (chart: Chart) => void;
}) {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const navigation = useNavigation();
  const cancelPreviewNavigation = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPreviewNavigation.current?.(), []);
  const colors = phigrosLevelColors(chart.levelIndex);
  const label = phigrosLevelLabel(chart.levelIndex);
  const chartItem = library.data?.find((item) => item.key === library.chartKey(song.id, PHIGROS_CHART_TYPE, chart.levelIndex));
  const practice = chartItem?.kind === 'chart' && chartItem.practice;
  const levelNumber = Math.floor(chart.difficultyConstant);
  const score = best?.dxScore;
  const acc = best?.achievements;
  const rks = best?.rating;
  const accText = acc === undefined
    ? '—'
    : acc % 1 === 0 ? `${acc.toFixed(0)}%` : `${acc.toFixed(2)}%`;
  const rksText = rks === undefined
    ? '—'
    : formatPhigrosSongRks(rks);
  const isPhi = score === PHIGROS_MAX_SCORE;
  const isFc = !!best && best.fc === 'ap' && !isPhi;
  const noteTotal = chart.notes?.total;
  const xingKind = best
    ? resolvePhigrosXingKind(
      best.achievements,
      typeof noteTotal === 'number' ? noteTotal : undefined,
      best.fc === 'ap',
    )
    : null;

  return (
    <GameChartResultCard
      testID={`phigros-chart-card-${chart.levelIndex}`}
      accessibilityLabel={`${label} 难度卡片`}
      style={[
        styles.chartCard,
        {
          width,
          backgroundColor: theme.dark ? theme.surface : colors.bg,
          borderColor: colors.fg,
        },
      ]}
      summary={{
        difficulty: label, level: levelNumber, levelColor: colors.fg, constant: chart.difficultyConstant.toFixed(1),
        label: 'Score', value: score == null ? null : <PhigrosScoreValue score={score}
          variant={isPhi ? 'phi' : isFc ? 'fc' : 'normal'} textColor={theme.text}
          fontSize={styles.scoreValue.fontSize} lineHeight={styles.scoreValue.lineHeight} />,
        badges: (best || xingKind) && <>{best && <DetailRateBadge record={best} />}
          {xingKind && <PhigrosXingBadge kind={xingKind} />}</>,
        metrics: [{ label: 'Acc', text: accText }, { label: 'RKS', text: rksText }], charter: chart.charter || '未提供',
      }}>
      <PhigrosKyouChartTags tags={kyouTags} onShowAll={onShowAllKyouTags} />
      <NotesTable notes={asPhigrosNotes(chart.notes)} pending={notesPending} />
      <ChartAction label={practice ? '已加入练习清单' : '加入练习清单'}
        disabled={library.isUpdating}
        onPress={() => void library.setChartPractice(song.id, PHIGROS_CHART_TYPE, chart.levelIndex, !practice)}
        stack="first" style={practiceActionStyle(colors.fg, practice)}
        textStyle={practiceTextStyle(colors.fg, practice)} />
      <ChartAction label="查看谱面确认"
        accessibilityLabel={`查看谱面确认：${song.title} ${label}`}
        onPress={() => {
          cancelPreviewNavigation.current?.();
          cancelPreviewNavigation.current = openChartPreviewNavigation({
            game: 'phigros',
            songId: song.id,
            levelIndex: chart.levelIndex,
            title: song.title,
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
        stack="next" style={practiceActionStyle(colors.fg, false)}
        textStyle={practiceTextStyle(colors.fg, false)} />
      <ChartAction label="下载谱面文件"
        accessibilityLabel={`下载谱面文件：${song.title} ${label}`}
        accessibilityState={{ disabled: downloadRunning }}
        disabled={downloadRunning}
        onPress={() => onDownloadChart(chart)}
        stack="next" style={practiceActionStyle(colors.fg, false)}
        textStyle={practiceTextStyle(colors.fg, false)} />
      <LibraryTagEditor library={library} target={{ kind: 'chart', songId: song.id, type: PHIGROS_CHART_TYPE, levelIndex: chart.levelIndex }}
        {...carouselState.tagEditor} />
    </GameChartResultCard>
  );
}

const NOTE_COLUMNS: readonly { label: string; key: keyof PhigrosChartNotes }[] = [
  { label: 'TAP', key: 'tap' },
  { label: 'HOLD', key: 'hold' },
  { label: 'DRAG', key: 'drag' },
  { label: 'FLICK', key: 'flick' },
  { label: 'BLOCK', key: 'block' },
  { label: '总计', key: 'total' },
];

function asPhigrosNotes(notes: Chart['notes']): PhigrosChartNotes | undefined {
  if (!notes || !('drag' in notes)) return undefined;
  return notes;
}

function NotesTable({ notes, pending }: { notes?: PhigrosChartNotes; pending?: boolean }) {
  const theme = useAppTheme();
  if (!notes) {
    return (
      <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>
        {pending ? '加载物量中…' : '物量未提供'}
      </Text>
    );
  }
  const noteGroup = {
    key: 'notes',
    values: NOTE_COLUMNS.filter((column) => column.key !== 'block' || (notes.block ?? 0) > 0).map((column) => ({
      key: column.key,
      label: column.label,
      value: notes[column.key]!,
    })),
  };
  return (
    <GameNoteTable
      accessibilityLabel="谱面物量"
      group={noteGroup}
      mode="grid"
    />
  );
}

function practiceActionStyle(fg: string, filled: boolean) {
  return filled
    ? { backgroundColor: fg, borderColor: fg }
    : { backgroundColor: 'transparent', borderColor: fg };
}

function practiceTextStyle(fg: string, filled: boolean) {
  return { color: filled ? '#FFFFFF' : fg };
}

function DetailRateBadge({ record }: { record: ScoreRecord }) {
  return <PhigrosRateBadge rate={resolvePhigrosRate(record)} fc={record.fc === 'ap'} />;
}

const styles = PHIGROS_SONG_DETAIL_STYLES;
