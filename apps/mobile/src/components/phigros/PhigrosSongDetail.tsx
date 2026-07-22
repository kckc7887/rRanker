import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  InteractionManager,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  GestureHandlerRootView,
  ScrollView as GestureScrollView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { TagEditor } from '@/components/TagEditor';
import { PhigrosScoreValue } from './PhigrosScoreValue';
import { PhigrosRateBadge, resolvePhigrosRate } from './PhigrosRateBadge';
import { PhigrosXingBadge } from './PhigrosXingBadge';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import type { Chart, PhigrosChartNotes, ScoreRecord, Song } from '@/domain/models';
import { formatPhigrosSongRks, PHIGROS_MAX_SCORE } from '@/domain/phigros';
import { phigrosLevelColors, phigrosLevelLabel } from '@/domain/phigros-level-theme';
import { resolvePhigrosXingKind } from '@/domain/phigros-xing';
import { buildTagHistory } from '@/domain/user-library';
import { useGameData } from '@/hooks/use-game-data';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useAppTheme } from '@/theme/app-theme';

const PHIGROS_CHART_TYPE = 'SD' as const;

const DETAIL_SCORE_FONT_SIZE = 34;
const DETAIL_SCORE_LINE_HEIGHT = 40;

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
  const gameData = useGameData();
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

  const catalogSource = catalog.data?.snapshot.source;
  const scoreSource = useMemo(() => {
    const payload = gameData.data?.payload;
    if (payload?.kind === 'phigros') return payload.source;
    return undefined;
  }, [gameData.data?.payload]);

  const provider = catalog.data?.provider ?? null;
  const illustrationUrl = songId && provider ? provider.getIllustrationUrl(songId) : null;
  const blurUrl = songId && provider ? provider.getIllustrationBlurUrl(songId) : null;
  const lowresUrl = songId && provider ? provider.getIllustrationLowresUrl(songId) : null;
  const songItem = song ? library.data?.find((item) => item.key === library.songKey(song.id)) : undefined;
  const favorite = songItem?.kind === 'song' && songItem.favorite;
  const favoriteDisabled = library.isLoading || library.isUpdating;
  const onToggleFavorite = song ? () => void library.setSongFavorite(song.id, !favorite) : undefined;

  return <>
    <Stack.Screen options={{
      title: '', headerTransparent: true, headerShadowVisible: false, headerTintColor: '#FFFFFF',
      headerStyle: { backgroundColor: 'transparent' },
      headerBackground: () => null,
      headerShown: Platform.OS !== 'android',
      headerBackVisible: false, headerLeft: () => null, headerRight: () => null,
    }} />
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
            catalogSource={catalogSource}
            scoreSource={scoreSource}
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
      <PhigrosDetailChrome
        song={song}
        favorite={favorite}
        favoriteDisabled={favoriteDisabled}
        onToggleFavorite={onToggleFavorite}
      />
    </View>
  </>;
}

function PhigrosDetailChrome({
  song,
  favorite,
  favoriteDisabled,
  onToggleFavorite,
}: {
  song?: Song;
  favorite: boolean;
  favoriteDisabled: boolean;
  onToggleFavorite?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="返回"
      hitSlop={12}
      onPress={() => router.back()}
      style={({ pressed }) => [
        styles.headerButton,
        styles.headerFloatingButton,
        { top: insets.top, left: 8 },
        Platform.OS !== 'ios' && styles.headerButtonBg,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} color="#FFFFFF" size={28} />
    </Pressable>
    {song && onToggleFavorite ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={favorite ? `取消收藏 ${song.title}` : `收藏 ${song.title}`}
        disabled={favoriteDisabled}
        hitSlop={12}
        onPress={onToggleFavorite}
        style={({ pressed }) => [
          styles.headerButton,
          styles.headerFloatingButton,
          { top: insets.top, right: 8 },
          favorite && styles.headerFavoriteActive,
          Platform.OS !== 'ios' && styles.headerButtonBg,
          Platform.OS !== 'ios' && favorite && styles.headerFavoriteActiveBg,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={favorite ? '#A78BFA' : '#FFFFFF'} size={22} />
      </Pressable>
    ) : null}
  </>;
}

function Detail({
  song,
  records,
  catalogSource,
  scoreSource,
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
  catalogSource?: import('@/domain/models').DataSource;
  scoreSource?: import('@/domain/models').DataSource;
  illustrationUrl: string | null;
  blurUrl: string | null;
  lowresUrl: string | null;
  initialLevelIndex?: number;
  library: LibraryHook;
  catalogFetching: boolean;
  onEnsureLatestNoteCounts: () => void;
}) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const songItem = library.data?.find((item) => item.key === library.songKey(song.id));
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
    if (hasAnyNotes || triedNotesRefresh) return;
    setTriedNotesRefresh(true);
    onEnsureLatestNoteCounts();
  }, [hasAnyNotes, triedNotesRefresh, onEnsureLatestNoteCounts]);
  const notesPending = !hasAnyNotes && (!triedNotesRefresh || catalogFetching);
  const defaultIndex = Math.max(0, sortedCharts.findIndex((c) => c.levelIndex === IN_LEVEL_INDEX));
  const requestedIndex = initialLevelIndex === undefined
    ? -1
    : sortedCharts.findIndex((c) => c.levelIndex === initialLevelIndex);
  const initialIndex = requestedIndex >= 0 ? requestedIndex : defaultIndex;
  const cardWidth = Math.max(280, width - 40);
  const [deferredReady, setDeferredReady] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverStage, setCoverStage] = useState<'full' | 'lowres' | 'blur'>('full');

  useEffect(() => {
    setDeferredReady(false);
    setCoverFailed(false);
    setCoverStage('full');
    const task = InteractionManager.runAfterInteractions(() => setDeferredReady(true));
    return () => task.cancel();
  }, [song.id]);

  const coverSource = coverStage === 'full'
    ? illustrationUrl
    : coverStage === 'lowres'
      ? lowresUrl
      : blurUrl;

  return (
    <ScrollView testID="phigros-song-detail-scroll" contentContainerStyle={styles.content}>
      <View style={[styles.hero, { width, height: width }]}>
        {coverFailed || !coverSource ? (
          <View style={[styles.heroPlaceholder, { backgroundColor: theme.input }]}>
            <Text style={styles.heroPlaceholderNote}>♪</Text>
          </View>
        ) : (
          <Image
            accessibilityLabel="曲绘"
            cachePolicy="disk"
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
            style={StyleSheet.absoluteFillObject}
            transition={120}
          />
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.40)']}
          locations={[0, 1]}
          style={styles.heroShade}
        />
        <View style={styles.heroCopy}>
          <Text numberOfLines={1} style={styles.songId}>#{song.id}</Text>
          <AutoScrollText
            testID="phigros-song-title-scroll"
            text={song.title}
            textStyle={styles.title}
            style={styles.singleLine}
            contentContainerStyle={styles.singleLineContent}
          />
          <Text numberOfLines={1} style={styles.artist}>{song.artist ?? '曲师未知'}</Text>
        </View>
      </View>

      <View
        style={[styles.metadataTable, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
        accessibilityLabel="歌曲详情数据"
      >
        <MetadataCell label="曲绘师" value={song.illustrator ?? '未知'} flex={1} />
        <MetadataCell label="版本" value={song.version || '未知'} flex={1} />
      </View>

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
        />
        <View style={styles.details}>
          <SourceStatus items={[
            {
              key: 'catalog',
              label: catalogSource?.label ?? '曲库未加载',
              updatedAt: catalogSource?.updatedAt,
              state: !catalogSource ? 'unavailable' : catalogSource.isStale ? 'cache' : 'live',
            },
            {
              key: 'scores',
              label: scoreSource?.label ?? '成绩未绑定',
              updatedAt: scoreSource?.updatedAt,
              state: !scoreSource ? 'unavailable' : scoreSource.isStale ? 'cache' : 'live',
            },
          ]} />
          <Card>
            <TagEditor
              tags={songItem?.kind === 'song' ? songItem.tags : []}
              presets={library.tagPresets ?? []}
              historyTags={buildTagHistory(library.data ?? [], library.songKey(song.id), library.tagPresets ?? [])}
              disabled={library.isUpdating}
              onPresetsChange={library.setTagPresets}
              onChange={(tags) => library.setTags({ kind: 'song', songId: song.id }, tags)}
            />
          </Card>
        </View>
      </> : <View testID="phigros-song-detail-deferred-placeholder" style={styles.deferredPlaceholder} />}
    </ScrollView>
  );
}

function MetadataCell({ label, value, flex }: { label: string; value: string; flex: number }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.metadataCell, { flex }]}>
      <Text numberOfLines={1} style={[styles.metadataLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.metadataValue, { color: theme.text }]}>{value}</Text>
    </View>
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
}: {
  charts: Chart[];
  records: ScoreRecord[];
  song: Song;
  library: LibraryHook;
  cardWidth: number;
  initialIndex: number;
  notesPending: boolean;
}) {
  const interval = cardWidth + CARD_GAP;
  const scrollRef = useRef<ComponentRef<typeof GestureScrollView>>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * interval, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [initialIndex, interval]);

  if (charts.length === 0) {
    return (
      <View style={styles.noCharts}>
        <Text style={styles.meta}>暂无可用难度</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.carouselRoot}>
      <GestureScrollView
        ref={scrollRef}
        horizontal
        decelerationRate="fast"
        snapToInterval={interval}
        snapToAlignment="start"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        nestedScrollEnabled
        removeClippedSubviews={false}
        style={styles.carouselScroll}
        contentOffset={{ x: initialIndex * interval, y: 0 }}
        contentContainerStyle={styles.carousel}
        accessibilityLabel="难度卡片"
        testID="phigros-chart-carousel"
      >
        {charts.map((chart) => {
          const best = records
            .filter((record) => record.songId === song.id && record.levelIndex === chart.levelIndex)
            .sort((left, right) => (right.dxScore ?? 0) - (left.dxScore ?? 0))[0];
          return (
            <ChartCard
              key={`${chart.songId}:${chart.levelIndex}`}
              chart={chart}
              best={best}
              song={song}
              library={library}
              width={cardWidth}
              notesPending={notesPending}
            />
          );
        })}
      </GestureScrollView>
    </GestureHandlerRootView>
  );
}

function ChartCard({
  chart,
  best,
  song,
  library,
  width,
  notesPending,
}: {
  chart: Chart;
  best?: ScoreRecord;
  song: Song;
  library: LibraryHook;
  width: number;
  notesPending: boolean;
}) {
  const theme = useAppTheme();
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
    <View
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
    >
      <View style={styles.chartHeader}>
        <View style={[styles.diffPill, { backgroundColor: colors.fg }]}>
          <Text style={styles.diffPillText}>{label}</Text>
        </View>
        <View style={styles.levelBlock}>
          <Text style={[styles.level, { color: colors.fg }]}>{levelNumber}</Text>
          <Text style={[styles.constant, { color: theme.textMuted }]}>
            {chart.difficultyConstant.toFixed(1)}
          </Text>
        </View>
      </View>

      <View style={styles.resultBlock}>
        <Text style={[styles.resultLabel, { color: theme.textMuted }]}>Score</Text>
        {score == null ? (
          <Text
            accessibilityLabel="未游玩"
            style={[styles.scoreValue, { color: theme.text }]}
          >
            —
          </Text>
        ) : (
          <PhigrosScoreValue
            score={score}
            variant={isPhi ? 'phi' : isFc ? 'fc' : 'normal'}
            textColor={theme.text}
            fontSize={DETAIL_SCORE_FONT_SIZE}
            lineHeight={DETAIL_SCORE_LINE_HEIGHT}
          />
        )}
        {best || xingKind ? (
          <View style={styles.badgeRow}>
            {best ? <DetailRateBadge record={best} /> : null}
            {xingKind ? <PhigrosXingBadge kind={xingKind} /> : null}
          </View>
        ) : null}
      </View>

      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={[styles.resultLabel, { color: theme.textMuted }]}>Acc</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{accText}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={[styles.resultLabel, { color: theme.textMuted }]}>RKS</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{rksText}</Text>
        </View>
      </View>

      <View style={[styles.chartDivider, { backgroundColor: theme.border }]} />
      <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>
        谱师：{chart.charter || '未提供'}
      </Text>
      <NotesTable notes={asPhigrosNotes(chart.notes)} pending={notesPending} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={practice ? '已加入练习清单' : '加入练习清单'}
        disabled={library.isUpdating}
        onPress={() => void library.setChartPractice(song.id, PHIGROS_CHART_TYPE, chart.levelIndex, !practice)}
        style={[
          styles.action,
          practiceActionStyle(colors.fg, practice),
        ]}
      >
        <Text style={[styles.actionText, practiceTextStyle(colors.fg, practice)]}>
          {practice ? '已加入练习清单' : '加入练习清单'}
        </Text>
      </Pressable>
      <TagEditor
        tags={chartItem?.tags ?? []}
        presets={library.tagPresets ?? []}
        historyTags={buildTagHistory(
          library.data ?? [],
          library.chartKey(song.id, PHIGROS_CHART_TYPE, chart.levelIndex),
          library.tagPresets ?? [],
        )}
        disabled={library.isUpdating}
        onPresetsChange={library.setTagPresets}
        onChange={(tags) => library.setTags({
          kind: 'chart',
          songId: song.id,
          type: PHIGROS_CHART_TYPE,
          levelIndex: chart.levelIndex,
        }, tags)}
      />
    </View>
  );
}

const NOTE_COLUMNS: readonly { label: string; key: keyof PhigrosChartNotes }[] = [
  { label: 'TAP', key: 'tap' },
  { label: 'HOLD', key: 'hold' },
  { label: 'DRAG', key: 'drag' },
  { label: 'FLICK', key: 'flick' },
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
  return (
    <View
      accessibilityLabel="谱面物量"
      style={[styles.notesTable, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}
    >
      <View style={[styles.notesRow, styles.notesHeaderRow]}>
        {NOTE_COLUMNS.map((column) => (
          <Text
            key={column.key}
            numberOfLines={1}
            style={[styles.notesCell, styles.notesHeader, { color: theme.textMuted }]}
          >
            {column.label}
          </Text>
        ))}
      </View>
      <View style={styles.notesRow}>
        {NOTE_COLUMNS.map((column) => (
          <Text
            key={column.key}
            numberOfLines={1}
            style={[styles.notesCell, styles.notesValue, { color: theme.text }]}
          >
            {notes[column.key]}
          </Text>
        ))}
      </View>
    </View>
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

function AutoScrollText({
  text,
  textStyle,
  style,
  contentContainerStyle,
  testID,
}: {
  text: string;
  textStyle: object;
  style?: object;
  contentContainerStyle?: object;
  testID?: string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const offsetRef = useRef(0);
  const directionRef = useRef(1);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    offsetRef.current = 0;
    directionRef.current = 1;
    setScrolling(false);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [text]);

  useEffect(() => {
    if (contentWidth <= 0 || containerWidth <= 0) return;
    const overflow = contentWidth - containerWidth;
    setScrolling((current) => {
      if (current) return overflow > 2;
      return overflow > 8;
    });
  }, [contentWidth, containerWidth]);

  useEffect(() => {
    if (!scrolling || dragging) {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      return;
    }
    const maxOffset = Math.max(0, contentWidth - containerWidth);
    const tick = () => {
      const next = offsetRef.current + directionRef.current * 0.45;
      if (next >= maxOffset) directionRef.current = -1;
      else if (next <= 0) directionRef.current = 1;
      offsetRef.current = Math.max(0, Math.min(next, maxOffset));
      scrollRef.current?.scrollTo({ x: offsetRef.current, animated: false });
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [scrolling, dragging, contentWidth, containerWidth]);

  return <ScrollView
    ref={scrollRef}
    testID={testID}
    horizontal
    showsHorizontalScrollIndicator={false}
    style={style}
    contentContainerStyle={contentContainerStyle}
    scrollEnabled={scrolling}
    onContentSizeChange={(width) => setContentWidth(width)}
    onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    onScrollBeginDrag={() => setDragging(true)}
    onScrollEndDrag={(event) => {
      offsetRef.current = event.nativeEvent.contentOffset.x;
      setDragging(false);
      directionRef.current = 1;
    }}
    scrollEventThrottle={32}
  >
    <Text numberOfLines={1} style={textStyle}>{text}</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingBottom: 48 },
  deferredPlaceholder: { minHeight: 180 },
  hero: { position: 'relative', backgroundColor: '#D9DEE7', overflow: 'hidden' },
  heroPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  heroPlaceholderNote: { color: '#6B7280', fontSize: 64 },
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%' },
  heroCopy: { position: 'absolute', left: 18, right: 18, bottom: 20, gap: 2 },
  singleLine: { flexGrow: 0 },
  singleLineContent: { paddingRight: 18 },
  songId: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  title: {
    color: '#FFFFFF', fontSize: 30, lineHeight: 37, fontWeight: '900', letterSpacing: -0.6,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8,
  },
  artist: { color: 'rgba(255,255,255,0.9)', fontSize: 16, lineHeight: 23, fontWeight: '600' },
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerFloatingButton: { position: 'absolute', zIndex: 30, elevation: 30 },
  headerButtonBg: { backgroundColor: 'rgba(17,24,39,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  headerFavoriteActive: {},
  headerFavoriteActiveBg: { backgroundColor: 'rgba(141,91,214,0.88)' },
  metadataTable: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 13, gap: 6,
  },
  metadataCell: { minWidth: 0, paddingHorizontal: 6, gap: 5 },
  metadataLabel: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
  metadataValue: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  carouselRoot: { flexGrow: 0 },
  carouselScroll: { flexGrow: 0 },
  carousel: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12, gap: CARD_GAP },
  noCharts: { padding: 20 },
  chartCard: {
    borderRadius: 24, borderWidth: 1, padding: 18,
    shadowColor: '#1A2232', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  diffPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diffPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
    includeFontPadding: false,
  },
  levelBlock: { alignItems: 'flex-end' },
  level: { fontSize: 28, lineHeight: 31, fontWeight: '900' },
  constant: { fontSize: 11, fontWeight: '600' },
  resultBlock: { marginTop: 22, alignItems: 'flex-start', gap: 6 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  resultLabel: { fontSize: 12, fontWeight: '700' },
  scoreValue: {
    fontSize: DETAIL_SCORE_FONT_SIZE,
    lineHeight: DETAIL_SCORE_LINE_HEIGHT,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  statRow: { flexDirection: 'row', marginTop: 16, gap: 24 },
  statCell: { gap: 2 },
  statValue: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  chartDivider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  chartMeta: { fontSize: 12, lineHeight: 18 },
  notesTable: {
    marginTop: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(76,88,106,0.28)',
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  notesRow: { minHeight: 26, flexDirection: 'row', alignItems: 'center' },
  notesHeaderRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(76,88,106,0.22)',
  },
  notesCell: { flex: 1, minWidth: 0, textAlign: 'center' },
  notesHeader: { fontSize: 8, fontWeight: '800' },
  notesValue: { fontSize: 10, fontWeight: '800' },
  action: {
    marginTop: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: 11,
    padding: 10,
    alignItems: 'center',
  },
  actionText: { fontWeight: '700' },
  details: { paddingHorizontal: 16, gap: 12, marginTop: 4 },
  meta: { color: '#6B7280', fontSize: 12 },
});
