import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Linking,
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
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import { TagEditor } from '@/components/TagEditor';
import {
  CHUNITHM_DIFFICULTY_LABELS,
  type ChunithmDifficulty,
  type ChunithmSong,
} from '@/domain/chunithm';
import type { ChunithmScore } from '@/domain/chunithm-personal';
import {
  buildTagHistory,
} from '@/domain/user-library';
import {
  chunithmRankFromScore,
  chunithmRankUsesGradient,
  formatChunithmRating,
  formatChunithmScore,
  formatChunithmWorldsEndLabel,
} from '@/domain/chunithm-score-presentation';
import { ProviderError } from '@/providers/errors';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useChunithmSongDetail } from '@/hooks/use-chunithm-song-detail';
import { useGameData } from '@/hooks/use-game-data';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useAppTheme } from '@/theme/app-theme';
import { ChunithmDifficultyBadge } from './ChunithmDifficultyBadge';
import { ChunithmGradientScore } from './ChunithmScoreCard';
import { chunithmJacketUrl } from './ChunithmSongRow';

const CARD_GAP = 12;
const CHUNITHM_CHART_TYPE = 'SD' as const;

type LibraryHook = ReturnType<typeof useUserLibrary>;

function mergeSong(
  catalogSong: ChunithmSong | undefined,
  detailSong: ChunithmSong | undefined,
): ChunithmSong | undefined {
  if (!detailSong) return catalogSong;
  if (!catalogSong) return detailSong;
  const catalogDifficulties = new Map(
    catalogSong.difficulties.map((difficulty) => [difficulty.difficulty, difficulty] as const),
  );
  return {
    ...catalogSong,
    ...detailSong,
    versionId: catalogSong.versionId,
    versionTitle: catalogSong.versionTitle,
    difficulties: detailSong.difficulties.map((difficulty) => {
      const catalogDifficulty = catalogDifficulties.get(difficulty.difficulty);
      return {
        ...catalogDifficulty,
        ...difficulty,
        versionId: catalogDifficulty?.versionId ?? difficulty.versionId,
        versionTitle: catalogDifficulty?.versionTitle ?? difficulty.versionTitle,
      };
    }),
  };
}

function bestScoreForDifficulty(
  scores: readonly ChunithmScore[],
  songId: number,
  difficulty: number,
): ChunithmScore | undefined {
  return scores
    .filter((score) => String(score.id) === String(songId) && score.level_index === difficulty)
    .sort((left, right) => right.score - left.score || (right.rating ?? 0) - (left.rating ?? 0))[0];
}

export function ChunithmSongDetail({
  songId,
  initialLevelIndex,
}: {
  songId?: string;
  initialLevelIndex?: number;
}) {
  const theme = useAppTheme();
  const catalog = useChunithmCatalog();
  const detail = useChunithmSongDetail(songId);
  const gameData = useGameData();
  const library = useUserLibrary();
  const catalogSong = useMemo(
    () => catalog.data?.songs.find((song) => String(song.id) === songId),
    [catalog.data?.songs, songId],
  );
  const song = useMemo(
    () => mergeSong(catalogSong, detail.data?.song),
    [catalogSong, detail.data?.song],
  );
  const payload = gameData.data?.payload.kind === 'chunithm'
    ? gameData.data.payload
    : undefined;
  const songItem = song
    ? library.data?.find((item) => item.key === library.songKey(String(song.id)))
    : undefined;
  const favorite = songItem?.kind === 'song' && songItem.favorite;
  const favoriteDisabled = library.isLoading || library.isUpdating;
  const isNoData = detail.error instanceof ProviderError && detail.error.code === 'no_data';
  const isLoading = !song && (catalog.isLoading || detail.isLoading);
  const isError = !song && detail.isError && !isNoData;
  const isEmpty = !song && !isLoading && (isNoData || !!catalog.data);
  const retry = () => {
    void Promise.all([catalog.refetch(), detail.refetch()]);
  };

  return (
    <>
      <Stack.Screen options={{
        title: '',
        headerTransparent: true,
        headerShadowVisible: false,
        headerTintColor: '#FFFFFF',
        headerStyle: { backgroundColor: 'transparent' },
        headerBackground: () => null,
        headerShown: Platform.OS !== 'android',
        headerBackVisible: false,
        headerLeft: () => null,
        headerRight: () => null,
      }} />
      <StatusBar style="light" />
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <QueryStateView<ChunithmSong>
          data={song}
          emptyText="找不到这首歌曲"
          error={detail.error ?? catalog.error}
          isEmpty={isEmpty}
          isError={isError}
          isLoading={isLoading}
          onRetry={retry}
          renderData={(item) => (
            <ChunithmDetailBody
              catalogSource={catalog.data?.source}
              detailError={detail.isError}
              detailSource={detail.data?.source}
              initialLevelIndex={initialLevelIndex}
              library={library}
              onRetryDetail={() => void detail.refetch()}
              scores={payload?.scores ?? []}
              scoreSource={payload?.hasSyncedData ? payload.source : undefined}
              song={item}
            />
          )}
        />
        <DetailChrome
          favorite={favorite}
          favoriteDisabled={favoriteDisabled}
          onToggleFavorite={song
            ? () => void library.setSongFavorite(String(song.id), !favorite)
            : undefined}
          song={song}
        />
      </View>
    </>
  );
}

function DetailChrome({
  song,
  favorite,
  favoriteDisabled,
  onToggleFavorite,
}: {
  song?: ChunithmSong;
  favorite: boolean;
  favoriteDisabled: boolean;
  onToggleFavorite?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <Pressable
        accessibilityLabel="返回"
        accessibilityRole="button"
        hitSlop={12}
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.headerButton,
          { top: insets.top, left: 8 },
          Platform.OS !== 'ios' && styles.headerButtonBg,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          color="#FFFFFF"
          name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
          size={28}
        />
      </Pressable>
      {song && onToggleFavorite ? (
        <Pressable
          accessibilityLabel={favorite ? `取消收藏 ${song.title}` : `收藏 ${song.title}`}
          accessibilityRole="button"
          disabled={favoriteDisabled}
          hitSlop={12}
          onPress={onToggleFavorite}
          style={({ pressed }) => [
            styles.headerButton,
            { top: insets.top, right: 8 },
            Platform.OS !== 'ios' && styles.headerButtonBg,
            favorite && styles.headerFavorite,
            pressed && styles.pressed,
            favoriteDisabled && styles.disabled,
          ]}
        >
          <Ionicons
            color={favorite ? '#A78BFA' : '#FFFFFF'}
            name={favorite ? 'heart' : 'heart-outline'}
            size={22}
          />
        </Pressable>
      ) : null}
    </>
  );
}

function ChunithmDetailBody({
  song,
  scores,
  library,
  initialLevelIndex,
  catalogSource,
  detailSource,
  scoreSource,
  detailError,
  onRetryDetail,
}: {
  song: ChunithmSong;
  scores: readonly ChunithmScore[];
  library: LibraryHook;
  initialLevelIndex?: number;
  catalogSource?: import('@/domain/models').DataSource;
  detailSource?: import('@/domain/models').DataSource;
  scoreSource?: import('@/domain/models').DataSource;
  detailError: boolean;
  onRetryDetail: () => void;
}) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(280, width - 40);
  const difficulties = useMemo(
    () => [...song.difficulties].sort((left, right) => right.difficulty - left.difficulty),
    [song.difficulties],
  );
  const requestedIndex = initialLevelIndex === undefined
    ? -1
    : difficulties.findIndex((difficulty) => difficulty.difficulty === initialLevelIndex);
  const masterIndex = difficulties.findIndex((difficulty) => difficulty.difficulty === 3);
  const initialIndex = requestedIndex >= 0 ? requestedIndex : masterIndex >= 0 ? masterIndex : 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="chunithm-song-detail-scroll"
    >
      <Hero song={song} width={width} />
      <View
        accessibilityLabel="中二歌曲详情数据"
        style={[styles.metadataTable, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
      >
        <MetadataCell label="分类" value={song.genre || '未提供'} />
        <MetadataCell label="BPM" value={song.bpm ? String(song.bpm) : '未提供'} />
        <MetadataCell label="版本" value={song.versionTitle || '未提供'} />
        <MetadataCell label="地图" value={song.map || '未提供'} />
      </View>

      <DifficultyCarousel
        cardWidth={cardWidth}
        detailError={detailError}
        difficulties={difficulties}
        initialIndex={initialIndex}
        library={library}
        onRetryDetail={onRetryDetail}
        scores={scores}
        song={song}
      />

      <View style={styles.details}>
        <SourceStatus items={[
          {
            key: 'catalog',
            label: catalogSource?.label ?? 'LXNS 中二节奏公共曲库暂不可用',
            updatedAt: catalogSource?.updatedAt,
            state: !catalogSource ? 'unavailable' : catalogSource.isStale ? 'cache' : 'live',
          },
          {
            key: 'detail',
            label: detailSource?.label ?? (detailError
              ? 'LXNS 中二节奏单曲详情暂不可用'
              : 'LXNS 中二节奏单曲详情加载中'),
            updatedAt: detailSource?.updatedAt,
            state: !detailSource ? 'unavailable' : detailSource.isStale ? 'cache' : 'live',
          },
          {
            key: 'scores',
            label: scoreSource?.label ?? '中二个人成绩未同步',
            updatedAt: scoreSource?.updatedAt,
            state: !scoreSource ? 'unavailable' : scoreSource.isStale ? 'cache' : 'live',
          },
        ]} />
        <Card style={styles.copyrightCard}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>歌曲与版权信息</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            版权：{song.rights || '未提供'}
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            曲目数据与曲绘资源由 LXNS 公共服务提供。
          </Text>
          <Text style={[styles.footerNote, { color: theme.textMuted }]}>
            游戏、歌曲及相关素材版权归 SEGA、曲目作者与各自权利人所有。
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}

function Hero({ song, width }: { song: ChunithmSong; width: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [song.id]);
  return (
    <View style={[styles.hero, { width, height: width }]}>
      {failed ? (
        <View style={styles.heroPlaceholder}><Text style={styles.heroPlaceholderText}>♪</Text></View>
      ) : (
        <Image
          accessibilityLabel={`歌曲封面 ${song.title}`}
          cachePolicy="disk"
          contentFit="cover"
          onError={() => setFailed(true)}
          source={chunithmJacketUrl(song)}
          style={StyleSheet.absoluteFill}
          transition={120}
        />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.48)']}
        locations={[0, 1]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroCopy}>
        <Text numberOfLines={1} style={styles.songId}>#{song.id}</Text>
        <Text numberOfLines={1} style={styles.songTitle}>{song.title}</Text>
        <Text numberOfLines={1} style={styles.artist}>{song.artist ?? '艺术家未知'}</Text>
      </View>
    </View>
  );
}

function MetadataCell({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();
  return (
    <View style={styles.metadataCell}>
      <Text numberOfLines={1} style={[styles.metadataLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.metadataValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function DifficultyCarousel({
  difficulties,
  song,
  scores,
  library,
  cardWidth,
  initialIndex,
  detailError,
  onRetryDetail,
}: {
  difficulties: ChunithmDifficulty[];
  song: ChunithmSong;
  scores: readonly ChunithmScore[];
  library: LibraryHook;
  cardWidth: number;
  initialIndex: number;
  detailError: boolean;
  onRetryDetail: () => void;
}) {
  const interval = cardWidth + CARD_GAP;
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * interval, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [initialIndex, interval, song.id]);
  if (!difficulties.length) {
    return <View style={styles.noCharts}><Text style={styles.body}>暂无可用难度</Text></View>;
  }
  return (
    <ScrollView
      accessibilityLabel="中二难度卡片"
      contentContainerStyle={styles.carousel}
      contentOffset={{ x: initialIndex * interval, y: 0 }}
      decelerationRate="fast"
      disableIntervalMomentum
      directionalLockEnabled
      horizontal
      ref={scrollRef}
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={interval}
      style={styles.carouselScroll}
    >
      {difficulties.map((difficulty) => (
        <DifficultyCard
          detailError={detailError}
          difficulty={difficulty}
          key={difficulty.difficulty}
          library={library}
          onRetryDetail={onRetryDetail}
          score={bestScoreForDifficulty(scores, song.id, difficulty.difficulty)}
          song={song}
          width={cardWidth}
        />
      ))}
    </ScrollView>
  );
}

function ScoreValue({ score }: { score?: ChunithmScore }) {
  const theme = useAppTheme();
  if (!score) return <Text style={[styles.score, { color: theme.textMuted }]}>—</Text>;
  const rank = chunithmRankFromScore(score.score);
  const text = formatChunithmScore(score.score);
  if (chunithmRankUsesGradient(rank)) {
    return (
      <ChunithmGradientScore
        flowing={rank === 'SSS+'}
        height={42}
        text={text}
        textStyle={styles.score}
      />
    );
  }
  return <Text style={[styles.score, { color: theme.text }]}>{text}</Text>;
}

function formatOptionalValue(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(2);
}

function DifficultyCard({
  difficulty,
  song,
  score,
  library,
  width,
  detailError,
  onRetryDetail,
}: {
  difficulty: ChunithmDifficulty;
  song: ChunithmSong;
  score?: ChunithmScore;
  library: LibraryHook;
  width: number;
  detailError: boolean;
  onRetryDetail: () => void;
}) {
  const theme = useAppTheme();
  const worldsEnd = difficulty.difficulty === 5;
  const worldsEndLabel = worldsEnd
    ? formatChunithmWorldsEndLabel({ kanji: difficulty.kanji, star: difficulty.star })
    : undefined;
  const chartKey = library.chartKey(song.id, CHUNITHM_CHART_TYPE, difficulty.difficulty);
  const chartItem = library.data?.find((item) => item.key === chartKey);
  const practice = chartItem?.kind === 'chart' && chartItem.practice;
  const difficultyName = CHUNITHM_DIFFICULTY_LABELS[difficulty.difficulty];
  const searchQuery = `中二节奏 ${song.title} ${difficultyName} 谱面确认`;
  return (
    <View
      style={[styles.difficultyCard, { width, backgroundColor: theme.surface, borderColor: theme.border }]}
      testID={`chunithm-detail-difficulty-${difficulty.difficulty}`}
    >
      <View style={styles.chartHeader}>
        <ChunithmDifficultyBadge
          display="label"
          level={difficulty.level}
          levelIndex={difficulty.difficulty}
          worldsEndLabel={worldsEndLabel}
        />
        <View style={styles.levelBlock}>
          <Text style={[styles.level, { color: theme.text }]}>
            {worldsEnd ? worldsEndLabel : difficulty.level}
          </Text>
          <Text style={[styles.constant, { color: theme.textMuted }]}>
            定数 {worldsEnd ? '—' : difficulty.levelValue.toFixed(1)}
          </Text>
        </View>
      </View>
      <ScoreValue score={score} />
      <View style={styles.scoreMetaRow}>
        <Text style={[styles.scoreMeta, { color: theme.textSecondary }]}>
          Rating <Text style={[styles.scoreMetaValue, { color: theme.text }]}>
            {formatChunithmRating(score?.rating)}
          </Text>
        </Text>
        <Text style={[styles.scoreMeta, { color: theme.textSecondary }]}>
          OVER POWER <Text style={[styles.scoreMetaValue, { color: theme.text }]}>
            {formatOptionalValue(score?.over_power)}
          </Text>
        </Text>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <Text style={[styles.charter, { color: theme.textSecondary }]}>
        谱师：{difficulty.noteDesigner || '未提供'}
      </Text>
      {difficulty.notes ? (
        <NotesTable notes={difficulty.notes} />
      ) : (
        <View style={styles.notesUnavailable}>
          <Text style={[styles.body, { color: theme.textMuted }]}>物量暂不可用</Text>
          {detailError ? (
            <Pressable accessibilityRole="button" onPress={onRetryDetail}>
              <Text style={[styles.retryText, { color: theme.accent }]}>重试读取单曲详情</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      <View style={styles.actionRow}>
        <Pressable
          accessibilityLabel={practice ? '已加入练习清单' : '加入练习清单'}
          accessibilityRole="button"
          disabled={library.isUpdating}
          onPress={() => void library.setChartPractice(
            String(song.id),
            CHUNITHM_CHART_TYPE,
            difficulty.difficulty,
            !practice,
          )}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: theme.accentSoft, borderColor: theme.accent },
            pressed && styles.pressed,
            library.isUpdating && styles.disabled,
          ]}
        >
          <Text style={[styles.actionText, { color: theme.accent }]}>
            {practice ? '已加入练习清单' : '加入练习清单'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`搜索谱面确认：${searchQuery}`}
          accessibilityRole="link"
          onPress={() => void openBilibiliChartSearch(searchQuery)}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: theme.accentSoft, borderColor: theme.accent },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.actionText, { color: theme.accent }]}>搜索谱面确认</Text>
        </Pressable>
      </View>
      <View style={[styles.tagBox, { borderTopColor: theme.border }]}>
        <TagEditor
          disabled={library.isUpdating}
          historyTags={buildTagHistory(library.data ?? [], chartKey, library.tagPresets ?? [])}
          onChange={(tags) => library.setTags({
            kind: 'chart',
            songId: String(song.id),
            type: CHUNITHM_CHART_TYPE,
            levelIndex: difficulty.difficulty,
          }, tags)}
          onPresetsChange={library.setTagPresets}
          presets={library.tagPresets ?? []}
          tags={chartItem?.tags ?? []}
        />
      </View>
    </View>
  );
}

function NotesTable({ notes }: { notes: NonNullable<ChunithmDifficulty['notes']> }) {
  const theme = useAppTheme();
  const values = [
    ['TAP', notes.tap],
    ['HOLD', notes.hold],
    ['SLIDE', notes.slide],
    ['AIR', notes.air],
    ['FLICK', notes.flick],
    ['总计', notes.total],
  ] as const;
  return (
    <View accessibilityLabel="中二谱面物量" style={[styles.notesTable, { borderColor: theme.border }]}>
      {values.map(([label, value]) => (
        <View key={label} style={styles.notesCell}>
          <Text style={[styles.notesLabel, { color: theme.textMuted }]}>{label}</Text>
          <Text style={[styles.notesValue, { color: theme.text }]}>{value}</Text>
        </View>
      ))}
    </View>
  );
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

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingBottom: 32 },
  headerButton: {
    position: 'absolute',
    zIndex: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonBg: { backgroundColor: 'rgba(0,0,0,0.34)' },
  headerFavorite: { backgroundColor: 'rgba(91,33,182,0.68)' },
  hero: { position: 'relative', overflow: 'hidden' },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1D5DB',
  },
  heroPlaceholderText: { color: '#6B7280', fontSize: 60 },
  heroCopy: { position: 'absolute', left: 20, right: 20, bottom: 18, gap: 3 },
  songId: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  songTitle: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '900' },
  artist: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  metadataTable: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  metadataCell: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4, gap: 3 },
  metadataLabel: { fontSize: 10, fontWeight: '800' },
  metadataValue: { fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  carouselScroll: { marginTop: 14 },
  carousel: { paddingHorizontal: 20, gap: CARD_GAP, paddingBottom: 4 },
  difficultyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  levelBlock: { alignItems: 'flex-end', gap: 1 },
  level: { fontSize: 23, lineHeight: 27, fontWeight: '900' },
  constant: { fontSize: 11, fontWeight: '700' },
  score: { fontSize: 34, lineHeight: 42, fontWeight: '900', letterSpacing: -0.5 },
  scoreMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  scoreMeta: { fontSize: 12, fontWeight: '700' },
  scoreMetaValue: { fontWeight: '900' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  charter: { fontSize: 12, fontWeight: '700' },
  notesTable: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: 'hidden',
    paddingVertical: 8,
  },
  notesCell: { flex: 1, alignItems: 'center', gap: 3 },
  notesLabel: { fontSize: 8, fontWeight: '900' },
  notesValue: { fontSize: 11, fontWeight: '900' },
  notesUnavailable: { minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 5 },
  retryText: { fontSize: 12, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  actionText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  tagBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  noCharts: { padding: 24, alignItems: 'center' },
  details: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  copyrightCard: { gap: 7 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19 },
  footerNote: { fontSize: 11, lineHeight: 17 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.52 },
});
