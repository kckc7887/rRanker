import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import {
  Defs,
  Image as SvgImage,
  Mask,
  RadialGradient,
  Rect,
  Stop,
  Svg,
} from 'react-native-svg';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { AutoScrollText } from '@/components/game-content/AutoScrollText';
import { ChartCarousel as SharedChartCarousel } from '@/components/game-content/ChartCarousel';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { SongMetadataTable, type SongMetadataItem } from '@/components/game-content/SongMetadataTable';
import { QueryStateView } from '@/components/QueryStateView';
import { useSongDetailBackNavigation } from '@/components/game-content/SongDetailNavigation';
import { SourceStatus } from '@/components/SourceStatus';
import { TagEditor } from '@/components/TagEditor';
import { MuseDashAccValue } from '@/components/musedash/MuseDashAccValue';
import { MuseDashAchievementBadge, MuseDashGradeBadge, MuseDashNeutralBadge } from '@/components/musedash/MuseDashBadges';
import { MuseDashDifficultyBadge } from '@/components/musedash/MuseDashDifficultyBadge';
import { MuseDashScoreCard } from '@/components/musedash/MuseDashScoreCard';
import { MuseDashSongRow } from '@/components/musedash/MuseDashSongRow';
import {
  MuseDashCatalogFilterBar, MuseDashRecordsFilterBar,
  type MuseDashAchievementFilter, type MuseDashDifficultySlot, type MuseDashDlcFilter,
} from '@/components/musedash/MuseDashFilterBar';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { museDashUserIdFromAccountId } from '@/domain/bound-account';
import {
  museDashCharacterName,
  museDashCoverUrl,
  museDashDiffdiffMap,
  museDashElfinName,
  museDashSongAuthor,
  museDashSongsByUid,
  museDashSongsFromAlbums,
  museDashSongTitle,
  type MuseDashAlbumsResponse,
  type MuseDashCeResponse,
  type MuseDashDiffdiffEntry,
  type MuseDashPlayer,
  type MuseDashRawScore,
  type MuseDashSong,
} from '@/domain/muse-dash';
import { museDashLevelTheme } from '@/domain/musedash-level-theme';
import { buildTagHistory } from '@/domain/user-library';
import { presentMuseDashChart } from '@/features/game-content/adapters';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import {
  useMuseDashAlbums,
  useMuseDashCe,
  useMuseDashDiffdiff,
  useMuseDashMissMap,
  useMuseDashPlayDetail,
  useMuseDashPlayer,
} from '@/hooks/use-muse-dash';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

const MUSE_DASH_CHART_TYPE = 'SD' as const;
const MASTER_LEVEL_INDEX = 2;
const CARD_GAP = 12;

function useActiveMuseDashUserId() {
  const accountId = useSession((state) => state.activeAccountId);
  return museDashUserIdFromAccountId(accountId);
}

function buildRawScores(
  player: MuseDashPlayer,
  albums: MuseDashAlbumsResponse | undefined,
  ce: MuseDashCeResponse | undefined,
  diffdiff: MuseDashDiffdiffEntry[] | undefined,
): MuseDashRawScore[] {
  const songsByUid = albums ? museDashSongsByUid(albums) : new Map();
  const constants = diffdiff ? museDashDiffdiffMap(diffdiff) : null;
  return player.plays.map((play) => {
    const joined = songsByUid.get(play.uid);
    return {
      play,
      song: joined?.song ?? null,
      albumTitle: joined?.albumTitle ?? '未知专辑',
      characterName: ce ? museDashCharacterName(ce, play.character_uid) : null,
      elfinName: ce ? museDashElfinName(ce, play.elfin_uid) : null,
      constant: constants?.get(`${play.uid}:${play.difficulty}`)?.[4],
    };
  });
}

function SearchHeader({
  accessibilityLabel, placeholder, value, onChangeText, loaded,
}: {
  accessibilityLabel: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  loaded: number;
}) {
  const theme = useAppTheme();
  return <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
    <TextInput accessibilityLabel={accessibilityLabel} placeholder={placeholder} placeholderTextColor={theme.textMuted}
      value={value} onChangeText={onChangeText}
      style={[styles.searchInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]} />
    <Text style={[styles.resultCount, { color: theme.textMuted }]}>已加载 {loaded} 条</Text>
  </View>;
}

type MuseDashBestSection = { id: string; title: string; data: MuseDashRawScore[] };

export function MuseDashBestScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const userId = useActiveMuseDashUserId();
  const player = useMuseDashPlayer(userId);
  const albums = useMuseDashAlbums();
  const ce = useMuseDashCe();
  const diffdiff = useMuseDashDiffdiff();
  const rawScores = useMemo(
    () => player.data ? buildRawScores(player.data, albums.data, ce.data, diffdiff.data) : [],
    [player.data, albums.data, ce.data, diffdiff.data],
  );
  const ordered = useMemo(() => [...rawScores]
    .sort((left, right) => {
      const leftValue = left.play.sum ?? left.play.score;
      const rightValue = right.play.sum ?? right.play.score;
      return rightValue - leftValue;
    })
    .slice(0, 30), [rawScores]);
  const sections: MuseDashBestSection[] = [{ id: 'best30', title: 'Best 30', data: ordered }];
  const loading = player.isLoading || albums.isLoading || ce.isLoading || diffdiff.isLoading;
  const error = player.error ?? albums.error ?? ce.error ?? diffdiff.error;
  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <BestListPage<MuseDashRawScore, MuseDashBestSection>
      isLoading={loading} isError={!!error} isEmpty={!loading && ordered.length === 0}
      error={error} onRetry={() => { void player.refetch(); void albums.refetch(); void ce.refetch(); void diffdiff.refetch(); }}
      emptyText={userId === null ? '请先在游戏管理中绑定喵斯快跑玩家' : '当前没有成绩'}
      data={!loading && ordered.length ? sections : undefined}
      sectionListProps={{
        testID: 'musedash-best-results-list', style: styles.list,
        contentInsetAdjustmentBehavior: 'automatic', stickySectionHeadersEnabled: false,
        contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
        scrollIndicatorInsets: { bottom: inset }, ...TAB_LIST_CACHE_PROPS,
        keyExtractor: (item) => `${item.play.uid}:${item.play.difficulty}`,
        renderSectionHeader: ({ section }) => <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
          <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{section.data.length} 条</Text>
        </View>,
        renderItem: ({ item, index }) => <MuseDashScoreCard score={item} position={index + 1} />,
      }} />
  </View>;
}

function sortRawScores(scores: MuseDashRawScore[]): MuseDashRawScore[] {
  return [...scores].sort((left, right) =>
    (right.play.sum ?? right.play.score) - (left.play.sum ?? left.play.score));
}

export function MuseDashRecordsScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const userId = useActiveMuseDashUserId();
  const player = useMuseDashPlayer(userId);
  const albums = useMuseDashAlbums();
  const ce = useMuseDashCe();
  const diffdiff = useMuseDashDiffdiff();
  const [difficultySlot, setDifficultySlot] = useState<MuseDashDifficultySlot>('all');
  const [dlc, setDlc] = useState<MuseDashDlcFilter>('all');
  const [constantMin, setConstantMin] = useState('');
  const [constantMax, setConstantMax] = useState('');
  const [accMin, setAccMin] = useState('');
  const [accMax, setAccMax] = useState('');
  const [achievement, setAchievement] = useState<MuseDashAchievementFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [filterExpanded, setFilterExpanded] = useState(true);
  const rawScores = useMemo(
    () => player.data ? buildRawScores(player.data, albums.data, ce.data, diffdiff.data) : [],
    [player.data, albums.data, ce.data, diffdiff.data],
  );
  const dlcOptions = useMemo(() => albums.data
    ? [...new Set(museDashSongsFromAlbums(albums.data).map((item) => item.albumTitle))]
    : [], [albums.data]);
  const baseFiltered = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    const minConstant = constantMin === '' ? undefined : Number(constantMin);
    const maxConstant = constantMax === '' ? undefined : Number(constantMax);
    const minAcc = accMin === '' ? undefined : Number(accMin);
    const maxAcc = accMax === '' ? undefined : Number(accMax);
    return rawScores.filter((item) => {
      if (difficultySlot !== 'all' && item.play.difficulty !== difficultySlot) return false;
      if (dlc !== 'all' && item.albumTitle !== dlc) return false;
      if (minConstant !== undefined && (item.constant === undefined || item.constant < minConstant)) return false;
      if (maxConstant !== undefined && (item.constant === undefined || item.constant > maxConstant)) return false;
      if (minAcc !== undefined && item.play.acc < minAcc) return false;
      if (maxAcc !== undefined && item.play.acc > maxAcc) return false;
      if (!normalized) return true;
      const title = item.song ? museDashSongTitle(item.song) : item.play.uid;
      return title.toLowerCase().includes(normalized)
        || (item.song ? museDashSongAuthor(item.song).toLowerCase().includes(normalized) : false)
        || item.play.uid.includes(normalized);
    });
  }, [rawScores, difficultySlot, dlc, constantMin, constantMax, accMin, accMax, keyword]);
  const missMap = useMuseDashMissMap(
    baseFiltered.map((item) => ({
      uid: item.play.uid, difficulty: item.play.difficulty, platform: item.play.platform ?? 'mobile',
    })),
    userId,
    achievement !== 'all',
  );
  const records = useMemo(() => {
    const filtered = achievement === 'all'
      ? baseFiltered
      : baseFiltered.filter((item) => {
        const miss = missMap.get(`${item.play.uid}:${item.play.difficulty}`);
        if (achievement === 'ap') return miss === 0 && item.play.acc >= 100;
        return miss === 0;
      });
    return sortRawScores(filtered);
  }, [baseFiltered, achievement, missMap]);
  const loading = player.isLoading || albums.isLoading || ce.isLoading || diffdiff.isLoading;
  const error = player.error ?? albums.error ?? ce.error ?? diffdiff.error;
  const controls = <>
    <SearchHeader accessibilityLabel="筛选喵斯快跑成绩" placeholder="搜索歌曲、作者或 uid" value={keyword}
      onChangeText={setKeyword} loaded={records.length} />
    <MuseDashRecordsFilterBar expanded={filterExpanded} difficultySlot={difficultySlot} dlc={dlc}
      constantMin={constantMin} constantMax={constantMax} accMin={accMin} accMax={accMax}
      achievement={achievement} dlcOptions={dlcOptions}
      onExpandedChange={setFilterExpanded} onDifficultySlotChange={setDifficultySlot}
      onDlcChange={setDlc} onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
      onAccMinChange={setAccMin} onAccMaxChange={setAccMax} onAchievementChange={setAchievement}
      onReset={() => {
        setDifficultySlot('all'); setDlc('all'); setConstantMin(''); setConstantMax('');
        setAccMin(''); setAccMax(''); setAchievement('all');
      }} />
  </>;
  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <RecordsListPage beforeList={controls} isLoading={loading} isError={!!error}
      isEmpty={!loading && records.length === 0} error={error} onRetry={() => { void player.refetch(); void albums.refetch(); void ce.refetch(); void diffdiff.refetch(); }}
      emptyText={userId === null ? '请先绑定喵斯快跑玩家' : '没有公开成绩'} data={records.length ? records : undefined} flatListProps={{
        testID: 'musedash-records-results-list', style: styles.list,
        contentInsetAdjustmentBehavior: 'automatic', contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
        scrollIndicatorInsets: { bottom: inset }, ...TAB_LIST_CACHE_PROPS,
        keyExtractor: (item) => `${item.play.uid}:${item.play.difficulty}`,
        renderItem: ({ item }) => <MuseDashScoreCard score={item} />,
      }} />
  </View>;
}

export function MuseDashCatalogScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const albums = useMuseDashAlbums();
  const diffdiff = useMuseDashDiffdiff();
  const [keyword, setKeyword] = useState('');
  const [filterExpanded, setFilterExpanded] = useState(true);
  const [difficultySlot, setDifficultySlot] = useState<MuseDashDifficultySlot>('all');
  const [dlc, setDlc] = useState<MuseDashDlcFilter>('all');
  const [constantMin, setConstantMin] = useState('');
  const [constantMax, setConstantMax] = useState('');
  const constants = useMemo(() => diffdiff.data ? museDashDiffdiffMap(diffdiff.data) : null, [diffdiff.data]);
  const dlcOptions = useMemo(() => albums.data
    ? [...new Set(museDashSongsFromAlbums(albums.data).map((item) => item.albumTitle))]
    : [], [albums.data]);
  const songs = useMemo(() => {
    const all = albums.data ? museDashSongsFromAlbums(albums.data) : [];
    const normalized = keyword.trim().toLowerCase();
    const minConstant = constantMin === '' ? undefined : Number(constantMin);
    const maxConstant = constantMax === '' ? undefined : Number(constantMax);
    return all.filter(({ song, albumTitle }) => {
      if (difficultySlot !== 'all' && song.difficulty[difficultySlot] === '0') return false;
      if (dlc !== 'all' && albumTitle !== dlc) return false;
      if (normalized && !museDashSongTitle(song).toLowerCase().includes(normalized)
        && !museDashSongAuthor(song).toLowerCase().includes(normalized)) return false;
      if (minConstant !== undefined || maxConstant !== undefined) {
        const inRange = constants
          ? song.difficulty.some((_, index) => {
            const constant = constants.get(`${song.uid}:${index}`)?.[4];
            return constant !== undefined
              && (minConstant === undefined || constant >= minConstant)
              && (maxConstant === undefined || constant <= maxConstant);
          })
          : false;
        if (!inRange) return false;
      }
      return true;
    });
  }, [albums.data, keyword, difficultySlot, dlc, constantMin, constantMax, constants]);
  const songConstants = useMemo(() => (item: { song: { uid: string } }) => {
    if (!constants) return undefined;
    const values: (number | undefined)[] = [];
    for (let index = 0; index < 5; index += 1) {
      const entry = constants.get(`${item.song.uid}:${index}`);
      values.push(entry?.[4]);
    }
    return values;
  }, [constants]);
  const search = <>
    <SearchHeader accessibilityLabel="搜索喵斯快跑歌曲" placeholder="搜索歌曲或作者" value={keyword}
      onChangeText={setKeyword} loaded={songs.length} />
    <MuseDashCatalogFilterBar expanded={filterExpanded} difficultySlot={difficultySlot} dlc={dlc}
      constantMin={constantMin} constantMax={constantMax} dlcOptions={dlcOptions}
      onExpandedChange={setFilterExpanded} onDifficultySlotChange={setDifficultySlot}
      onDlcChange={setDlc} onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
      onReset={() => { setDifficultySlot('all'); setDlc('all'); setConstantMin(''); setConstantMax(''); }} />
  </>;
  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <CatalogListPage beforeList={search} isLoading={albums.isLoading} isError={albums.isError}
      isEmpty={!albums.isLoading && songs.length === 0} error={albums.error}
      onRetry={() => void albums.refetch()} emptyText="没有找到喵斯快跑歌曲"
      data={songs.length ? songs : undefined} flatListProps={{
        testID: 'musedash-catalog-results-list', style: styles.list,
        contentInsetAdjustmentBehavior: 'automatic', contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
        scrollIndicatorInsets: { bottom: inset }, ...TAB_LIST_CACHE_PROPS,
        keyExtractor: (item) => item.song.uid,
        renderItem: ({ item }) => <MuseDashSongRow song={item.song} albumTitle={item.albumTitle}
          constants={songConstants(item)} />,
      }} />
  </View>;
}

type MuseDashChartSlot = { difficultyIndex: number; level: string };

function MuseDashChartCard({
  songId, song, albumTitle, constant, slot, score, library, width,
}: {
  songId: string;
  song: MuseDashSong;
  albumTitle: string;
  constant?: number;
  slot: MuseDashChartSlot;
  score?: MuseDashRawScore;
  library: ReturnType<typeof useUserLibrary>;
  width: number;
}) {
  const theme = useAppTheme();
  const userId = useActiveMuseDashUserId();
  const detail = useMuseDashPlayDetail(
    score ? score.play.uid : null,
    score ? score.play.difficulty : null,
    score ? (score.play.platform ?? 'mobile') : null,
    userId,
  );
  const chart = presentMuseDashChart({ song, albumTitle, difficultyIndex: slot.difficultyIndex, constant }, score, detail.data);
  const visual = museDashLevelTheme(slot.difficultyIndex);
  const chartItem = library.data?.find((item) => item.key === library.chartKey(songId, MUSE_DASH_CHART_TYPE, slot.difficultyIndex));
  const practice = chartItem?.kind === 'chart' && chartItem.practice;
  const actionColor = theme.dark ? visual.darkAction : visual.lightAction;
  const actionFilled = theme.dark || practice;
  return (
    <GameChartResultCard
      style={[styles.chartCard, { width, backgroundColor: theme.dark ? theme.surface : visual.tint, borderColor: visual.border }]}
      testID={`musedash-chart-${slot.difficultyIndex}`}
      accessibilityLabel={`${chart.difficulty.label} 难度卡片`}
    >
      <View style={styles.chartHeader}>
        <MuseDashDifficultyBadge display="label" level={slot.level} levelIndex={slot.difficultyIndex} />
        <View style={styles.levelBlock}>
          <Text style={[styles.level, { color: theme.text }]}>{slot.level}</Text>
          <Text style={[styles.constant, { color: theme.textMuted }]}>{chart.difficulty.value ?? '—'}</Text>
        </View>
      </View>
      <View style={styles.resultBlock}>
        <Text style={[styles.resultLabel, { color: theme.textMuted }]}>ACC</Text>
        <MuseDashAccValue acc={score?.play.acc} style={styles.chartAcc} />
        {chart.grade || chart.achievementRows.length ? (
          <View style={styles.badgeRow}>
            {chart.grade ? <MuseDashGradeBadge label={chart.grade.label} tone={chart.grade.tone} /> : null}
            {chart.achievementRows.flat().map((badge) => (
              badge.key === 'achievement'
                ? <MuseDashAchievementBadge key={badge.key} label={badge.label} tone={badge.tone} />
                : <MuseDashNeutralBadge key={badge.key} label={badge.label} />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.statRow}>
        <View style={styles.statCell}>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>Rating</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {chart.secondaryMetrics.find((metric) => metric.key === 'rating')?.text ?? '—'}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>排名</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {chart.secondaryMetrics.find((metric) => metric.key === 'rank')?.text ?? '—'}
          </Text>
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <Text style={[styles.charter, { color: theme.textSecondary }]}>谱师：{chart.charter}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={practice ? '已加入练习清单' : '加入练习清单'}
        disabled={library.isUpdating}
        onPress={() => void library.setChartPractice(songId, MUSE_DASH_CHART_TYPE, slot.difficultyIndex, !practice)}
        style={({ pressed }) => [
          styles.action,
          actionFilled
            ? { backgroundColor: actionColor, borderColor: actionColor }
            : { backgroundColor: 'transparent', borderColor: actionColor },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Text style={[styles.actionText, { color: actionFilled ? '#FFFFFF' : actionColor }]}>
          {practice ? '已加入练习清单' : '加入练习清单'}
        </Text>
      </Pressable>
      <TagEditor
        tags={chartItem?.tags ?? []}
        presets={library.tagPresets ?? []}
        historyTags={buildTagHistory(library.data ?? [], library.chartKey(songId, MUSE_DASH_CHART_TYPE, slot.difficultyIndex), library.tagPresets ?? [])}
        disabled={library.isUpdating}
        onPresetsChange={library.setTagPresets}
        testID={`musedash-chart-local-tags-${slot.difficultyIndex}`}
        onChange={(tags) => library.setTags({ kind: 'chart', songId, type: MUSE_DASH_CHART_TYPE, levelIndex: slot.difficultyIndex }, tags)}
      />
    </GameChartResultCard>
  );
}

export function MuseDashSongDetailScreen({ songId, levelIndex }: { songId: string; levelIndex?: number }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigateBack = useSongDetailBackNavigation();
  const albums = useMuseDashAlbums();
  const diffdiff = useMuseDashDiffdiff();
  const ce = useMuseDashCe();
  const userId = useActiveMuseDashUserId();
  const player = useMuseDashPlayer(userId);
  const library = useUserLibrary();
  const joined = useMemo(() => {
    if (!albums.data) return null;
    return museDashSongsByUid(albums.data).get(songId) ?? null;
  }, [albums.data, songId]);
  const constants = useMemo(() => diffdiff.data ? museDashDiffdiffMap(diffdiff.data) : null, [diffdiff.data]);
  const scoreByDifficulty = useMemo(() => {
    if (!player.data) return new Map<number, MuseDashRawScore>();
    const map = new Map<number, MuseDashRawScore>();
    for (const raw of buildRawScores(player.data, albums.data, ce.data, diffdiff.data)) {
      if (raw.play.uid !== songId) continue;
      const previous = map.get(raw.play.difficulty);
      if (!previous || (raw.play.sum ?? 0) > (previous.play.sum ?? 0)) map.set(raw.play.difficulty, raw);
    }
    return map;
  }, [player.data, albums.data, ce.data, diffdiff.data, songId]);
  const chartSlots = useMemo(() => joined
    ? joined.song.difficulty.flatMap((level, difficultyIndex) =>
      level === '0' ? [] : [{ difficultyIndex, level }]).reverse()
    : [], [joined]);
  const defaultIndex = useMemo(() => {
    if (!chartSlots.length) return 0;
    const masterIndex = chartSlots.findIndex((slot) => slot.difficultyIndex === MASTER_LEVEL_INDEX);
    if (masterIndex >= 0) return masterIndex;
    const fallback = chartSlots.find((slot) => slot.difficultyIndex <= MASTER_LEVEL_INDEX);
    return fallback ? chartSlots.indexOf(fallback) : 0;
  }, [chartSlots]);
  const requestedIndex = levelIndex === undefined
    ? -1
    : chartSlots.findIndex((slot) => slot.difficultyIndex === levelIndex);
  const initialIndex = requestedIndex >= 0 ? requestedIndex : defaultIndex;
  const metadata: SongMetadataItem[] = joined ? [
    { key: 'bpm', label: 'BPM', value: joined.song.bpm || '—', flex: 1 },
    { key: 'album', label: 'DLC 来源', value: joined.albumTitle, flex: 2 },
  ] : [];
  const loading = albums.isLoading || player.isLoading;
  const error = albums.error ?? player.error;
  const cardWidth = Math.max(280, width - 40);
  return <>
    <StatusBar style="light" />
    <Pressable accessibilityRole="button" accessibilityLabel="返回" hitSlop={12}
      onPress={navigateBack}
      style={({ pressed }) => [
        styles.headerButton, styles.headerFloatingButton, { top: insets.top, left: 8 },
        Platform.OS !== 'ios' && styles.headerButtonBg, pressed && { opacity: 0.7 },
      ]}>
      <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} color="#FFFFFF" size={28} />
    </Pressable>
    <QueryStateView isLoading={loading} isError={!!error} isEmpty={!joined}
    error={error} onRetry={() => { void albums.refetch(); void player.refetch(); }}
    emptyText="未找到该喵斯快跑歌曲" data={joined}
    renderData={() => <ScrollView keyboardShouldPersistTaps="handled" style={[styles.page, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.detail}>
      <View style={[styles.hero, { width, height: width }]}>
        <MuseDashHeroCover song={joined!.song} width={width} />
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.48)']}
          locations={[0, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.heroCopy}>
          <Text numberOfLines={1} style={styles.songId}>#{joined!.song.uid}</Text>
          <AutoScrollText testID="musedash-song-title-scroll" text={museDashSongTitle(joined!.song)}
            textStyle={styles.title} style={styles.singleLine} contentContainerStyle={styles.singleLineContent} />
          <Text numberOfLines={1} style={styles.artist}>{museDashSongAuthor(joined!.song)}</Text>
        </View>
      </View>
      <SongMetadataTable accessibilityLabel="喵斯快跑歌曲信息" cellRootStyle={styles.metadataCellRoot}
        cellStyle={styles.metadataCell} interaction="platform-detail" items={metadata}
        labelStyle={styles.metadataLabel} measureStyle={styles.metadataMeasure} style={styles.metadata}
        testIDPrefix="musedash-song-metadata" valueBlockStyle={styles.metadataValueBlock}
        valueStyle={styles.metadataValue} />
      <SharedChartCarousel
        accessibilityLabel="难度卡片"
        cardWidth={cardWidth}
        contentContainerStyle={styles.carousel}
        empty={<View style={styles.noCharts}><Text style={styles.meta}>暂无可用难度</Text></View>}
        gap={CARD_GAP}
        initialIndex={initialIndex}
        items={chartSlots}
        keyExtractor={(slot) => `${songId}:${slot.difficultyIndex}`}
        renderItem={(slot) => <MuseDashChartCard songId={songId} song={joined!.song} albumTitle={joined!.albumTitle}
          constant={constants?.get(`${songId}:${slot.difficultyIndex}`)?.[4]} slot={slot}
          score={scoreByDifficulty.get(slot.difficultyIndex)} library={library} width={cardWidth} />}
        rootStyle={styles.carouselRoot}
        scrollStyle={styles.carouselScroll}
        testID="musedash-chart-carousel"
      />
      <View style={styles.details}>
        <SourceStatus items={[{
          key: 'scores', label: 'MuseDash.moe', updatedAt: player.source?.updatedAt,
          state: player.source ? (player.source.isStale ? 'cache' : 'live') : 'unavailable',
        }]} />
      </View>
    </ScrollView>} />
  </>;
}

function MuseDashHeroCover({ song, width }: { song: MuseDashSong; width: number }) {
  const [failed, setFailed] = useState(false);
  const url = museDashCoverUrl(song.cover);
  if (!url || failed) {
    return <View style={[styles.heroPlaceholder, { backgroundColor: '#D1D5DB' }]}>
      <Text style={styles.heroPlaceholderNote}>♪</Text>
    </View>;
  }
  return (
    <>
      <Image source={url} style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.45 }] }]}
        contentFit="cover" blurRadius={40} transition={120}
        onError={() => setFailed(true)} />
      <Svg width={width} height={width} style={styles.heroSvg}>
        <Defs>
          <RadialGradient id="musedash-cover-feather" cx="50%" cy="50%" r="50%">
            <Stop offset="85%" stopColor="#FFFFFF" stopOpacity={1} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
          <Mask id="musedash-cover-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={width}>
            <Rect x={0} y={0} width={width} height={width} fill="url(#musedash-cover-feather)" />
          </Mask>
        </Defs>
        <SvgImage x={0} y={0} width={width} height={width} href={url}
          preserveAspectRatio="xMidYMid slice" mask="url(#musedash-cover-mask)" />
      </Svg>
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, list: { flex: 1 }, listContent: { padding: 12, gap: 9 },
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerFloatingButton: { position: 'absolute', zIndex: 30, elevation: 30 },
  headerButtonBg: { backgroundColor: 'rgba(17,24,39,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  sectionHeader: { marginTop: 8, marginBottom: 3, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: 18, fontWeight: '900' }, sectionCount: { fontSize: 11 },
  searchWrap: { padding: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInput: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 }, resultCount: { fontSize: 11 },
  detail: { paddingBottom: 32 },
  hero: { position: 'relative', backgroundColor: '#D1D5DB', overflow: 'hidden' },
  heroSvg: { position: 'absolute', top: 0, left: 0 },
  heroPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  heroPlaceholderNote: { color: '#6B7280', fontSize: 60 },
  heroCopy: { position: 'absolute', left: 20, right: 20, bottom: 18, gap: 3 },
  singleLine: { flexGrow: 0 },
  singleLineContent: { paddingRight: 18 },
  songId: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  title: {
    color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8,
  },
  artist: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  metadata: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  metadataCellRoot: { minWidth: 0 },
  metadataCell: { minWidth: 0, alignItems: 'center', paddingHorizontal: 4, gap: 3 },
  metadataLabel: { fontSize: 10, fontWeight: '800' },
  metadataValueBlock: { position: 'relative', minWidth: 0, alignSelf: 'stretch' },
  metadataMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 },
  metadataValue: { fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  carouselRoot: { flexGrow: 0 },
  carouselScroll: { flexGrow: 0, marginTop: 14 },
  carousel: { paddingHorizontal: 20, gap: CARD_GAP, paddingBottom: 4 },
  noCharts: { padding: 24, alignItems: 'center' },
  chartCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#1A2232', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  levelBlock: { alignItems: 'flex-end', paddingTop: 10 },
  level: { fontSize: 28, lineHeight: 31, fontWeight: '900' },
  constant: { fontSize: 11, fontWeight: '600' },
  resultBlock: { alignItems: 'flex-start', gap: 2, marginTop: 22 },
  resultLabel: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  chartAcc: { fontSize: 34, lineHeight: 42, letterSpacing: -0.5 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, minHeight: 29, marginTop: 7 },
  statRow: { flexDirection: 'row', marginTop: 16, gap: 24 },
  statCell: { gap: 2 },
  statLabel: { fontSize: 12, fontWeight: '700' },
  statValue: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  charter: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  action: {
    marginTop: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: 11,
    padding: 10,
    alignItems: 'center',
  },
  actionText: { fontWeight: '700' },
  details: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  meta: { color: '#6B7280', fontSize: 12 },
});
