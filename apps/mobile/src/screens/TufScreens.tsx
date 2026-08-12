import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  useWindowDimensions, View, type ImageSourcePropType,
} from 'react-native';
import { AutoScrollText } from '@/components/game-content/AutoScrollText';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { SongMetadataTable, type SongMetadataItem } from '@/components/game-content/SongMetadataTable';
import { SongDetailChrome } from '@/components/game-content/SongDetailChrome';
import { Card } from '@/components/Card';
import { BestImageEntryButton } from '@/components/BestImageEntryButton';
import { TagEditor } from '@/components/TagEditor';
import { TufScoreCard, TufWorldAchievementBadge } from '@/components/adofai/TufScoreCard';
import { TufSongRow } from '@/components/adofai/TufSongRow';
import { TufDifficultyBadge } from '@/components/adofai/TufDifficultyBadge';
import {
  TufCatalogFilterBar, TufRecordsFilterBar, type TufDifficultyBand, type TufPassAchievementFilter,
} from '@/components/adofai/TufFilterBar';
import { QueryStateView } from '@/components/QueryStateView';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { tufPlayerIdFromAccountId } from '@/domain/bound-account';
import {
  filterTufPasses,
  selectTufTopPasses,
  tufDifficultyBounds,
  tufDifficultyVisual,
  tufMediaImageCandidates,
  tufPguRange,
  tufTagIconUrl,
  type TufJudgements,
  type TufLevel,
  type TufLevelSort,
  type TufPass,
  type TufPassSort,
  type TufSortOrder,
} from '@/domain/tuf';
import { buildTagHistory } from '@/domain/user-library';
import { presentTufChart } from '@/features/game-content/adapters';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import {
  useTufDifficulties,
  useTufLevel,
  useTufLevelBestPass,
  useTufLevelSearch,
  useTufPasses,
  useTufProfile,
  useTufVideoDetails,
} from '@/hooks/use-tuf';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

const ADOFAI_ICON = require('../../assets/images/adofai.png') as ImageSourcePropType;

function useActiveTufPlayerId() {
  const accountId = useSession((state) => state.activeAccountId);
  return tufPlayerIdFromAccountId(accountId);
}

function LoadingFooter({ loading }: { loading: boolean }) {
  return loading ? <ActivityIndicator style={styles.footer} /> : null;
}

function uniqueById<T extends { id: number }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function SearchHeader({
  accessibilityLabel, placeholder, value, onChangeText, loaded, total,
}: {
  accessibilityLabel: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  loaded: number;
  total?: number;
}) {
  const theme = useAppTheme();
  return <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
    <TextInput accessibilityLabel={accessibilityLabel} placeholder={placeholder} placeholderTextColor={theme.textMuted}
      value={value} onChangeText={onChangeText}
      style={[styles.searchInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]} />
    <Text style={[styles.resultCount, { color: theme.textMuted }]}>已加载 {loaded}{total == null ? '' : ` / ${total}`} 条</Text>
  </View>;
}

type TufBestSection = { id: string; title: string; data: TufPass[] };

export function TufBestScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const playerId = useActiveTufPlayerId();
  const profile = useTufProfile(playerId);
  const passes = useTufPasses(playerId, { sortBy: 'impact', order: 'DESC', bestPerLevel: true });
  const allPasses = passes.data?.pages.flatMap((page) => page.passes) ?? [];
  const top = selectTufTopPasses(profile.data?.topScores ?? [], allPasses);
  const ordered = top.passes;
  const missing = top.missing;
  const sections: TufBestSection[] = [{ id: 'top20', title: 'Top 20 Impact', data: ordered }];
  const loading = profile.isLoading || passes.isLoading;
  const error = profile.error ?? passes.error;
  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <BestListPage<TufPass, TufBestSection>
      isLoading={loading} isError={!!error} isEmpty={!loading && ordered.length === 0}
      error={error} onRetry={() => { void profile.refetch(); void passes.refetch(); }}
      emptyText={playerId === null ? '请先在游戏管理中绑定 TUF 玩家' : '当前公开资料没有 Top 20 成绩'}
      data={!loading && ordered.length ? sections : undefined}
      sectionListProps={{
        testID: 'tuf-best-results-list', style: styles.list,
        contentInsetAdjustmentBehavior: 'automatic', stickySectionHeadersEnabled: false,
        contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
        scrollIndicatorInsets: { bottom: inset }, ...TAB_LIST_CACHE_PROPS,
        keyExtractor: (item) => String(item.id),
        renderSectionHeader: ({ section }) => <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
          <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{section.data.length} 条</Text>
        </View>,
        ListHeaderComponent: <View>
          <BestImageEntryButton label="导出 Top20 图片" />
          {missing > 0 ? <Text style={[styles.notice, { color: theme.textMuted }]}>有 {missing} 条 Top 记录未公开，已跳过。</Text> : null}
        </View>,
        renderItem: ({ item, index }) => <TufScoreCard pass={item} position={index + 1} />,
      }} />
  </View>;
}

export function TufRecordsScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const playerId = useActiveTufPlayerId();
  const [sortBy, setSortBy] = useState<TufPassSort>('date');
  const [order, setOrder] = useState<TufSortOrder>('DESC');
  const [bestPerLevel, setBestPerLevel] = useState(false);
  const [difficultyBand, setDifficultyBand] = useState<TufDifficultyBand>('all');
  const [difficultyMin, setDifficultyMin] = useState('');
  const [difficultyMax, setDifficultyMax] = useState('');
  const [includeSpecial, setIncludeSpecial] = useState(true);
  const [achievement, setAchievement] = useState<TufPassAchievementFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [filterExpanded, setFilterExpanded] = useState(false);
  const debounced = useDebouncedValue(keyword, 350);
  const query = useTufPasses(playerId, { sortBy, order, bestPerLevel, query: debounced.trim() || undefined });
  const difficultyBounds = tufDifficultyBounds(difficultyMin, difficultyMax);
  const localFilterActive = difficultyBand !== 'all' || difficultyMin !== '' || difficultyMax !== ''
    || !includeSpecial || achievement !== 'all';
  const fetchNextRecordsPage = query.fetchNextPage;
  const recordsHaveNextPage = query.hasNextPage;
  const recordsFetchingNextPage = query.isFetchingNextPage;
  const recordsNextPageFailed = query.isFetchNextPageError;
  useEffect(() => {
    if (localFilterActive && recordsHaveNextPage && !recordsFetchingNextPage && !recordsNextPageFailed) {
      void fetchNextRecordsPage();
    }
  }, [fetchNextRecordsPage, localFilterActive, recordsFetchingNextPage, recordsHaveNextPage, recordsNextPageFailed]);
  const loadedRecords = uniqueById(query.data?.pages.flatMap((page) => page.passes) ?? []);
  const records = filterTufPasses(loadedRecords, {
    band: difficultyBand,
    ...difficultyBounds,
    includeSpecial,
  }, achievement);
  const total = localFilterActive && !query.hasNextPage ? records.length : query.data?.pages[0]?.total;
  const controls = <>
    <SearchHeader accessibilityLabel="筛选 TUF 成绩" placeholder="搜索关卡、歌曲或作者" value={keyword}
      onChangeText={setKeyword} loaded={records.length} total={total} />
    <TufRecordsFilterBar expanded={filterExpanded} sortBy={sortBy} order={order} bestPerLevel={bestPerLevel}
      difficultyBand={difficultyBand} difficultyMin={difficultyMin} difficultyMax={difficultyMax}
      includeSpecial={includeSpecial} achievement={achievement}
      onExpandedChange={setFilterExpanded} onSortByChange={setSortBy} onOrderChange={setOrder}
      onBestPerLevelChange={setBestPerLevel} onDifficultyBandChange={setDifficultyBand}
      onDifficultyMinChange={setDifficultyMin} onDifficultyMaxChange={setDifficultyMax}
      onIncludeSpecialChange={setIncludeSpecial} onAchievementChange={setAchievement} onReset={() => {
        setSortBy('date'); setOrder('DESC'); setBestPerLevel(false); setDifficultyBand('all');
        setDifficultyMin(''); setDifficultyMax(''); setIncludeSpecial(true); setAchievement('all');
      }} />
  </>;
  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <RecordsListPage<TufPass> beforeList={controls} isLoading={query.isLoading} isError={query.isError}
      isEmpty={!query.isLoading && records.length === 0} error={query.error}
      onRetry={() => void query.refetch()} emptyText={playerId === null ? '请先绑定 TUF 玩家' : '没有公开成绩'}
      data={records.length ? records : undefined} flatListProps={{
        testID: 'tuf-records-results-list', style: styles.list,
        contentInsetAdjustmentBehavior: 'automatic', contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
        scrollIndicatorInsets: { bottom: inset }, ...TAB_LIST_CACHE_PROPS,
        keyExtractor: (item) => String(item.id), renderItem: ({ item }) => <TufScoreCard pass={item} />,
        onEndReachedThreshold: 0.35, onEndReached: () => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); },
        ListFooterComponent: <LoadingFooter loading={query.isFetchingNextPage} />,
      }} />
  </View>;
}

export function TufSearchScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const [keyword, setKeyword] = useState('');
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<TufLevelSort>('RECENT');
  const [order, setOrder] = useState<TufSortOrder>('DESC');
  const [difficultyBand, setDifficultyBand] = useState<TufDifficultyBand>('all');
  const [difficultyMin, setDifficultyMin] = useState('');
  const [difficultyMax, setDifficultyMax] = useState('');
  const [includeSpecial, setIncludeSpecial] = useState(true);
  const debounced = useDebouncedValue(keyword, 350);
  const difficulties = useTufDifficulties();
  const specialDifficulties = difficulties.data?.filter((item) => item.type !== 'PGU').map((item) => item.name) ?? [];
  const difficultyBounds = tufDifficultyBounds(difficultyMin, difficultyMax);
  const pguRange = tufPguRange({ band: difficultyBand, ...difficultyBounds });
  const query = useTufLevelSearch(debounced, {
    sort: sortBy, order, pguRange,
    specialDifficulties: includeSpecial && specialDifficulties.length
      ? specialDifficulties
      : undefined,
  });
  const levels = uniqueById(query.data?.pages.flatMap((page) => page.results) ?? []);
  const total = query.data?.pages[0]?.total;
  const search = <>
    <SearchHeader accessibilityLabel="搜索 TUF 关卡" placeholder="搜索关卡、歌曲或作者" value={keyword}
      onChangeText={setKeyword} loaded={levels.length} total={total} />
    <TufCatalogFilterBar expanded={filterExpanded} sortBy={sortBy} order={order} difficultyBand={difficultyBand}
      difficultyMin={difficultyMin} difficultyMax={difficultyMax}
      includeSpecial={includeSpecial} specialAvailable={specialDifficulties.length > 0}
      onExpandedChange={setFilterExpanded} onSortByChange={setSortBy} onOrderChange={setOrder}
      onDifficultyBandChange={setDifficultyBand} onDifficultyMinChange={setDifficultyMin}
      onDifficultyMaxChange={setDifficultyMax} onIncludeSpecialChange={setIncludeSpecial}
      onReset={() => {
        setSortBy('RECENT'); setOrder('DESC'); setDifficultyBand('all'); setDifficultyMin('');
        setDifficultyMax(''); setIncludeSpecial(true);
      }} />
  </>;
  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <CatalogListPage beforeList={search} isLoading={query.isLoading} isError={query.isError}
      isEmpty={!query.isLoading && levels.length === 0} error={query.error} onRetry={() => void query.refetch()}
      emptyText="没有找到 TUF 关卡" data={levels.length ? levels : undefined} flatListProps={{
        testID: 'tuf-catalog-results-list', style: styles.list,
        contentInsetAdjustmentBehavior: 'automatic', contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
        scrollIndicatorInsets: { bottom: inset }, ...TAB_LIST_CACHE_PROPS,
        keyExtractor: (item) => String(item.id), renderItem: ({ item }) => <TufSongRow level={item} />,
        onEndReachedThreshold: 0.35, onEndReached: () => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); },
        ListFooterComponent: <LoadingFooter loading={query.isFetchingNextPage} />,
      }} />
  </View>;
}

function TufLevelHero({ level }: { level: TufLevel }) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const media = useTufVideoDetails(level.videoLink);
  const mediaCandidates = useMemo(
    () => tufMediaImageCandidates(media.data?.image, undefined),
    [media.data?.image],
  );
  const candidates = useMemo(
    () => tufMediaImageCandidates(media.data?.image, level.difficulty?.icon),
    [media.data?.image, level.difficulty?.icon],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  useEffect(() => setCandidateIndex(0), [candidates]);
  const candidate = candidates[candidateIndex];
  const mediaActive = candidateIndex < mediaCandidates.length;

  return <View testID="tuf-level-hero" style={[styles.hero, { width, height: width }]}>
    {mediaActive && candidate ? <Image accessibilityLabel={`关卡头图 ${level.song}`}
      cachePolicy="disk" contentFit="cover" onError={() => setCandidateIndex((index) => index + 1)}
      source={candidate} style={StyleSheet.absoluteFillObject} transition={120} /> : (
      <LinearGradient colors={theme.dark ? ['#173346', '#3C416A', '#532A2C'] : ['#DDF6FF', '#E5E7F7', '#FFE2DF']}
        end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFillObject}>
        <Image accessibilityLabel={`关卡备用图 ${level.song}`} cachePolicy="disk" contentFit="contain"
          onError={candidate ? () => setCandidateIndex((index) => index + 1) : undefined}
          source={candidate ?? ADOFAI_ICON} style={styles.heroFallbackImage} transition={120} />
      </LinearGradient>
    )}
    <LinearGradient pointerEvents="none" colors={['rgba(10,18,28,0.02)', 'rgba(10,18,28,0.84)']}
      locations={[0.15, 1]} style={StyleSheet.absoluteFillObject} />
    <View style={styles.heroCopy}>
      <Text numberOfLines={1} style={styles.heroId}>#{level.id}</Text>
      <AutoScrollText contentContainerStyle={styles.heroScrollContent} style={styles.heroScroll}
        testID="tuf-level-title-scroll" text={level.song} textStyle={styles.heroTitle} />
      <AutoScrollText contentContainerStyle={styles.heroScrollContent} style={styles.heroScroll}
        testID="tuf-level-artist-scroll" text={level.artist || '艺术家未知'} textStyle={styles.heroArtist} />
    </View>
  </View>;
}

const TUF_JUDGEMENT_ROWS = [
  [
    { key: 'ePerfect', label: '精快!', color: '#F2DC4B' },
    { key: 'perfect', label: '完美!', color: '#45D483' },
    { key: 'lPerfect', label: '稍慢!', color: '#F2DC4B' },
  ],
  [
    { key: 'earlyDouble', label: '太快!!', color: '#FF314A' },
    { key: 'earlySingle', label: '太快!', color: '#FF6547' },
    { key: 'lateSingle', label: '太慢!', color: '#FF6547' },
    { key: 'lateDouble', label: '太慢!!', color: '#FF314A' },
  ],
] as const satisfies readonly (readonly { key: keyof TufJudgements; label: string; color: string }[])[];

function TufUpstreamTag({ name }: { name: string }) {
  const theme = useAppTheme();
  const icon = tufTagIconUrl(name);
  const [iconFailed, setIconFailed] = useState(false);
  useEffect(() => setIconFailed(false), [icon]);
  return <View accessibilityLabel={`标签 ${name}`}
    style={[styles.upstreamTag, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
    {icon && !iconFailed ? <Image accessibilityLabel={`${name} 标签图标`} cachePolicy="disk" contentFit="contain"
      onError={() => setIconFailed(true)} source={icon} style={styles.upstreamTagIcon} /> : null}
    <Text numberOfLines={1} style={[styles.upstreamTagText, { color: theme.textSecondary }]}>{name}</Text>
  </View>;
}

function TufJudgementTable({ judgements, total }: { judgements: TufJudgements | null | undefined; total: number | null }) {
  const theme = useAppTheme();
  return <View accessibilityLabel="TUF 判定详情" style={styles.judgementPanel}>
    <View style={styles.judgementMatrix}>{TUF_JUDGEMENT_ROWS.map((row, rowIndex) => (
      <View key={rowIndex} style={styles.judgementRow}>{row.map((item) => (
        <View key={item.key} style={styles.judgementCell} testID={`tuf-judgement-${item.key}`}>
          <Text numberOfLines={1} style={[styles.judgementLabel, { color: theme.dark ? '#9B98B7' : theme.textMuted }]}>{item.label}</Text>
          <Text style={[styles.judgementValue, { color: item.color }]}>{judgements?.[item.key] ?? '—'}</Text>
        </View>
      ))}</View>
    ))}</View>
    <View style={[styles.totalCell, { borderLeftColor: theme.dark ? 'rgba(255,255,255,0.12)' : theme.border }]}>
      <Text style={[styles.totalLabel, { color: theme.dark ? '#9B98B7' : theme.textMuted }]}>总物量</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1}
        style={[styles.totalValue, { color: theme.text }]}>{total ?? '—'}</Text>
    </View>
  </View>;
}

export function TufLevelDetailScreen({ levelId }: { levelId: string }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const playerId = useActiveTufPlayerId();
  const numericId = /^\d+$/.test(levelId) ? Number(levelId) : null;
  const query = useTufLevel(numericId);
  const level = query.data?.level;
  const scoreQuery = useTufLevelBestPass(level?.id ?? null, playerId);
  const bestPass = scoreQuery.data;
  const chart = level ? presentTufChart(level) : null;
  const library = useUserLibrary();
  const songItem = level ? library.data?.find((item) => item.key === library.songKey(level.id)) : undefined;
  const favorite = songItem?.kind === 'song' && songItem.favorite;
  const favoriteDisabled = library.isLoading || library.isUpdating;
  const onToggleFavorite = level
    ? () => void library.setSongFavorite(String(level.id), !favorite)
    : undefined;
  const localTags = level ? (songItem?.kind === 'song' ? songItem.tags : []) : [];
  const tags = level?.tags.map((tag) => typeof tag === 'string' ? tag : tag.name) ?? [];
  const credits = level?.levelCredits.map((credit) => `${credit.creator.name}（${credit.role}）`).join('、') || '—';
  const metadata: SongMetadataItem[] = level ? [
    { key: 'bpm', label: 'BPM', value: level.bpm == null ? '—' : String(level.bpm), flex: 1 },
    { key: 'duration', label: '时长', value: level.levelLengthInMs == null ? '—' : `${(level.levelLengthInMs / 1000).toFixed(1)} 秒`, flex: 1 },
  ] : [];
  const communityStats = level ? [
    level.clears == null ? null : `通关 ${level.clears}`,
    level.uniqueClears == null ? null : `玩家 ${level.uniqueClears}`,
    level.likes == null ? null : `喜欢 ${level.likes}`,
    level.downloadCount == null ? null : `下载 ${level.downloadCount}`,
  ].filter(Boolean).join(' · ') || (level.stats ? JSON.stringify(level.stats) : '—') : '—';
  const difficultyName = level?.difficulty?.name ?? 'Unranked';
  const difficultyVisual = tufDifficultyVisual(level?.difficulty);
  const difficultyMatch = difficultyName.trim().toUpperCase().match(/^([PGU])(\d{1,2})$/);
  const difficultyNumber = difficultyMatch?.[2] ?? '—';
  const baseScore = level?.baseScore ?? level?.difficulty?.baseScore;
  const judgementValues = bestPass?.judgements
    ? TUF_JUDGEMENT_ROWS.flatMap((row) => row.map((item) => bestPass.judgements?.[item.key]))
    : [];
  const judgementTotal = judgementValues.length > 0 && judgementValues.every((value) => typeof value === 'number')
    ? judgementValues.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
  const total = level?.tilecount ?? level?.autoTileCount ?? judgementTotal;
  return <>
    <SongDetailChrome
      topInset={insets.top + 8}
      backStyle={(pressed) => [
        styles.headerButton, styles.headerFloatingButton, { top: insets.top + 8, left: 8 },
        Platform.OS !== 'ios' && styles.headerButtonBg, pressed && { opacity: 0.7 },
      ]}
      favorite={onToggleFavorite && level ? {
        label: favorite ? `取消收藏 ${level.song}` : `收藏 ${level.song}`,
        active: favorite,
        disabled: favoriteDisabled,
        onPress: onToggleFavorite,
      } : undefined}
      favoriteStyle={(pressed) => [
        styles.headerButton, styles.headerFloatingButton, { top: insets.top + 8, right: 8 },
        favorite && styles.headerFavoriteActive,
        Platform.OS !== 'ios' && styles.headerButtonBg,
        Platform.OS !== 'ios' && favorite && styles.headerFavoriteActiveBg,
        pressed && { opacity: 0.7 },
      ]}
    />
    <QueryStateView isLoading={query.isLoading} isError={query.isError} isEmpty={!level}
      error={query.error} onRetry={() => void query.refetch()} emptyText="未找到该 TUF 关卡" data={level}
      renderData={() => <ScrollView automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"
        testID="tuf-level-detail-scroll" style={[styles.page, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.detail}>
        <TufLevelHero level={level!} />
        <SongMetadataTable accessibilityLabel="TUF 关卡信息" items={metadata} testIDPrefix="tuf-level-metadata"
          interaction="platform-detail" style={styles.metadata} cellRootStyle={styles.metadataCellRoot}
          cellStyle={styles.metadataCell} labelStyle={styles.metadataLabel} valueStyle={styles.metadataValue}
          valueBlockStyle={styles.metadataBlock} measureStyle={styles.metadataMeasure} />
        <View style={styles.detailBody}>
          <GameChartResultCard style={[styles.chartCard, {
            backgroundColor: theme.surface,
            borderColor: difficultyVisual?.border ?? theme.border,
          }]}
            gradient={difficultyVisual ? {
              colors: [`${difficultyVisual.background}${theme.dark ? '66' : '38'}`, theme.surface],
              start: { x: 0, y: 0 }, end: { x: 1, y: 1 },
            } : undefined}
            testID="tuf-level-chart" accessibilityLabel={`难度 ${chart!.difficulty.label}`}>
            <View style={styles.chartHeader}>
              <TufDifficultyBadge difficulty={chart!.difficulty} display="band" source={level!.difficulty} />
              <View style={styles.levelBlock}>
                <Text style={[styles.levelNumber, { color: theme.text }]}>{difficultyNumber}</Text>
                <Text style={[styles.baseScore, { color: theme.textMuted }]}>{baseScore == null ? '—' : baseScore.toFixed(2)}</Text>
              </View>
            </View>
            <View style={styles.resultBlock}>
              <Text style={[styles.resultLabel, { color: theme.textMuted }]}>Score</Text>
              <View style={styles.scoreValueRow}>
                <Text style={[styles.resultScore, { color: theme.text }]}>{bestPass ? bestPass.scoreV2.toFixed(2) : '—'}</Text>
                {scoreQuery.isLoading ? <ActivityIndicator size="small" /> : null}
              </View>
              {bestPass?.isWorldsFirst || bestPass?.isWorldsFirstPP ? <View style={styles.achievementRow}>
                {bestPass.isWorldsFirst ? <TufWorldAchievementBadge kind="wf" testID="tuf-detail-wf" /> : null}
                {bestPass.isWorldsFirstPP ? <TufWorldAchievementBadge kind="pp" testID="tuf-detail-pp" /> : null}
              </View> : null}
              {scoreQuery.isError ? <Pressable accessibilityRole="button" accessibilityLabel="重新读取关卡成绩"
                onPress={() => void scoreQuery.refetch()}>
                <Text style={[styles.scoreError, { color: theme.accent }]}>成绩读取失败，点击重试</Text>
              </Pressable> : null}
            </View>
            <View style={styles.statRow}>
              <View style={styles.statCell}>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>XACC</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{bestPass ? `${Math.abs(bestPass.accuracy) <= 1 ? (bestPass.accuracy * 100).toFixed(2) : bestPass.accuracy.toFixed(2)}%` : '—'}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>倍速</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{bestPass ? `${bestPass.speed.toFixed(2)}×` : '—'}</Text>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.charterBlock}>
              <Text style={[styles.charterLabel, { color: theme.textMuted }]}>谱师 / VFX</Text>
              <Text style={[styles.charterValue, { color: theme.text }]}>{credits}</Text>
            </View>
            <View style={styles.tagsBlock}>
              <Text style={[styles.charterLabel, { color: theme.textMuted }]}>标签</Text>
              {tags.length ? <View style={styles.upstreamTags}>{tags.map((tag) => <TufUpstreamTag key={tag} name={tag} />)}</View>
                : <Text style={[styles.emptyInline, { color: theme.textMuted }]}>—</Text>}
            </View>
            <TufJudgementTable judgements={bestPass?.judgements} total={total ?? null} />
          </GameChartResultCard>
          <Card style={styles.songInfoCard} testID="tuf-level-song-info">
            <Text style={[styles.songInfoTitle, { color: theme.text }]}>歌曲信息</Text>
            <View style={[styles.infoRow, { borderTopColor: theme.border }]}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>策展</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{level!.curations.length ? `${level!.curations.length} 条` : '—'}</Text>
            </View>
            <View style={[styles.infoRow, { borderTopColor: theme.border }]}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>社区统计</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{communityStats}</Text>
            </View>
            {level!.description ? <View style={[styles.infoRow, { borderTopColor: theme.border }]}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>说明</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{level!.description}</Text>
            </View> : null}
            <Pressable accessibilityRole="link" accessibilityLabel="打开 TUF 关卡页"
              onPress={() => void Linking.openURL(`https://tuforums.com/levels/${level!.id}`)}
              style={[styles.infoLink, { borderTopColor: theme.border }]}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>来源</Text>
              <Text style={[styles.linkText, { color: theme.accent }]}>查看 TUF 关卡页</Text>
            </Pressable>
          </Card>
          <Card testID="tuf-level-personal-tags">
            <TagEditor testID="tuf-level-local-tags" tags={localTags}
              presets={library.tagPresets ?? []}
              historyTags={buildTagHistory(library.data ?? [], library.songKey(level!.id), library.tagPresets ?? [])}
              disabled={library.isUpdating} onPresetsChange={library.setTagPresets}
              onChange={(tags) => library.setTags({ kind: 'song', songId: String(level!.id) }, tags)} />
          </Card>
        </View>
      </ScrollView>} />
  </>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, list: { flex: 1 }, listContent: { padding: 12, gap: 9 }, footer: { marginVertical: 18 },
  sectionHeader: { marginTop: 8, marginBottom: 3, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: 18, fontWeight: '900' }, sectionCount: { fontSize: 11 }, notice: { padding: 12, fontSize: 12 },
  searchWrap: { padding: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInput: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 }, resultCount: { fontSize: 11 },
  detail: { paddingBottom: 40 },
  detailBody: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  hero: { position: 'relative', overflow: 'hidden', backgroundColor: '#253845' },
  heroFallbackImage: { position: 'absolute', width: '44%', height: '44%', alignSelf: 'center', top: '28%', opacity: 0.9 },
  heroCopy: { position: 'absolute', left: 20, right: 20, bottom: 18, gap: 3 },
  heroScroll: { width: '100%', maxWidth: '100%', flexGrow: 0, alignSelf: 'stretch', overflow: 'hidden' },
  heroScrollContent: { paddingRight: 20 },
  heroId: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '800', letterSpacing: 0.35 },
  heroTitle: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.45, textShadowColor: 'rgba(0,0,0,0.36)', textShadowRadius: 8 },
  heroArtist: { color: 'rgba(255,255,255,0.94)', fontSize: 15, lineHeight: 21, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 6 },
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerFloatingButton: { position: 'absolute', zIndex: 30, elevation: 30 },
  headerButtonBg: { backgroundColor: 'rgba(17,24,39,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  headerFavoriteActive: {},
  headerFavoriteActiveBg: { backgroundColor: 'rgba(141,91,214,0.88)' },
  metadata: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 12 },
  metadataCellRoot: { minWidth: 0 },
  metadataCell: { minWidth: 0, alignItems: 'center', paddingHorizontal: 4, gap: 3 },
  metadataLabel: { fontSize: 10, fontWeight: '800' },
  metadataValue: { fontSize: 13, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  metadataBlock: { position: 'relative', minWidth: 0, alignSelf: 'stretch' },
  metadataMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 },
  chartCard: {
    borderWidth: 1, borderRadius: 24, padding: 18,
    shadowColor: '#1A2232', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  levelBlock: { alignItems: 'flex-end', paddingTop: 3 },
  levelNumber: { fontSize: 32, lineHeight: 34, fontWeight: '900', fontVariant: ['tabular-nums'] },
  baseScore: { fontSize: 11, lineHeight: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  resultBlock: { alignItems: 'flex-start', gap: 3, marginTop: 22 },
  resultLabel: { fontSize: 12, fontWeight: '700' },
  scoreValueRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultScore: { fontSize: 34, lineHeight: 42, fontWeight: '900', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  achievementRow: { minHeight: 27, marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 7 },
  scoreError: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  statRow: { flexDirection: 'row', marginTop: 16, gap: 28 },
  statCell: { gap: 2 },
  statLabel: { fontSize: 11, fontWeight: '700' },
  statValue: { fontSize: 18, lineHeight: 23, fontWeight: '900', fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  charterBlock: { gap: 4 },
  charterLabel: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.25 },
  charterValue: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  tagsBlock: { marginTop: 15, gap: 7 },
  upstreamTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  upstreamTag: { maxWidth: '100%', minHeight: 28, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  upstreamTagIcon: { width: 18, height: 18 },
  upstreamTagText: { flexShrink: 1, fontSize: 10, lineHeight: 14, fontWeight: '800' },
  emptyInline: { fontSize: 12, fontWeight: '700' },
  judgementPanel: { minHeight: 104, marginTop: 13, flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  judgementMatrix: { flex: 1, minWidth: 0, gap: 9 },
  judgementRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  judgementCell: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  judgementLabel: { fontSize: 9, lineHeight: 12, fontWeight: '800' },
  judgementValue: { fontSize: 18, lineHeight: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  totalCell: { width: 78, flexShrink: 0, borderLeftWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 5, paddingLeft: 8 },
  totalLabel: { fontSize: 9, lineHeight: 12, fontWeight: '800' },
  totalValue: { width: '100%', fontSize: 21, lineHeight: 27, fontWeight: '900', fontVariant: ['tabular-nums'], textAlign: 'center' },
  songInfoCard: { padding: 0, overflow: 'hidden' },
  songInfoTitle: { paddingHorizontal: 16, paddingVertical: 15, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  infoRow: { minHeight: 46, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  infoLink: { minHeight: 46, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 16 },
  infoLabel: { width: 58, fontSize: 11, lineHeight: 18, fontWeight: '800' },
  infoValue: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'right' },
  linkText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'right' },
});
