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
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { SongMetadataTable, type SongMetadataItem } from '@/components/game-content/SongMetadataTable';
import { SongDetailChrome as SharedSongDetailChrome } from '@/components/game-content/SongDetailChrome';
import { SONG_DETAIL_CHROME_STYLES } from '@/components/game-content/SongDetailChromeStyles';
import { SongDetailHero } from '@/components/game-content/SongDetailHero';
import { QueryStateView } from '@/components/QueryStateView';
import { TagEditor } from '@/components/TagEditor';
import type { GamePayload } from '@/domain/game-data';
import type { GameNoteValue } from '@/domain/game-content';
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
import { buildTagHistory } from '@/domain/user-library';
import { ProviderError } from '@/providers/errors';
import { useGameData } from '@/hooks/use-game-data';
import { useOsuBeatmapsetDetail } from '@/hooks/use-osu-beatmapset-detail';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { OsuDifficultyBadge } from './OsuDifficultyBadge';
import { OsuRankTag } from './OsuRankTag';

const CARD_GAP = 12;
/** osu 谱面级曲库键的 type 段（无 SD/DX 之分，统一占位 'SD'，levelIndex = beatmap id）。 */
const OSU_CHART_TYPE = 'SD' as const;

type LibraryHook = ReturnType<typeof useUserLibrary>;
type OsuGameDataPayload = Extract<GamePayload, { kind: 'osu' }>;

/**
 * osu! 歌曲详情页：songId = beatmapset id。
 * 结构对标 ChunithmSongDetail（Hero + 简要信息栏 + 难度轮播 + 歌曲信息区），
 * 难度自高星起降序排列，成绩复用当前模式 Top 100 快照按 beatmap id 匹配。
 */
export function OsuSongDetail({ beatmapsetId }: { beatmapsetId?: string }) {
  const activeGameId = useSession((s) => s.activeGameId);
  // 路由层已按 isOsuGameId 分发；此处收窄类型并防御非 osu 游戏误入。
  if (!isOsuGameId(activeGameId)) return <View style={styles.page} />;
  return <OsuSongDetailContent gameId={activeGameId} beatmapsetId={beatmapsetId} />;
}

function OsuSongDetailContent({
  gameId,
  beatmapsetId,
}: {
  gameId: OsuGameId;
  beatmapsetId?: string;
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
}: {
  gameId: OsuGameId;
  song: OsuBeatmapsetDetail;
  payload?: OsuGameDataPayload;
  library: LibraryHook;
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
  // 推荐难度定位：|星数 − 推荐星级| 最小的卡片；列表降序 + 严格小于比较，并列时天然取更高星。
  const recommended = recommendedOsuStar(gameId, payload?.player.pp);
  let initialIndex = 0;
  for (let index = 1; index < song.beatmaps.length; index += 1) {
    if (Math.abs(song.beatmaps[index].difficultyRating - recommended)
      < Math.abs(song.beatmaps[initialIndex].difficultyRating - recommended)) {
      initialIndex = index;
    }
  }
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
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textMuted }]}>谱师</Text>
            <View style={styles.creatorPill}>
              <Text style={[styles.creatorPillText, { color: theme.textSecondary }]}>
                {song.creator || '未提供'}
              </Text>
            </View>
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
  const chartKey = library.chartKey(String(song.beatmapSetId), OSU_CHART_TYPE, beatmap.id);
  const chartItem = library.data?.find((item) => item.key === chartKey);
  return (
    <GameChartResultCard
      accessibilityLabel={`${song.title} ${beatmap.version} 难度卡片`}
      style={[
        styles.difficultyCard,
        { width, backgroundColor: theme.surface, borderColor: theme.border },
      ]}
      testID={`osu-detail-difficulty-${beatmap.id}`}
    >
      <View style={styles.chartHeader}>
        <View style={styles.chartIdentity}>
          <Text numberOfLines={1} style={[styles.version, { color: theme.text }]}>
            {beatmap.version}
          </Text>
          <OsuDifficultyBadge star={beatmap.difficultyRating} />
        </View>
      </View>
      <View style={styles.resultBlock}>
        <Text style={[styles.scoreLabel, { color: theme.textMuted }]}>Score</Text>
        <Text style={[styles.score, { color: theme.text }]}>
          {score ? score.score.toLocaleString('en-US') : '—'}
        </Text>
        <View style={styles.statRow}>
          <Text style={[styles.statValue, { color: theme.textSecondary }]}>
            {score ? formatOsuAccuracy(score.accuracy) : '—'}
          </Text>
          <Text style={[styles.statValue, { color: theme.textSecondary }]}>
            {score?.maxCombo != null ? `${score.maxCombo}x` : '—'}
          </Text>
        </View>
        {score ? (
          <View style={styles.badgeRow}>
            <OsuRankTag rank={score.rank} testID={`osu-detail-rank-${score.rank}`} />
          </View>
        ) : null}
      </View>
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <Text style={[styles.charter, { color: theme.textSecondary }]}>
        谱师：{song.creator || '未提供'}
      </Text>
      <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>
        时长：{formatOsuDuration(beatmap.totalLength)}
      </Text>
      <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>
        BPM：{formatOsuBpm(beatmap.bpm)}
      </Text>
      <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>
        圆圈数量：{formatOsuCount(beatmap.countCircles)}
      </Text>
      <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>
        滑条数量：{formatOsuCount(beatmap.countSliders)}
      </Text>
      <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>
        按键数量：{formatOsuDecimal(beatmap.cs)}
      </Text>
      <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>
        掉血速度：{formatOsuDecimal(beatmap.drain)}
      </Text>
      <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>
        准度要求：{formatOsuDecimal(beatmap.accuracy)}
      </Text>
      <StatisticsTable
        borderColor={theme.border}
        labelColor={theme.textMuted}
        score={score}
        valueColor={theme.text}
      />
      <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>
        达成时间：{score?.achievedAt?.slice(0, 10) ?? '—'}
      </Text>
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

/** 判定表七列：六列判定计数 + PP；无成绩或旧缓存无 statistics 时全列 '—'。 */
const STATISTIC_COLUMNS: readonly { label: string; key: keyof OsuScoreStatistics }[] = [
  { label: 'PERFECT', key: 'perfect' },
  { label: 'GREAT', key: 'great' },
  { label: 'GOOD', key: 'good' },
  { label: 'OK', key: 'ok' },
  { label: 'MEH', key: 'meh' },
  { label: 'MISS', key: 'miss' },
];

function StatisticsTable({
  score,
  borderColor,
  labelColor,
  valueColor,
}: {
  score?: OsuBestScore;
  borderColor?: string;
  labelColor?: string;
  valueColor?: string;
}) {
  const theme = useAppTheme();
  const statistics = score?.statistics ?? null;
  const values: readonly GameNoteValue[] = STATISTIC_COLUMNS.map((column) => {
    const count = statistics?.[column.key] ?? null;
    return {
      key: column.key,
      label: column.label,
      value: count != null ? count.toLocaleString('en-US') : '—',
    };
  });
  return (
    <GameNoteTable
      accessibilityLabel="osu 判定统计"
      containerStyle={[styles.notesTable, { borderColor: borderColor ?? theme.border }]}
      group={{
        key: 'statistics',
        values: [...values, { key: 'pp', label: 'PP', value: score ? formatOsuPp(score.pp) : '—' }],
      }}
      itemStyle={styles.notesCell}
      labelStyle={[styles.notesLabel, { color: labelColor ?? theme.textMuted }]}
      mode="cells"
      valueStyle={[styles.notesValue, { color: valueColor ?? theme.text }]}
    />
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

/** 物件计数：千分位整数；缺失显示 '—'。 */
function formatOsuCount(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('en-US');
}

/** 一位小数（键数/HP/OD 等）；缺失显示 '—'。 */
function formatOsuDecimal(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(1);
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
  chartIdentity: { alignItems: 'flex-start', gap: 7 },
  version: { fontSize: 16, lineHeight: 21, fontWeight: '800' },
  resultBlock: { alignItems: 'flex-start', gap: 2, marginTop: 22 },
  scoreLabel: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  score: { fontSize: 34, lineHeight: 42, fontWeight: '900', letterSpacing: -0.5 },
  statRow: { flexDirection: 'row', gap: 24, marginTop: 6 },
  statValue: { fontSize: 13, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, minHeight: 24, marginTop: 7 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  charter: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  chartMeta: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  notesTable: {
    marginTop: 9,
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9,
    overflow: 'hidden',
    paddingVertical: 8,
  },
  notesCell: { flex: 1, alignItems: 'center', gap: 3 },
  notesLabel: { fontSize: 8, fontWeight: '900' },
  notesValue: { fontSize: 11, fontWeight: '900' },
  noCharts: { padding: 24, alignItems: 'center' },
  details: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 7 },
  body: { fontSize: 13, lineHeight: 19 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  infoLabel: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  creatorPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  creatorPillText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.52 },
});
