import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  BestListPage,
  CatalogListPage,
  RecordsListPage,
} from '@/components/game-content/GameListPages';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { useStableRangeBounds } from '@/components/game-content/RangeSelector';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { OsuCatalogFilterBar } from '@/components/osu/OsuCatalogFilterBar';
import { OsuRecordsFilterBar } from '@/components/osu/OsuRecordsFilterBar';
import { OsuScoreCard } from '@/components/osu/OsuScoreCard';
import { OsuSongRow } from '@/components/osu/OsuSongRow';
import { filterOsuBestScores } from '@/domain/osu-filters';
import { isOsuGameId, type OsuGameId } from '@/domain/game-mode-family';
import {
  type OsuBestScore,
  type OsuCatalogSong,
  type OsuExtraFlag,
  type OsuGeneralFlag,
  type OsuSearchStatus,
} from '@/domain/osu';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGameData } from '@/hooks/use-game-data';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useOsuCatalogSearch } from '@/hooks/use-osu-catalog';
import { useOsuRecentScores } from '@/hooks/use-osu-recent-scores';
import { useOsuRecordsFilter } from '@/state/osu-records-filter';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

type OsuBestSection = { id: 'top100'; title: 'Top 100'; scores: OsuBestScore[] } & {
  data: OsuBestScore[];
};

function useActiveOsuGameId(): OsuGameId | null {
  const activeGameId = useSession((s) => s.activeGameId);
  return isOsuGameId(activeGameId) ? activeGameId : null;
}

/** osu! 最佳页：个人最佳前 100（单分区 Top 100）。 */
export function OsuBestScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const gameId = useActiveOsuGameId();
  const { data, isLoading, isError, error, refetch } = useGameData();
  const payload = data?.payload.kind === 'osu' ? data.payload : null;
  const sections = useMemo<OsuBestSection[]>(() => {
    if (!payload || payload.bestScores.length === 0) return [];
    return [{
      id: 'top100',
      title: 'Top 100',
      scores: payload.bestScores,
      data: payload.bestScores,
    }];
  }, [payload]);
  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <BestListPage<OsuBestScore, OsuBestSection>
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && sections.length === 0}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="当前账号暂无最佳成绩"
        data={sections.length ? sections : undefined}
        sectionListProps={{
          testID: 'osu-best-results-list',
          style: styles.list,
          contentInsetAdjustmentBehavior: 'automatic',
          stickySectionHeadersEnabled: false,
          contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
          scrollIndicatorInsets: { bottom: inset },
          ...TAB_LIST_CACHE_PROPS,
          keyExtractor: (item) => String(item.id),
          renderSectionHeader: ({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
              <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{section.data.length} 条成绩</Text>
            </View>
          ),
          renderItem: ({ item, index }) => (
            gameId ? <OsuScoreCard gameId={gameId} score={item} position={index + 1} /> : null
          ),
        }}
      />
    </View>
  );
}

/** osu! 成绩页：官方 recent 最近通过成绩（最多 100 条），筛选在当前结果上本地执行。 */
export function OsuRecordsScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const gameId = useActiveOsuGameId();
  const activeAccountId = useSession((state) => state.activeAccountId);
  const recent = useOsuRecentScores(gameId);
  const allScores = useMemo(() => recent.data ?? [], [recent.data]);
  const starValues = useMemo(() => allScores.map((score) => score.beatmap.difficultyRating), [allScores]);
  const filter = useOsuRecordsFilter();
  const starBounds = useStableRangeBounds(
    starValues,
    { minimum: 0, maximum: 10 },
    filter.starMin,
    filter.starMax,
    `${gameId ?? 'none'}:${activeAccountId ?? 'none'}`,
  );
  const debouncedKeyword = useDebouncedValue(filter.keyword, 350);
  const scores = useMemo(() => filterOsuBestScores(allScores, {
    keyword: debouncedKeyword,
    mods: filter.mods,
    accuracyMin: filter.accuracyMin,
    accuracyMax: filter.accuracyMax,
    starMin: filter.starMin,
    starMax: filter.starMax,
    ppMin: filter.ppMin,
    ppMax: filter.ppMax,
  }), [allScores, debouncedKeyword, filter.mods, filter.accuracyMin, filter.accuracyMax,
    filter.starMin, filter.starMax, filter.ppMin, filter.ppMax]);
  const hasActiveFilter = debouncedKeyword.trim() !== '' || filter.mods.length > 0
    || filter.accuracyMin !== '' || filter.accuracyMax !== ''
    || filter.starMin !== '' || filter.starMax !== ''
    || filter.ppMin !== '' || filter.ppMax !== '';
  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <RecordsListPage<OsuBestScore>
        beforeList={
          <>
            <View style={styles.recordsHeading}>
              <Text style={[styles.recordsTitle, { color: theme.text }]}>最近成绩</Text>
              <Text style={[styles.recordsHint, { color: theme.textMuted }]}>官方最近通过成绩，最多 100 条</Text>
            </View>
            <GameSearchHeader
              accessibilityLabel="搜索 osu! 成绩"
              placeholder="搜索歌名、艺术家或谱面名"
              value={filter.keyword}
              onChangeText={filter.setKeyword}
              loaded={scores.length}
              total={allScores.length}
            />
            <OsuRecordsFilterBar
              gameId={gameId}
              collapsed={filter.collapsed}
              mods={filter.mods}
              starMin={filter.starMin}
              starMax={filter.starMax}
              accuracyMin={filter.accuracyMin}
              accuracyMax={filter.accuracyMax}
              ppMin={filter.ppMin}
              ppMax={filter.ppMax}
              starBounds={starBounds}
              onCollapsedChange={filter.setCollapsed}
              onModsChange={filter.setMods}
              onStarMinChange={filter.setStarMin}
              onStarMaxChange={filter.setStarMax}
              onAccuracyMinChange={filter.setAccuracyMin}
              onAccuracyMaxChange={filter.setAccuracyMax}
              onPpMinChange={filter.setPpMin}
              onPpMaxChange={filter.setPpMax}
              onReset={filter.clearFilters}
            />
          </>
        }
        isLoading={recent.bound && recent.isLoading}
        isError={recent.isError}
        isEmpty={!recent.bound || (!recent.isLoading && scores.length === 0)}
        error={recent.error}
        onRetry={() => void recent.refetch()}
        emptyText={!recent.bound ? '请先在游戏管理中绑定 osu! 账号'
          : hasActiveFilter ? '没有找到符合条件的最近成绩' : '当前账号暂无最近成绩'}
        data={scores.length ? scores : undefined}
        flatListProps={{
          testID: 'osu-records-results-list',
          style: styles.list,
          contentInsetAdjustmentBehavior: 'automatic',
          contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
          scrollIndicatorInsets: { bottom: inset },
          ...TAB_LIST_CACHE_PROPS,
          refreshing: recent.isRefetching,
          onRefresh: () => void recent.refetch(),
          keyExtractor: (item) => String(item.id),
          renderItem: ({ item }) => (
            gameId ? <OsuScoreCard gameId={gameId} score={item} detailScoreId={item.id} /> : null
          ),
        }}
      />
    </View>
  );
}

/** osu! 曲库页：直连 osu.ppy.sh 谱面搜索（每首歌 = 一个 beatmapset）；m 恒为当前模式，玩家不可见。 */
export function OsuCatalogScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const gameId = useActiveOsuGameId();
  const [keyword, setKeyword] = useState('');
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [general, setGeneral] = useState<readonly OsuGeneralFlag[]>([]);
  const [status, setStatus] = useState<OsuSearchStatus>('any');
  const [genre, setGenre] = useState(0);
  const [language, setLanguage] = useState(0);
  const [nsfw, setNsfw] = useState(false);
  const [extras, setExtras] = useState<readonly OsuExtraFlag[]>([]);
  const debouncedKeyword = useDebouncedValue(keyword, 350);
  // 逐字段依赖稳定输入身份：hook 下游 useMemo/queryKey 依赖该对象引用，避免每次渲染重建触发重复请求。
  const searchInput = useMemo(() => ({
    q: debouncedKeyword.trim() || undefined,
    general,
    status,
    genre,
    language,
    nsfw,
    extras,
  }), [debouncedKeyword, general, status, genre, language, nsfw, extras]);
  const query = useOsuCatalogSearch(gameId, searchInput);
  const controls = gameId ? (
    <>
      <GameSearchHeader
        accessibilityLabel="搜索 osu! 谱面"
        placeholder="搜索标题、艺术家、谱师或标签"
        value={keyword}
        onChangeText={setKeyword}
        loaded={query.songs.length}
        total={query.total}
      />
      <OsuCatalogFilterBar
        collapsed={!filterExpanded}
        general={general}
        status={status}
        genre={genre}
        language={language}
        nsfw={nsfw}
        extras={extras}
        recommendedDifficulty={query.recommendedDifficulty}
        onCollapsedChange={(value) => setFilterExpanded(!value)}
        onGeneralChange={setGeneral}
        onStatusChange={setStatus}
        onGenreChange={setGenre}
        onLanguageChange={setLanguage}
        onNsfwChange={setNsfw}
        onExtrasChange={setExtras}
        onReset={() => {
          setGeneral([]);
          setStatus('any');
          setGenre(0);
          setLanguage(0);
          setNsfw(false);
          setExtras([]);
        }}
      />
    </>
  ) : null;
  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <CatalogListPage<OsuCatalogSong>
        beforeList={controls}
        isLoading={query.bound && query.isLoading}
        isError={query.isError}
        isEmpty={!query.bound || (!query.isLoading && query.songs.length === 0)}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyText={query.bound ? '没有找到符合条件的谱面' : '请先在游戏管理中绑定 osu! 账号'}
        data={query.songs.length ? query.songs : undefined}
        flatListProps={{
          testID: 'osu-catalog-results-list',
          style: styles.list,
          contentInsetAdjustmentBehavior: 'automatic',
          contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
          scrollIndicatorInsets: { bottom: inset },
          ...TAB_LIST_CACHE_PROPS,
          keyExtractor: (item) => String(item.beatmapSetId),
          renderItem: ({ item }) => (
            gameId ? <OsuSongRow gameId={gameId} song={item} /> : null
          ),
          onEndReachedThreshold: 0.35,
          onEndReached: () => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          },
          ListFooterComponent: query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : null,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  header: { gap: 9, marginBottom: 2 },
  footer: { marginVertical: 18 },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionCount: { fontSize: 11 },
  recordsHeading: { paddingHorizontal: 16, paddingTop: 12, gap: 2 },
  recordsTitle: { fontSize: 20, fontWeight: '900' },
  recordsHint: { fontSize: 12, lineHeight: 17 },
});
