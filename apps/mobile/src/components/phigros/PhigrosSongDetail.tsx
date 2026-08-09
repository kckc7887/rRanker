import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { AutoScrollText } from '@/components/game-content/AutoScrollText';
import { ChartCarousel as SharedChartCarousel } from '@/components/game-content/ChartCarousel';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { SongMetadataTable, type SongMetadataItem } from '@/components/game-content/SongMetadataTable';
import { useSongDetailBackNavigation } from '@/components/game-content/SongDetailNavigation';
import { TagEditor } from '@/components/TagEditor';
import { PhigrosKyouChartTags, PhigrosKyouChartTagsSheet } from './PhigrosKyouChartTags';
import { PhigrosScoreValue } from './PhigrosScoreValue';
import { PhigrosRateBadge, resolvePhigrosRate } from './PhigrosRateBadge';
import { PhigrosXingBadge } from './PhigrosXingBadge';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
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
import { buildTagHistory } from '@/domain/user-library';
import { useGameData } from '@/hooks/use-game-data';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { usePhigrosKyouChartTags } from '@/hooks/use-phigros-kyou';
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
  const kyouChartTags = usePhigrosKyouChartTags();
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
            catalogSource={catalogSource}
            scoreSource={scoreSource}
            kyouTagSource={kyouChartTags.data?.source}
            kyouTagsUnavailable={kyouChartTags.isError}
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
  const navigateBack = useSongDetailBackNavigation();
  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="返回"
      hitSlop={12}
      onPress={navigateBack}
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
  kyouTagSource,
  kyouTagsUnavailable,
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
  catalogSource?: import('@/domain/models').DataSource;
  scoreSource?: import('@/domain/models').DataSource;
  kyouTagSource?: import('@/domain/models').DataSource;
  kyouTagsUnavailable: boolean;
  kyouTagIndex: PhigrosKyouChartTagIndex;
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
  const metadataItems: SongMetadataItem[] = [
    { key: 'illustrator', label: '曲绘师', value: song.illustrator ?? '未知', flex: 1 },
    ...(song.version ? [{ key: 'chapter', label: '章节', value: song.version, flex: 1 }] : []),
  ];

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

      <SongMetadataTable
        accessibilityLabel="歌曲详情数据"
        cellStyle={styles.metadataCell}
        items={metadataItems}
        labelStyle={styles.metadataLabel}
        measureStyle={styles.metadataValueMeasure}
        style={styles.metadataTable}
        testIDPrefix="phigros-metadata"
        valueBlockStyle={styles.metadataValueBlock}
        valueStyle={styles.metadataValue}
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
            ...(kyouTagSource ? [{
              key: 'phigros-kyou-tags' as const,
              label: kyouTagSource.label,
              updatedAt: kyouTagSource.updatedAt,
              state: kyouTagSource.isStale ? 'cache' as const : 'live' as const,
            }] : kyouTagsUnavailable ? [{
              key: 'phigros-kyou-tags' as const,
              label: 'Kyou 谱面标签不可用',
              state: 'unavailable' as const,
            }] : []),
          ]} />
          <Card>
            <PhigrosSongInformation aliases={song.aliases ?? []} />
          </Card>
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

function ChartCarousel({
  charts,
  records,
  song,
  library,
  cardWidth,
  initialIndex,
  notesPending,
  kyouTagIndex,
}: {
  charts: Chart[];
  records: ScoreRecord[];
  song: Song;
  library: LibraryHook;
  cardWidth: number;
  initialIndex: number;
  notesPending: boolean;
  kyouTagIndex: PhigrosKyouChartTagIndex;
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
        keyExtractor={(chart) => `${chart.songId}:${chart.levelIndex}`}
        renderItem={(chart) => {
          const best = records
            .filter((record) => record.songId === song.id && record.levelIndex === chart.levelIndex)
            .sort((left, right) => (right.dxScore ?? 0) - (left.dxScore ?? 0))[0];
          return (
            <ChartCard
              chart={chart}
              best={best}
              song={song}
              library={library}
              width={cardWidth}
              notesPending={notesPending}
              kyouTags={phigrosKyouPresentedTagsForChart(kyouTagIndex, song.id, chart.levelIndex)}
              onShowAllKyouTags={setExpandedTags}
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
  chart,
  best,
  song,
  library,
  width,
  notesPending,
  kyouTags,
  onShowAllKyouTags,
}: {
  chart: Chart;
  best?: ScoreRecord;
  song: Song;
  library: LibraryHook;
  width: number;
  notesPending: boolean;
  kyouTags: ReturnType<typeof phigrosKyouPresentedTagsForChart>;
  onShowAllKyouTags: (tags: readonly PhigrosKyouResolvedTag[]) => void;
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
      <PhigrosKyouChartTags tags={kyouTags} onShowAll={onShowAllKyouTags} />
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
    </GameChartResultCard>
  );
}

function PhigrosSongInformation({ aliases }: { aliases: readonly string[] }) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const aliasText = `别名：${aliases.join('、') || '无'}`;
  useEffect(() => {
    setExpanded(false);
    setOverflow(false);
  }, [aliasText]);
  return (
    <View style={styles.songInformation}>
      <Text style={[styles.informationTitle, { color: theme.text }]}>歌曲信息</Text>
      <View style={styles.aliasBlock}>
        <Text
          accessible={false}
          onTextLayout={(event) => setOverflow(event.nativeEvent.lines.length > 1)}
          style={[styles.informationValue, styles.aliasMeasure, { color: theme.text }]}
          testID="phigros-alias-overflow-measure"
        >
          {aliasText}
        </Text>
        <Text
          numberOfLines={expanded ? undefined : 1}
          style={[styles.informationValue, { color: theme.text }]}
          testID="phigros-alias-text"
        >
          {aliasText}
        </Text>
        {overflow ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? '收起别名' : '展开别名'}
            hitSlop={6}
            onPress={() => setExpanded((value) => !value)}
            style={styles.aliasAction}
          >
            <Text style={[styles.aliasActionText, { color: theme.accent }]}>{expanded ? '收起' : '展开'}</Text>
          </Pressable>
        ) : null}
      </View>
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
  const noteGroup = {
    key: 'notes',
    values: NOTE_COLUMNS.map((column) => ({
      key: column.key,
      label: column.label,
      value: notes[column.key],
    })),
  };
  return (
    <GameNoteTable
      accessibilityLabel="谱面物量"
      containerStyle={[styles.notesTable, {
        backgroundColor: theme.surfaceMuted,
        borderColor: theme.border,
      }]}
      group={noteGroup}
      headerRowStyle={styles.notesHeaderRow}
      headerTextStyle={[styles.notesCell, styles.notesHeader, { color: theme.textMuted }]}
      mode="grid"
      rowStyle={styles.notesRow}
      valueTextStyle={[styles.notesCell, styles.notesValue, { color: theme.text }]}
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
  metadataValueBlock: { position: 'relative', minWidth: 0 },
  metadataValueMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 },
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
  songInformation: { gap: 12 },
  informationTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  informationValue: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19 },
  aliasBlock: { position: 'relative', alignItems: 'stretch' },
  aliasMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 },
  aliasAction: { alignSelf: 'flex-end', paddingHorizontal: 2, paddingVertical: 3 },
  aliasActionText: { fontSize: 12, fontWeight: '700' },
  meta: { color: '#6B7280', fontSize: 12 },
});
