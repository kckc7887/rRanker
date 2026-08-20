import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import {
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
import { SongMetadataTable, type SongMetadataItem } from '@/components/game-content/SongMetadataTable';
import { SongDetailChrome as SharedSongDetailChrome } from '@/components/game-content/SongDetailChrome';
import { SONG_DETAIL_CHROME_STYLES } from '@/components/game-content/SongDetailChromeStyles';
import { SongDetailHero } from '@/components/game-content/SongDetailHero';
import { DetailPressable } from '@/components/game-content/DetailPressable';
import { QueryStateView } from '@/components/QueryStateView';
import { TagEditor } from '@/components/TagEditor';
import type { GamePayload } from '@/domain/game-data';
import { isOsuGameId, type OsuGameId } from '@/domain/game-mode-family';
import {
  OSU_STATUS_LABELS,
  formatOsuAccuracy,
  formatOsuPp,
  recommendedOsuStar,
  type OsuBeatmapDetail,
  type OsuBeatmapsetDetail,
  type OsuBestScore,
  type OsuScoreStatistics,
} from '@/domain/osu';
import { resolveOsuStarTheme } from '@/domain/osu-star-theme';
import { buildTagHistory } from '@/domain/user-library';
import { ProviderError } from '@/providers/errors';
import { useGameData } from '@/hooks/use-game-data';
import { useOsuBeatmapsetDetail } from '@/hooks/use-osu-beatmapset-detail';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { OsuModBadge } from './OsuModBadge';
import { OsuRankTag } from './OsuRankTag';

const CARD_GAP = 12;
/** osu 谱面级曲库键的 type 段（无 SD/DX 之分，统一占位 'SD'，levelIndex = beatmap id）。 */
const OSU_CHART_TYPE = 'SD' as const;

type LibraryHook = ReturnType<typeof useUserLibrary>;
type OsuGameDataPayload = Extract<GamePayload, { kind: 'osu' }>;

/**
 * osu! 歌曲详情页：songId = beatmapset id。
 * 结构对标公共详情模式（Hero + 简要信息栏 + 难度轮播 + 歌曲信息区）：
 * 难度自高星起降序，星级色作为难度卡主题色（渐变 + 描边）；
 * 进入定位优先成绩卡带入的 beatmap id，否则按 pp 推荐星级取最近卡片。
 */
export function OsuSongDetail({
  beatmapsetId,
  initialBeatmapId,
}: {
  beatmapsetId?: string;
  initialBeatmapId?: number;
}) {
  const activeGameId = useSession((s) => s.activeGameId);
  // 路由层已按 isOsuGameId 分发；此处收窄类型并防御非 osu 游戏误入。
  if (!isOsuGameId(activeGameId)) return <View style={styles.page} />;
  return (
    <OsuSongDetailContent
      gameId={activeGameId}
      beatmapsetId={beatmapsetId}
      initialBeatmapId={initialBeatmapId}
    />
  );
}

function OsuSongDetailContent({
  gameId,
  beatmapsetId,
  initialBeatmapId,
}: {
  gameId: OsuGameId;
  beatmapsetId?: string;
  initialBeatmapId?: number;
}) {
  const theme = useAppTheme();
  const detail = useOsuBeatmapsetDetail(gameId, beatmapsetId ?? null);
  const gameData = useGameData();
  const library = useUserLibrary();
  const song = detail.data;
  const payload = gameData.data?.payload.kind === 'osu'
    ? gameData.data.payload
    : undefined;
  const songItem = song
    ? library.data?.find((item) => item.key === library.songKey(String(song.beatmapSetId)))
    : undefined;
  const favorite = songItem?.kind === 'song' && songItem.favorite;
  const favoriteDisabled = library.isLoading || library.isUpdating;
  // beatmapset 不存在或已删除（HTTP 404）归一化为空态，不当作错误。
  const isNoData = detail.error instanceof ProviderError && detail.error.code === 'no_data';
  const isLoading = !song && detail.isLoading;
  const isError = !song && detail.isError && !isNoData;
  // 空态覆盖：no_data、beatmapsetId 缺失、未绑定不发请求（enabled false 即非 loading）等一切无数据场景。
  const isEmpty = !song && !isLoading && !isError;
  const retry = () => {
    void detail.refetch();
  };

  return (
    <>
      <StatusBar style="light" />
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <QueryStateView<OsuBeatmapsetDetail>
          data={song}
          emptyText="找不到这首歌曲"
          error={detail.error}
          isEmpty={isEmpty}
          isError={isError}
          isLoading={isLoading}
          onRetry={retry}
          renderData={(item) => (
            <OsuDetailBody
              gameId={gameId}
              initialBeatmapId={initialBeatmapId}
              library={library}
              payload={payload}
              song={item}
            />
          )}
        />
        <DetailChrome
          favorite={favorite}
          favoriteDisabled={favoriteDisabled}
          onToggleFavorite={song
            ? () => void library.setSongFavorite(String(song.beatmapSetId), !favorite)
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
  song?: OsuBeatmapsetDetail;
  favorite: boolean;
  favoriteDisabled: boolean;
  onToggleFavorite?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <SharedSongDetailChrome
      topInset={insets.top}
      backStyle={(pressed) => [
        SONG_DETAIL_CHROME_STYLES.headerButton,
        SONG_DETAIL_CHROME_STYLES.headerFloatingButton,
        { top: insets.top, left: 8 },
        pressed && styles.pressed,
      ]}
      favorite={song && onToggleFavorite ? {
        label: favorite ? `取消收藏 ${song.title}` : `收藏 ${song.title}`,
        active: favorite,
        disabled: favoriteDisabled,
        onPress: onToggleFavorite,
      } : undefined}
      favoriteStyle={(pressed) => [
        SONG_DETAIL_CHROME_STYLES.headerButton,
        SONG_DETAIL_CHROME_STYLES.headerFloatingButton,
        { top: insets.top, right: 8 },
        favorite && SONG_DETAIL_CHROME_STYLES.headerFavoriteActive,
        pressed && styles.pressed,
        favoriteDisabled && styles.disabled,
      ]}
    />
  );
}

function OsuDetailBody({
  gameId,
  song,
  payload,
  library,
  initialBeatmapId,
}: {
  gameId: OsuGameId;
  song: OsuBeatmapsetDetail;
  payload?: OsuGameDataPayload;
  library: LibraryHook;
  initialBeatmapId?: number;
}) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(280, width - 40);
  const songItem = library.data?.find(
    (item) => item.key === library.songKey(String(song.beatmapSetId)),
  );
  const metadataItems: SongMetadataItem[] = [
    { key: 'status', label: '分类', value: OSU_STATUS_LABELS[song.status ?? ''] ?? '未知', flex: 1 },
    { key: 'genre', label: '流派', value: song.genreName ?? '未知', flex: 1 },
    { key: 'language', label: '语言', value: song.languageName ?? '未知', flex: 1 },
  ];
  // 进入定位：成绩卡带入的 beatmap id 优先；否则按推荐星级取最近卡片
  // （列表降序 + 严格小于比较，并列时天然取更高星）。
  const recommended = recommendedOsuStar(gameId, payload?.player.pp);
  const requestedIndex = initialBeatmapId === undefined
    ? -1
    : song.beatmaps.findIndex((beatmap) => beatmap.id === initialBeatmapId);
  let recommendedIndex = 0;
  for (let index = 1; index < song.beatmaps.length; index += 1) {
    if (Math.abs(song.beatmaps[index].difficultyRating - recommended)
      < Math.abs(song.beatmaps[recommendedIndex].difficultyRating - recommended)) {
      recommendedIndex = index;
    }
  }
  const initialIndex = requestedIndex >= 0 ? requestedIndex : recommendedIndex;
  // 本 beatmapset 内按 beatmap id 匹配 Top 100 成绩（同谱多条时取最高分一条）。
  const scoresByBeatmapId = useMemo(() => {
    const map = new Map<number, OsuBestScore>();
    for (const score of payload?.bestScores ?? []) {
      if (score.beatmap.beatmapSetId !== song.beatmapSetId) continue;
      const existing = map.get(score.beatmap.id);
      if (!existing || score.score > existing.score) map.set(score.beatmap.id, score);
    }
    return map;
  }, [payload, song.beatmapSetId]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="osu-song-detail-scroll"
    >
      <Hero song={song} width={width} />
      <SongMetadataTable
        accessibilityLabel="osu 歌曲详情数据"
        cellRootStyle={styles.metadataCellRoot}
        cellStyle={styles.metadataCell}
        interaction="platform-detail"
        items={metadataItems}
        labelStyle={styles.metadataLabel}
        measureStyle={styles.metadataValueMeasure}
        style={styles.metadataTable}
        testIDPrefix="osu-metadata"
        valueBlockStyle={styles.metadataValueBlock}
        valueStyle={styles.metadataValue}
      />

      <SharedChartCarousel
        accessibilityLabel="osu 难度卡片"
        cardWidth={cardWidth}
        contentContainerStyle={styles.carousel}
        empty={<View style={styles.noCharts}><Text style={styles.body}>暂无可用难度</Text></View>}
        gap={CARD_GAP}
        initialIndex={initialIndex}
        items={song.beatmaps}
        keyExtractor={(beatmap) => String(beatmap.id)}
        renderItem={(beatmap) => (
          <DifficultyCard
            beatmap={beatmap}
            library={library}
            score={scoresByBeatmapId.get(beatmap.id)}
            song={song}
            width={cardWidth}
          />
        )}
        resetKey={song.beatmapSetId}
        rootStyle={styles.carouselRoot}
        scrollStyle={styles.carouselScroll}
      />

      <View style={styles.details}>
        <Card testID="osu-song-info-card">
          <Text style={[styles.sectionTitle, { color: theme.text }]}>歌曲信息</Text>
          <View style={styles.tagsBlock}>
            <Text style={[styles.infoLabel, { color: theme.textMuted }]}>标签</Text>
            {song.tags.length > 0 ? (
              <View style={styles.mapperTags}>
                {song.tags.map((tag) => (
                  <View
                    key={tag}
                    style={[styles.mapperTag, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}
                  >
                    <Text numberOfLines={1} style={[styles.mapperTagText, { color: theme.textSecondary }]}>
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyInline, { color: theme.textMuted }]}>—</Text>
            )}
          </View>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            玩家评价：{song.rating != null && song.rating > 0
              ? `${song.rating.toFixed(1)} 分`
              : '暂无评价'}
          </Text>
        </Card>
        <Card>
          <TagEditor
            disabled={library.isUpdating}
            historyTags={buildTagHistory(
              library.data ?? [],
              library.songKey(String(song.beatmapSetId)),
              library.tagPresets ?? [],
            )}
            onChange={(tags) => library.setTags({
              kind: 'song',
              songId: String(song.beatmapSetId),
            }, tags)}
            onPresetsChange={library.setTagPresets}
            presets={library.tagPresets ?? []}
            tags={songItem?.kind === 'song' ? songItem.tags : []}
          />
        </Card>
      </View>
    </ScrollView>
  );
}

function Hero({ song, width }: { song: OsuBeatmapsetDetail; width: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [song.beatmapSetId]);
  return (
    <SongDetailHero
      size={width}
      style={styles.hero}
      cover={failed || !song.cover ? undefined : (
        <Image
          accessibilityLabel={`歌曲封面 ${song.title}`}
          cachePolicy="disk"
          contentFit="cover"
          onError={() => setFailed(true)}
          source={song.cover}
          style={StyleSheet.absoluteFill}
          transition={120}
        />
      )}
      placeholderStyle={styles.heroPlaceholder}
      placeholderNoteStyle={styles.heroPlaceholderText}
      shadeColors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.48)']}
      shadeStyle={StyleSheet.absoluteFill}
      copyStyle={styles.heroCopy}
    >
      <HorizontalText text={`#${song.beatmapSetId}`} textStyle={styles.songId} />
      <HorizontalText text={song.title} textStyle={styles.songTitle} />
      <HorizontalText text={song.artist} textStyle={styles.artist} />
    </SongDetailHero>
  );
}

function DifficultyCard({
  beatmap,
  song,
  score,
  library,
  width,
}: {
  beatmap: OsuBeatmapDetail;
  song: OsuBeatmapsetDetail;
  score?: OsuBestScore;
  library: LibraryHook;
  width: number;
}) {
  const theme = useAppTheme();
  // 星级色即难度卡主题色：描边 + 从星色到卡面的对角渐变（透明后缀随深浅色，同 TUF 难度卡）。
  const starTheme = resolveOsuStarTheme(beatmap.difficultyRating);
  const chartKey = library.chartKey(String(song.beatmapSetId), OSU_CHART_TYPE, beatmap.id);
  const chartItem = library.data?.find((item) => item.key === chartKey);
  return (
    <GameChartResultCard
      accessibilityLabel={`${song.title} ${beatmap.version} 难度卡片`}
      gradient={{
        colors: [`${starTheme.background}${theme.dark ? '66' : '38'}`, theme.surface],
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
      }}
      style={[
        styles.difficultyCard,
        { width, backgroundColor: theme.surface, borderColor: starTheme.background },
      ]}
      testID={`osu-detail-difficulty-${beatmap.id}`}
    >
      <View style={styles.chartHeader}>
        <Text numberOfLines={1} style={[styles.version, { color: theme.text }]}>
          {beatmap.version}
        </Text>
        <View style={styles.levelBlock}>
          <Text style={[styles.levelNumber, { color: theme.text }]}>
            {beatmap.difficultyRating.toFixed(2)}
          </Text>
          <Text style={[styles.levelStar, { color: theme.textMuted }]}>★</Text>
        </View>
      </View>
      <View style={styles.resultBlock}>
        <Text style={[styles.scoreLabel, { color: theme.textMuted }]}>Score</Text>
        <Text style={[styles.score, { color: theme.text }]}>
          {score ? score.score.toLocaleString('en-US') : '—'}
        </Text>
        {score ? (
          <View style={styles.badgeRow}>
            <OsuRankTag rank={score.rank} testID={`osu-detail-rank-${score.rank}`} />
            {(score.mods ?? []).map((acronym) => (
              <OsuModBadge key={acronym} acronym={acronym} />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>准确率</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {score ? formatOsuAccuracy(score.accuracy) : '—'}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>最大连击</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {score?.maxCombo != null ? `${score.maxCombo}x` : '—'}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>时长</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {formatOsuDuration(beatmap.totalLength)}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>BPM</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {formatOsuBpm(beatmap.bpm)}
          </Text>
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <View style={styles.charterBlock}>
        <Text style={[styles.charterLabel, { color: theme.textMuted }]}>谱师</Text>
        <Text style={[styles.charterValue, { color: theme.text }]}>
          {song.creator || '未提供'}
        </Text>
      </View>
      <JudgementMatrix score={score} />
      <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>
        达成时间：{score?.achievedAt?.slice(0, 10) ?? '—'}
      </Text>
      <DetailPressable
        accessibilityLabel={chartItem?.kind === 'chart' && chartItem.practice ? '移出练习清单' : '加入练习清单'}
        accessibilityRole="button"
        disabled={library.isUpdating}
        onPress={() => void library.setChartPractice(
          String(song.beatmapSetId),
          OSU_CHART_TYPE,
          beatmap.id,
          !(chartItem?.kind === 'chart' && chartItem.practice),
        )}
        style={({ pressed }) => [
          styles.practiceButton,
          chartItem?.kind === 'chart' && chartItem.practice
            ? { backgroundColor: starTheme.background, borderColor: starTheme.background }
            : { backgroundColor: 'transparent', borderColor: starTheme.background },
          pressed && styles.pressed,
          library.isUpdating && styles.disabled,
        ]}
        testID={`osu-detail-practice-${beatmap.id}`}
      >
        <Text style={[
          styles.practiceButtonText,
          { color: chartItem?.kind === 'chart' && chartItem.practice ? '#FFFFFF' : starTheme.background },
        ]}>
          {chartItem?.kind === 'chart' && chartItem.practice ? '移出练习清单' : '加入练习清单'}
        </Text>
      </DetailPressable>
      <TagEditor
        disabled={library.isUpdating}
        historyTags={buildTagHistory(library.data ?? [], chartKey, library.tagPresets ?? [])}
        onChange={(tags) => library.setTags({
          kind: 'chart',
          songId: String(song.beatmapSetId),
          type: OSU_CHART_TYPE,
          levelIndex: beatmap.id,
        }, tags)}
        onPresetsChange={library.setTagPresets}
        presets={library.tagPresets ?? []}
        tags={chartItem?.tags ?? []}
        testID={`osu-detail-chart-tags-${beatmap.id}`}
      />
    </GameChartResultCard>
  );
}

/** 判定矩阵两行（前三种/后三种），各判定带固定色；PP 独立右块（正常文字色）。 */
const OSU_JUDGEMENT_ROWS: readonly (readonly {
  key: keyof OsuScoreStatistics;
  label: string;
  color: string;
}[])[] = [
  [
    { key: 'perfect', label: 'PERFECT', color: '#66CCFF' },
    { key: 'great', label: 'GREAT', color: '#47B4EB' },
    { key: 'good', label: 'GOOD', color: '#66FF73' },
  ],
  [
    { key: 'ok', label: 'OK', color: '#99EB47' },
    { key: 'meh', label: 'MEH', color: '#FFD966' },
    { key: 'miss', label: 'MISS', color: '#FF6666' },
  ],
];

function JudgementMatrix({ score }: { score?: OsuBestScore }) {
  const theme = useAppTheme();
  const statistics = score?.statistics ?? null;
  return (
    <View accessibilityLabel="osu 判定统计" style={styles.judgementPanel}>
      <View style={styles.judgementMatrix}>
        {OSU_JUDGEMENT_ROWS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.judgementRow}>
            {row.map((item) => (
              <View key={item.key} style={styles.judgementCell} testID={`osu-judgement-${item.key}`}>
                <Text numberOfLines={1} style={[styles.judgementLabel, { color: theme.textMuted }]}>
                  {item.label}
                </Text>
                <Text style={[styles.judgementValue, { color: item.color }]}>
                  {statistics?.[item.key] != null
                    ? statistics[item.key]!.toLocaleString('en-US')
                    : '—'}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View
        style={[
          styles.ppCell,
          { borderLeftColor: theme.dark ? 'rgba(255,255,255,0.12)' : theme.border },
        ]}
      >
        <Text style={[styles.ppLabel, { color: theme.textMuted }]}>PP</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1}
          style={[styles.ppValue, { color: theme.text }]}>
          {score ? formatOsuPp(score.pp) : '—'}
        </Text>
      </View>
    </View>
  );
}

function HorizontalText({ text, textStyle }: { text: string; textStyle: object }) {
  return (
    <AutoScrollText
      contentContainerStyle={styles.singleLineContent}
      style={styles.singleLine}
      text={text}
      textStyle={textStyle}
    />
  );
}

/** 时长：total_length 秒 → m:ss；缺失/非法显示 '—'。 */
function formatOsuDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** BPM：整数显示；缺失显示 '—'。 */
function formatOsuBpm(bpm: number | null): string {
  return bpm == null || !Number.isFinite(bpm) ? '—' : String(Math.round(bpm));
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingBottom: 32 },
  hero: { position: 'relative', overflow: 'hidden' },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1D5DB',
  },
  heroPlaceholderText: { color: '#6B7280', fontSize: 60 },
  heroCopy: { position: 'absolute', left: 20, right: 20, bottom: 18, gap: 3 },
  singleLine: { flexGrow: 0 },
  singleLineContent: { paddingRight: 18 },
  songId: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  songTitle: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '900' },
  artist: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  metadataTable: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  metadataCellRoot: { minWidth: 0 },
  metadataCell: { minWidth: 0, alignItems: 'center', paddingHorizontal: 4, gap: 3 },
  metadataLabel: { fontSize: 10, fontWeight: '800' },
  metadataValueBlock: { position: 'relative', minWidth: 0, alignSelf: 'stretch' },
  metadataValueMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 },
  metadataValue: { fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  carouselRoot: { flexGrow: 0 },
  carouselScroll: { flexGrow: 0, marginTop: 14 },
  carousel: { paddingHorizontal: 20, gap: CARD_GAP, paddingBottom: 4 },
  difficultyCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#1A2232',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  version: { flexShrink: 1, fontSize: 17, lineHeight: 22, fontWeight: '800' },
  levelBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 1, paddingTop: 3 },
  levelNumber: { fontSize: 32, lineHeight: 34, fontWeight: '900', fontVariant: ['tabular-nums'] },
  levelStar: { fontSize: 16, lineHeight: 20, fontWeight: '900' },
  resultBlock: { alignItems: 'flex-start', gap: 3, marginTop: 22 },
  scoreLabel: { fontSize: 12, fontWeight: '700' },
  score: { fontSize: 34, lineHeight: 42, fontWeight: '900', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  badgeRow: { minHeight: 24, marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 7 },
  statRow: { flexDirection: 'row', marginTop: 16, gap: 14 },
  statCell: { gap: 2 },
  statLabel: { fontSize: 11, fontWeight: '700' },
  statValue: { fontSize: 18, lineHeight: 23, fontWeight: '900', fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  charterBlock: { gap: 4 },
  charterLabel: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.25 },
  charterValue: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  judgementPanel: {
    minHeight: 104,
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    borderRadius: 12,
    padding: 12,
    // 判定表淡灰遮罩：彩字区域与卡面区分（2026-08-20 应要求自 0.14 加暗），深浅模式同色。
    backgroundColor: 'rgba(128,128,128,0.18)',
  },
  judgementMatrix: { flex: 1, minWidth: 0, gap: 9 },
  judgementRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  judgementCell: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  judgementLabel: { fontSize: 9, lineHeight: 12, fontWeight: '800' },
  judgementValue: { fontSize: 18, lineHeight: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  ppCell: { width: 78, flexShrink: 0, borderLeftWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 5, paddingLeft: 8 },
  ppLabel: { fontSize: 9, lineHeight: 12, fontWeight: '800' },
  ppValue: { width: '100%', fontSize: 21, lineHeight: 27, fontWeight: '900', fontVariant: ['tabular-nums'], textAlign: 'center' },
  chartMeta: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  practiceButton: {
    minHeight: 40,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  practiceButtonText: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  noCharts: { padding: 24, alignItems: 'center' },
  details: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 7 },
  body: { fontSize: 13, lineHeight: 19 },
  infoLabel: { fontSize: 11, lineHeight: 18, fontWeight: '800' },
  tagsBlock: { marginBottom: 7, gap: 6 },
  mapperTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mapperTag: {
    maxWidth: '100%',
    minHeight: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapperTagText: { flexShrink: 1, fontSize: 10, lineHeight: 14, fontWeight: '800' },
  emptyInline: { fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.52 },
});
