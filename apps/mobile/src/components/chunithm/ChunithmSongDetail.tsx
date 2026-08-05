import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { AutoScrollText } from '@/components/game-content/AutoScrollText';
import { ChartCarousel as SharedChartCarousel } from '@/components/game-content/ChartCarousel';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { SongMetadataTable, type SongMetadataItem } from '@/components/game-content/SongMetadataTable';
import { useSongDetailBackNavigation } from '@/components/game-content/SongDetailNavigation';
import { QueryStateView } from '@/components/QueryStateView';
import { TagEditor } from '@/components/TagEditor';
import {
  CHUNITHM_DIFFICULTY_LABELS,
  type ChunithmDifficulty,
  type ChunithmLevelIndex,
  type ChunithmSong,
} from '@/domain/chunithm';
import type { ChunithmScore } from '@/domain/chunithm-personal';
import {
  buildTagHistory,
} from '@/domain/user-library';
import {
  chunithmAchievementBadges,
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
import {
  CHUNITHM_WORLDS_END_GRADIENT,
  ChunithmDifficultyBadge,
} from './ChunithmDifficultyBadge';
import {
  AchievementBadge,
  ChunithmGradientScore,
  RankBadge,
} from './ChunithmScoreCard';
import { chunithmJacketUrl } from './ChunithmSongRow';

const CARD_GAP = 12;
const CHUNITHM_CHART_TYPE = 'SD' as const;

const DIFFICULTY_CARD_VISUAL: Record<ChunithmLevelIndex, {
  color: string;
  tint: string;
  border?: string;
  darkAction?: string;
}> = {
  0: { color: '#4AA58A', tint: '#ECF8F3' },
  1: { color: '#E27A24', tint: '#FFF6E8' },
  2: { color: '#D6403A', tint: '#FFF0F0' },
  3: { color: '#7526CF', tint: '#F3EAFD' },
  // ULTIMA：黑底红边，对齐难度标签
  4: { color: '#E83A58', tint: '#17171A', border: '#E83A58', darkAction: '#E83A58' },
  5: { color: '#7B61FF', tint: '#F3EEFF' },
};

type LibraryHook = ReturnType<typeof useUserLibrary>;

function DetailPressable(props: ComponentProps<typeof Pressable>) {
  return Platform.OS === 'android'
    ? <Pressable {...props} />
    : <GesturePressable {...props as ComponentProps<typeof GesturePressable>} />;
}

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
              detailError={detail.isError}
              initialLevelIndex={initialLevelIndex}
              library={library}
              onRetryDetail={() => void detail.refetch()}
              scores={payload?.scores ?? []}
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
  const navigateBack = useSongDetailBackNavigation();
  return (
    <>
      <Pressable
        accessibilityLabel="返回"
        accessibilityRole="button"
        hitSlop={12}
        onPress={navigateBack}
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
  detailError,
  onRetryDetail,
}: {
  song: ChunithmSong;
  scores: readonly ChunithmScore[];
  library: LibraryHook;
  initialLevelIndex?: number;
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
  const songItem = library.data?.find((item) => item.key === library.songKey(String(song.id)));
  const mapValue = song.map?.trim();
  const metadataItems: SongMetadataItem[] = [
    { key: 'genre', label: '分类', value: song.genre || '未提供', flex: 1 },
    { key: 'bpm', label: 'BPM', value: song.bpm ? String(song.bpm) : '未提供', flex: 1 },
    { key: 'version', label: '版本', value: song.versionTitle || '未提供', flex: 1 },
    ...(mapValue ? [{ key: 'map', label: '地图', value: mapValue, flex: 1 }] : []),
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="chunithm-song-detail-scroll"
    >
      <Hero song={song} width={width} />
      <SongMetadataTable
        accessibilityLabel="中二歌曲详情数据"
        cellStyle={styles.metadataCell}
        items={metadataItems}
        labelStyle={styles.metadataLabel}
        measureStyle={styles.metadataValueMeasure}
        style={styles.metadataTable}
        testIDPrefix="chunithm-metadata"
        valueBlockStyle={styles.metadataValueBlock}
        valueStyle={styles.metadataValue}
      />

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
        <Card testID="chunithm-song-info-card">
          <Text style={[styles.sectionTitle, { color: theme.text }]}>歌曲信息</Text>
          <ChunithmAliasLine aliases={song.aliases ?? []} />
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            版权：{song.rights || '未提供'}
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            状态：{song.disabled ? '禁用' : song.locked ? '锁定' : '可用'}
          </Text>
        </Card>
        <Card>
          <TagEditor
            disabled={library.isUpdating}
            historyTags={buildTagHistory(library.data ?? [], library.songKey(song.id), library.tagPresets ?? [])}
            onChange={(tags) => library.setTags({ kind: 'song', songId: String(song.id) }, tags)}
            onPresetsChange={library.setTagPresets}
            presets={library.tagPresets ?? []}
            tags={songItem?.kind === 'song' ? songItem.tags : []}
          />
        </Card>
      </View>
    </ScrollView>
  );
}

function ChunithmAliasLine({ aliases }: { aliases: readonly string[] }) {
  const theme = useAppTheme();
  const text = `别名：${aliases.join('、') || '无'}`;
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => { setExpanded(false); setOverflow(false); }, [text]);
  return (
    <View style={styles.aliasBlock}>
      <Text
        accessible={false}
        style={[styles.body, styles.aliasMeasure, { color: theme.textSecondary }]}
        testID="chunithm-alias-overflow-measure"
        onTextLayout={(event) => setOverflow(event.nativeEvent.lines.length > 1)}
      >
        {text}
      </Text>
      <Text
        numberOfLines={expanded ? undefined : 1}
        style={[styles.body, { color: theme.textSecondary }]}
        testID="chunithm-alias-text"
      >
        {text}
      </Text>
      {overflow ? (
        <DetailPressable
          accessibilityLabel={expanded ? '收起别名' : '展开别名'}
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => setExpanded((value) => !value)}
          style={styles.aliasAction}
        >
          <Text style={[styles.aliasActionText, { color: theme.accent }]}>
            {expanded ? '收起' : '展开'}
          </Text>
        </DetailPressable>
      ) : null}
    </View>
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
        <HorizontalText text={`#${song.id}`} textStyle={styles.songId} />
        <HorizontalText text={song.title} textStyle={styles.songTitle} />
        <HorizontalText text={song.artist ?? '艺术家未知'} textStyle={styles.artist} />
      </View>
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
  return (
    <SharedChartCarousel
      accessibilityLabel="中二难度卡片"
      cardWidth={cardWidth}
      contentContainerStyle={styles.carousel}
      empty={<View style={styles.noCharts}><Text style={styles.body}>暂无可用难度</Text></View>}
      gap={CARD_GAP}
      initialIndex={initialIndex}
      items={difficulties}
      keyExtractor={(difficulty) => String(difficulty.difficulty)}
      renderItem={(difficulty) => (
        <DifficultyCard
          detailError={detailError}
          difficulty={difficulty}
          library={library}
          onRetryDetail={onRetryDetail}
          score={bestScoreForDifficulty(scores, song.id, difficulty.difficulty)}
          song={song}
          width={cardWidth}
        />
      )}
      resetKey={song.id}
      rootStyle={styles.carouselRoot}
      scrollStyle={styles.carouselScroll}
    />
  );
}

function ScoreValue({
  score,
  textColor,
  mutedColor,
}: {
  score?: ChunithmScore;
  textColor?: string;
  mutedColor?: string;
}) {
  const theme = useAppTheme();
  if (!score) {
    return <Text style={[styles.score, { color: mutedColor ?? theme.textMuted }]}>—</Text>;
  }
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
  return <Text style={[styles.score, { color: textColor ?? theme.text }]}>{text}</Text>;
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
  const visual = DIFFICULTY_CARD_VISUAL[difficulty.difficulty];
  const ultima = difficulty.difficulty === 4;
  const worldsEnd = difficulty.difficulty === 5;
  const specialCard = ultima || worldsEnd;
  const inverted = ultima || worldsEnd;
  const primaryText = inverted ? '#FFFFFF' : worldsEnd ? '#261C38' : theme.text;
  const secondaryText = inverted
    ? 'rgba(255,255,255,0.78)'
    : worldsEnd
      ? 'rgba(38,28,56,0.70)'
      : theme.textMuted;
  const tertiaryText = inverted
    ? 'rgba(255,255,255,0.88)'
    : worldsEnd
      ? 'rgba(38,28,56,0.82)'
      : theme.textSecondary;
  const dividerColor = inverted
    ? 'rgba(255,255,255,0.28)'
    : worldsEnd
      ? 'rgba(38,28,56,0.18)'
      : theme.border;
  const actionDark = theme.dark;
  const worldsEndLabel = worldsEnd
    ? formatChunithmWorldsEndLabel({ kanji: difficulty.kanji, star: difficulty.star })
    : undefined;
  const chartKey = library.chartKey(song.id, CHUNITHM_CHART_TYPE, difficulty.difficulty);
  const chartItem = library.data?.find((item) => item.key === chartKey);
  const practice = chartItem?.kind === 'chart' && chartItem.practice;
  const difficultyName = CHUNITHM_DIFFICULTY_LABELS[difficulty.difficulty];
  const searchQuery = `中二节奏 ${song.title} ${difficultyName} 谱面确认`;
  const rank = score ? chunithmRankFromScore(score.score) : undefined;
  const achievements = score
    ? chunithmAchievementBadges({
      fullCombo: score.full_combo,
      fullChain: score.full_chain,
      clear: score.clear,
    })
    : [];
  const content = (
    <>
      <View style={styles.chartHeader}>
        <ChunithmDifficultyBadge
          display="label"
          level={difficulty.level}
          levelIndex={difficulty.difficulty}
          worldsEndLabel={worldsEndLabel}
        />
        <View style={styles.levelBlock}>
          <Text style={[styles.level, { color: primaryText }]}>
            {worldsEnd ? worldsEndLabel : difficulty.level}
          </Text>
          <Text style={[styles.constant, { color: secondaryText }]}>
            {worldsEnd ? '—' : difficulty.levelValue.toFixed(1)}
          </Text>
        </View>
      </View>
      <View style={styles.resultBlock}>
        <Text style={[styles.scoreLabel, { color: secondaryText }]}>Score</Text>
        <ScoreValue mutedColor={secondaryText} score={score} textColor={primaryText} />
        {score && rank ? (
          <View style={styles.badgeRow}>
            <RankBadge rank={rank} />
            {achievements.map((achievement) => (
              <AchievementBadge
                key={achievement.id}
                label={achievement.label}
                testID={`chunithm-detail-${achievement.id}-${achievement.tone}`}
                tone={achievement.tone}
              />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={[styles.statLabel, { color: secondaryText }]}>Rating</Text>
          <Text style={[styles.statValue, { color: primaryText }]}>
            {formatChunithmRating(score?.rating)}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={[styles.statLabel, { color: secondaryText }]}>OVER POWER</Text>
          <Text style={[styles.statValue, { color: primaryText }]}>
            {formatOptionalValue(score?.over_power)}
          </Text>
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: dividerColor }]} />
      <Text style={[styles.charter, { color: tertiaryText }]}>
        谱师：{difficulty.noteDesigner || '未提供'}
      </Text>
      {difficulty.notes ? (
        <NotesTable
          borderColor={dividerColor}
          labelColor={secondaryText}
          levelIndex={difficulty.difficulty}
          notes={difficulty.notes}
          valueColor={primaryText}
        />
      ) : (
        <View style={styles.notesUnavailable}>
          <Text style={[styles.body, { color: secondaryText }]}>物量暂不可用</Text>
          {detailError ? (
            <Pressable accessibilityRole="button" onPress={onRetryDetail}>
              <Text
                style={[
                  styles.retryText,
                  { color: inverted ? '#FFFFFF' : worldsEnd ? visual.color : theme.accent },
                ]}
              >
                重试读取单曲详情
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
      <DetailPressable
        accessibilityLabel={practice ? '已加入练习清单' : '加入练习清单'}
        accessibilityRole="button"
        disabled={library.isUpdating}
        onPress={() => void library.setChartPractice(
          String(song.id),
          CHUNITHM_CHART_TYPE,
          difficulty.difficulty,
          !practice,
        )}
        style={[
          styles.action,
          chartActionStyle(actionDark, visual, Boolean(practice), inverted),
          library.isUpdating && styles.disabled,
        ]}
      >
        <Text
          style={[
            styles.actionText,
            chartActionTextStyle(actionDark, visual, Boolean(practice), inverted),
          ]}
        >
          {practice ? '已加入练习清单' : '加入练习清单'}
        </Text>
      </DetailPressable>
      <DetailPressable
        accessibilityLabel={`搜索谱面确认：${searchQuery}`}
        accessibilityRole="link"
        onPress={() => void openBilibiliChartSearch(searchQuery)}
        style={[
          styles.action,
          styles.chartSearchAction,
          chartActionStyle(actionDark, visual, false, inverted),
        ]}
      >
        <Text style={[styles.actionText, chartActionTextStyle(actionDark, visual, false, inverted)]}>
          搜索谱面确认
        </Text>
      </DetailPressable>
      <View
        style={[
          specialCard && styles.specialTagEditorSurface,
          specialCard && {
            backgroundColor: theme.dark
              ? 'rgba(12,9,22,0.76)'
              : 'rgba(255,255,255,0.94)',
          },
        ]}
        testID={specialCard
          ? `chunithm-special-tag-surface-${difficulty.difficulty}`
          : undefined}
      >
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
    </>
  );
  const cardStyle = [
    styles.difficultyCard,
    {
      width,
      borderColor: worldsEnd ? 'transparent' : visual.border ?? visual.color,
    },
  ];
  if (worldsEnd) {
    return (
      <GameChartResultCard
        beforeContent={(
          <View
            pointerEvents="none"
            style={[
              styles.worldsEndCardOverlay,
              { backgroundColor: 'rgba(20,14,38,0.62)' },
            ]}
            testID="chunithm-worlds-end-card-overlay"
          />
        )}
        gradient={{
          colors: CHUNITHM_WORLDS_END_GRADIENT,
          end: { x: 1, y: 0.5 },
          start: { x: 0, y: 0.5 },
        }}
        style={cardStyle}
        testID={`chunithm-detail-difficulty-${difficulty.difficulty}`}
      >
        {content}
      </GameChartResultCard>
    );
  }
  return (
    <GameChartResultCard
      style={[
        ...cardStyle,
        { backgroundColor: ultima ? visual.tint : theme.dark ? theme.surface : visual.tint },
      ]}
      testID={`chunithm-detail-difficulty-${difficulty.difficulty}`}
    >
      {content}
    </GameChartResultCard>
  );
}

function chartActionStyle(
  dark: boolean,
  visual: { color: string; tint: string; border?: string; darkAction?: string },
  filled: boolean,
  inverted = false,
) {
  const actionColor = dark ? (visual.darkAction ?? visual.color) : visual.color;
  if (inverted && !filled) {
    return { backgroundColor: 'rgba(0,0,0,0.12)', borderColor: actionColor };
  }
  if (dark) {
    return { backgroundColor: actionColor, borderColor: actionColor };
  }
  if (!filled) return { borderColor: actionColor };
  return { backgroundColor: actionColor, borderColor: actionColor };
}

function chartActionTextStyle(
  dark: boolean,
  visual: { color: string; tint: string; border?: string; darkAction?: string },
  filled: boolean,
  inverted = false,
) {
  const actionColor = dark ? (visual.darkAction ?? visual.color) : visual.color;
  if (inverted) return { color: filled ? '#FFFFFF' : actionColor };
  if (dark) return { color: '#FFFFFF' };
  return { color: filled ? '#FFFFFF' : actionColor };
}

function NotesTable({
  notes,
  levelIndex,
  borderColor,
  labelColor,
  valueColor,
}: {
  notes: NonNullable<ChunithmDifficulty['notes']>;
  levelIndex: ChunithmLevelIndex;
  borderColor?: string;
  labelColor?: string;
  valueColor?: string;
}) {
  const theme = useAppTheme();
  const showFlick = levelIndex >= 3;
  const values: readonly (readonly [string, number])[] = showFlick
    ? [
      ['TAP', notes.tap],
      ['HOLD', notes.hold],
      ['SLIDE', notes.slide],
      ['AIR', notes.air],
      ['FLICK', notes.flick],
      ['总计', notes.total],
    ]
    : [
      ['TAP', notes.tap],
      ['HOLD', notes.hold],
      ['SLIDE', notes.slide],
      ['AIR', notes.air],
      ['总计', notes.total],
    ];
  const noteGroup = {
    key: 'notes',
    values: values.map(([label, value]) => ({
      key: label.toLowerCase(),
      label,
      value,
    })),
  };
  return (
    <GameNoteTable
      accessibilityLabel="中二谱面物量"
      containerStyle={[styles.notesTable, { borderColor: borderColor ?? theme.border }]}
      group={noteGroup}
      itemStyle={styles.notesCell}
      labelStyle={[styles.notesLabel, { color: labelColor ?? theme.textMuted }]}
      mode="cells"
      valueStyle={[styles.notesValue, { color: valueColor ?? theme.text }]}
    />
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
  worldsEndCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 23,
  },
  specialTagEditorSurface: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  levelBlock: { alignItems: 'flex-end', paddingTop: 10 },
  level: { fontSize: 28, lineHeight: 31, fontWeight: '900' },
  constant: { fontSize: 11, fontWeight: '600' },
  resultBlock: { alignItems: 'flex-start', gap: 2, marginTop: 22 },
  scoreLabel: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  score: { fontSize: 34, lineHeight: 42, fontWeight: '900', letterSpacing: -0.5 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, minHeight: 29, marginTop: 7 },
  statRow: { flexDirection: 'row', marginTop: 16, gap: 24 },
  statCell: { gap: 2 },
  statLabel: { fontSize: 12, fontWeight: '700' },
  statValue: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  charter: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
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
  notesUnavailable: { minHeight: 50, marginTop: 9, alignItems: 'center', justifyContent: 'center', gap: 5 },
  retryText: { fontSize: 12, fontWeight: '800' },
  action: {
    marginTop: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#667085',
    borderRadius: 11,
    padding: 10,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  chartSearchAction: { marginTop: 0 },
  actionText: { fontWeight: '700' },
  noCharts: { padding: 24, alignItems: 'center' },
  details: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 7 },
  body: { fontSize: 13, lineHeight: 19 },
  aliasBlock: { position: 'relative', alignItems: 'stretch' },
  aliasMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 },
  aliasAction: { alignSelf: 'flex-end', paddingHorizontal: 2, paddingVertical: 3 },
  aliasActionText: { fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.52 },
});
