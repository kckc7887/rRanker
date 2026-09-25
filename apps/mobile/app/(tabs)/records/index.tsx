import { useDeferredValue, useEffect, useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { EmptyDataView } from '@/components/EmptyDataView';
import { RecordsListPage } from '@/components/game-content/GameListPages';
import { SIMAI_RECORDS_LIST_STYLES as styles } from '@/components/game-content/SimaiListStyles';
import { useStableRangeBounds } from '@/components/game-content/RangeSelector';
import { ChunithmFilterBar } from '@/components/chunithm/ChunithmFilterBar';
import { ChunithmScoreCard } from '@/components/chunithm/ChunithmScoreCard';
import { PhigrosFilterBar } from '@/components/phigros/PhigrosFilterBar';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { indexSongsById } from '@/domain/catalog';
import {
  buildChunithmScoreCards,
  compareChunithmScores,
  type ChunithmScoreCardData,
} from '@/domain/chunithm-score-presentation';
import { matchesChunithmConstantRange, matchesChunithmRankRange } from '@/domain/chunithm-filters';
import { isOsuGameId } from '@/domain/game-mode-family';
import { matchesAchievementRange, matchesConstantRange } from '@/domain/maimai-filters';
import type { ScoreRecord } from '@/domain/models';
import { matchesPhigrosLevel, matchesPhigrosRankFilter } from '@/domain/phigros-filters';
import { buildPhigrosKyouChartTagIndex, phigrosKyouChartHasAllTags } from '@/domain/phigros-kyou';
import { matchesPhigrosXingFilter, phigrosChartNoteKey } from '@/domain/phigros-xing';
import { canReadChunithmScores, canReadPhigrosScores } from '@/domain/provider-capabilities';
import { buildPhigrosNoteTotalByKey } from '@/features/phigros-best-image/phigros-best-image-custom';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGameData } from '@/hooks/use-game-data';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { usePhigrosKyouChartTags } from '@/hooks/use-phigros-kyou';
import { MajdataRecordsScreen } from '@/screens/MajdataScreens';
import { MaimaiRecordsScreen } from '@/screens/maimai/MaimaiRecordsScreen';
import { MuseDashRecordsScreen } from '@/screens/MuseDashScreens';
import { OsuRecordsScreen } from '@/screens/OsuScreens';
import { PhiraRecordsScreen } from '@/screens/PhiraScreens';
import { RizlineRecordsScreen } from '@/screens/RizlineScreens';
import { TufRecordsScreen } from '@/screens/TufScreens';
import { useChunithmRecordsFilter } from '@/state/chunithm-records-filter';
import { usePhigrosRecordsFilter } from '@/state/phigros-records-filter';
import { useSession, UNBOUND_ACCOUNT_ID } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { buildSearchDocument, searchDocumentMatches } from '@/utils/search';

export default function RecordsTabScreen() {
  return <CachedTabScreen><RecordsScreen /></CachedTabScreen>;
}

/** 成绩标签页只做「选游戏 → 挂载对应页面」；舞萌页面自带自己的查询、筛选与派生链。 */
export function RecordsScreen() {
  const activeGameId = useSession((s) => s.activeGameId);
  const activeAccountId = useSession((s) => s.activeAccountId);

  if (activeAccountId === UNBOUND_ACCOUNT_ID) {
    return <EmptyDataView title="暂无绑定账号" detail="请先在设置 → 游戏管理中绑定账号" showBindAction />;
  }

  if (activeGameId === 'maimai') {
    return <MaimaiRecordsScreen />;
  }

  if (activeGameId === 'phigros') {
    return <PhigrosRecordsScreen />;
  }

  if (activeGameId === 'chunithm') {
    return <ChunithmRecordsScreen />;
  }

  if (activeGameId === 'majdata-net') return <MajdataRecordsScreen />;
  if (activeGameId === 'phira') return <PhiraRecordsScreen />;
  if (activeGameId === 'rizline') return <RizlineRecordsScreen />;

  if (isOsuGameId(activeGameId)) return <OsuRecordsScreen />;

  if (activeGameId === 'adofai') {
    return <TufRecordsScreen />;
  }

  if (activeGameId === 'musedash') {
    return <MuseDashRecordsScreen />;
  }

  return <EmptyDataView title="暂无成绩" detail="当前游戏暂未接入成绩数据" />;
}

function ChunithmRecordsScreen() {
  const gameData = useGameData();
  const catalogQuery = useChunithmCatalog();
  const activeProviderId = useSession((state) => state.activeProviderId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const session = useSession((state) => state.session);
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const {
    keyword, collapsed, difficulty, version, constantMin, constantMax, rankMin, rankMax,
    setKeyword, setCollapsed, setDifficulty, setVersion, setConstantMin, setConstantMax,
    setRankMin, setRankMax, clearFilters,
  } = useChunithmRecordsFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const payload = gameData.data?.payload.kind === 'chunithm'
    ? gameData.data.payload
    : null;
  const cards = useMemo(
    () => buildChunithmScoreCards(
      payload?.scores ?? [],
      catalogQuery.data,
    ).sort(compareChunithmScores),
    [catalogQuery.data, payload?.scores],
  );
  const constantValues = useMemo(() => catalogQuery.data?.songs.flatMap((song) =>
    song.difficulties
      .filter((item) => item.difficulty !== 5)
      .map((item) => item.levelValue)) ?? [],
  [catalogQuery.data?.songs]);
  const constantBounds = useStableRangeBounds(
    constantValues,
    { minimum: 0, maximum: 16 },
    constantMin,
    constantMax,
    `${activeAccountId}:${catalogQuery.data?.source.updatedAt ?? 'loading'}`,
  );
  const searchDocuments = useMemo(() => new Map(
    cards.map((card) => [
      card.key,
      buildSearchDocument([
        card.title,
        card.songId,
        card.artist ?? '',
        card.noteDesigner ?? '',
      ]),
    ]),
  ), [cards]);
  const filterSpec = useMemo(() => ({
    keyword: debouncedKeyword,
    difficulty,
    version,
    constantMin,
    constantMax,
    rankMin,
    rankMax,
  }), [constantMax, constantMin, debouncedKeyword, difficulty, rankMax, rankMin, version]);
  const deferredFilterSpec = useDeferredValue(filterSpec);
  const filtered = useMemo(() => {
    return cards.filter((card) => {
      if (deferredFilterSpec.keyword.trim()) {
        const document = searchDocuments.get(card.key);
        if (!document || !searchDocumentMatches(document, deferredFilterSpec.keyword)) return false;
      }
      if (deferredFilterSpec.difficulty !== 'all' && card.levelIndex !== deferredFilterSpec.difficulty) {
        return false;
      }
      if (deferredFilterSpec.version !== 'all' && String(card.versionId) !== deferredFilterSpec.version) {
        return false;
      }
      if (!matchesChunithmConstantRange(
        card.difficultyConstant,
        deferredFilterSpec.constantMin,
        deferredFilterSpec.constantMax,
      )) {
        return false;
      }
      return matchesChunithmRankRange(card.rank, deferredFilterSpec.rankMin, deferredFilterSpec.rankMax);
    });
  }, [cards, deferredFilterSpec, searchDocuments]);
  const hasActiveFilters = !!(
    keyword.trim()
    || difficulty !== 'all'
    || version !== 'all'
    || constantMin
    || constantMax
    || rankMin
    || rankMax
  );
  const isLoading = gameData.isLoading || catalogQuery.isLoading;
  const isError = gameData.isError || catalogQuery.isError;
  const error = gameData.error ?? catalogQuery.error;
  const retry = () => {
    void Promise.all([gameData.refetch(), catalogQuery.refetch()]);
  };

  if (!canReadChunithmScores(activeProviderId, session?.mode) && !isLoading) {
    return (
      <EmptyDataView
        detail="请在游戏管理中绑定中二节奏的落雪账号"
        title="尚未绑定落雪账号"
      />
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput
          accessibilityLabel="中二成绩搜索"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setKeyword}
          placeholder="曲名 / ID / 艺术家 / 谱师"
          placeholderTextColor={theme.textMuted}
          style={[
            styles.searchBox,
            { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
          ]}
          value={keyword}
        />
      </View>
      <ChunithmFilterBar
        collapsed={collapsed}
        constantBounds={constantBounds}
        constantMax={constantMax}
        constantMin={constantMin}
        difficulty={difficulty}
        onCollapsedChange={setCollapsed}
        onConstantMaxChange={setConstantMax}
        onConstantMinChange={setConstantMin}
        onDifficultyChange={setDifficulty}
        onRankMaxChange={setRankMax}
        onRankMinChange={setRankMin}
        onReset={clearFilters}
        onVersionChange={setVersion}
        rankMax={rankMax}
        rankMin={rankMin}
        version={version}
        versions={catalogQuery.data?.versions ?? []}
      />
      <RecordsListPage<ChunithmScoreCardData>
        data={!isLoading && filtered.length ? filtered : undefined}
        emptyText={hasActiveFilters ? '当前筛选条件下没有中二成绩' : '落雪尚未同步中二成绩'}
        error={error}
        isEmpty={!isLoading && filtered.length === 0}
        isError={isError}
        isLoading={isLoading}
        onRetry={retry}
        flatListProps={{
          ...TAB_LIST_CACHE_PROPS,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 16 }],
          contentInsetAdjustmentBehavior: 'automatic',
          keyExtractor: (item) => item.key,
          ListHeaderComponent: <View style={styles.header}>
            <Text style={styles.note}>共 {filtered.length} 条成绩</Text>
          </View>,
          renderItem: ({ item }) => <ChunithmScoreCard record={item} />,
          scrollIndicatorInsets: { bottom: tabBottomInset },
          style: styles.list,
          testID: 'chunithm-records-list',
        }}
      />
    </View>
  );
}

function PhigrosRecordsScreen() {
  const session = useSession((s) => s.session);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const gameData = useGameData();
  const catalogQuery = usePhigrosCatalog();
  const kyouChartTags = usePhigrosKyouChartTags();
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const {
    keyword, collapsed, level, constantMin, constantMax, accuracyMin, accuracyMax, rank, xing, chapter,
    selectedKyouTagIds,
    setKeyword, setCollapsed, setLevel, setConstantMin, setConstantMax, setAccuracyMin, setAccuracyMax,
    setRank, setXing, setChapter, setSelectedKyouTagIds,
    clearFilters,
  } = usePhigrosRecordsFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const canReadScores = canReadPhigrosScores(activeProviderId, session?.mode);
  const phigrosPayload = gameData.data?.payload.kind === 'phigros' ? gameData.data.payload : null;
  const records = useMemo(
    () => phigrosPayload?.records ?? [],
    [phigrosPayload?.records],
  );

  const catalogSongs = useMemo(
    () => catalogQuery.data?.snapshot.songs ?? [],
    [catalogQuery.data?.snapshot.songs],
  );
  const constantValues = useMemo(() => [
    ...catalogSongs.flatMap((song) =>
      (song.charts ?? []).map((chart) => chart.difficultyConstant)),
    ...records.map((record) => record.difficultyConstant),
  ], [catalogSongs, records]);
  const constantBounds = useStableRangeBounds(
    constantValues,
    { minimum: 0, maximum: 20 },
    constantMin,
    constantMax,
    `${activeAccountId}:${catalogQuery.data?.snapshot.source.updatedAt ?? 'loading'}`,
  );
  const kyouTagIndex = useMemo(() => buildPhigrosKyouChartTagIndex(
    kyouChartTags.data,
    catalogQuery.data?.snapshot,
  ), [catalogQuery.data?.snapshot, kyouChartTags.data]);
  useEffect(() => {
    if (selectedKyouTagIds.length === 0) return;
    if (kyouChartTags.data) {
      const validIds = new Set(kyouChartTags.data.tags.map((tag) => tag.id));
      const next = selectedKyouTagIds.filter((tagId) => validIds.has(tagId));
      if (next.length !== selectedKyouTagIds.length) setSelectedKyouTagIds(next);
    } else if (kyouChartTags.isError) {
      setSelectedKyouTagIds([]);
    }
  }, [kyouChartTags.data, kyouChartTags.isError, selectedKyouTagIds, setSelectedKyouTagIds]);
  const chapterIdBySong = useMemo(() => {
    const map = new Map<string, number>();
    for (const song of catalogSongs) {
      if (song.versionId !== undefined) map.set(song.id, song.versionId);
    }
    return map;
  }, [catalogSongs]);
  const titleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const song of catalogSongs) {
      map.set(song.id, song.title);
    }
    return map;
  }, [catalogSongs]);
  const noteTotalByKey = useMemo(
    () => buildPhigrosNoteTotalByKey(catalogSongs),
    [catalogSongs],
  );

  const catalogSongIndex = useMemo(() => indexSongsById(catalogSongs), [catalogSongs]);
  const searchDocs = useMemo(() => new Map(
    records.map((r) => {
      const title = titleMap.get(r.songId) ?? r.songId;
      const song = catalogSongIndex.get(r.songId);
      return [recordKey(r), {
        ...buildSearchDocument([r.songId, title, ...(song?.aliases ?? [])]),
        title,
      }] as const;
    }),
  ), [catalogSongIndex, records, titleMap]);

  const filterSpec = useMemo(() => ({
    keyword: debouncedKeyword, level, constantMin, constantMax, accuracyMin, accuracyMax, rank, xing, chapter,
    selectedKyouTagIds,
  }), [accuracyMax, accuracyMin, chapter, constantMax, constantMin, debouncedKeyword, level, rank,
    selectedKyouTagIds, xing]);
  const deferredFilterSpec = useDeferredValue(filterSpec);
  const filtered = useMemo<{ record: ScoreRecord; title: string }[]>(() => {
    if (!records.length) return [];
    let list = records.map((r) => {
      const doc = searchDocs.get(recordKey(r));
      return { record: r, title: doc?.title ?? r.songId };
    });
    if (deferredFilterSpec.keyword.trim()) {
      list = list.filter((item) => {
        const doc = searchDocs.get(recordKey(item.record));
        return doc ? searchDocumentMatches(doc, deferredFilterSpec.keyword) : false;
      });
    }
    if (deferredFilterSpec.chapter !== 'all') {
      const chapterId = Number(deferredFilterSpec.chapter);
      list = list.filter((item) => chapterIdBySong.get(item.record.songId) === chapterId);
    }
    if (deferredFilterSpec.level !== 'all') {
      list = list.filter((item) => matchesPhigrosLevel(item.record.levelIndex, deferredFilterSpec.level));
    }
    list = list.filter((item) => matchesConstantRange(
      item.record.difficultyConstant, deferredFilterSpec.constantMin, deferredFilterSpec.constantMax,
    ));
    list = list.filter((item) => matchesAchievementRange(
      item.record.achievements, deferredFilterSpec.accuracyMin, deferredFilterSpec.accuracyMax,
    ));
    list = list.filter((item) => matchesPhigrosRankFilter(item.record, deferredFilterSpec.rank));
    list = list.filter((item) => matchesPhigrosXingFilter(
      item.record, deferredFilterSpec.xing, noteTotalByKey,
    ));
    if (kyouChartTags.data && deferredFilterSpec.selectedKyouTagIds.length > 0) {
      list = list.filter((item) => phigrosKyouChartHasAllTags(
        kyouTagIndex,
        item.record.songId,
        item.record.levelIndex,
        deferredFilterSpec.selectedKyouTagIds,
      ));
    }
    return list;
  }, [chapterIdBySong, deferredFilterSpec, kyouChartTags.data, kyouTagIndex, noteTotalByKey, records, searchDocs]);

  const isGameLoading = gameData.isLoading || catalogQuery.isLoading;
  const isGameError = gameData.isError || catalogQuery.isError;
  const error = gameData.error ?? catalogQuery.error;
  const refetchAll = () => {
    void Promise.all([gameData.refetch(), catalogQuery.refetch(), kyouChartTags.refetch()]);
  };
  const hasActiveFilters = !!(
    keyword.trim()
    || level !== 'all'
    || constantMin
    || constantMax
    || accuracyMin
    || accuracyMax
    || rank
    || xing
    || chapter !== 'all'
    || selectedKyouTagIds.length > 0
  );

  if (!canReadScores && !isGameLoading) {
    return (
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <Text style={[styles.statusText, { color: theme.textMuted }]}>尚未绑定 TapTap 账号</Text>
          <Text style={[styles.statusHint, { color: theme.textMuted }]}>请在游戏管理中绑定 Phigros 的 TapTap 云存档</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput accessibilityLabel="成绩搜索" autoCapitalize="none" autoCorrect={false}
          placeholder="曲名 / 别名 / 曲师 / 谱师" placeholderTextColor={theme.textMuted}
          value={keyword} onChangeText={setKeyword}
          style={[styles.searchBox, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
      </View>
      <PhigrosFilterBar
        collapsed={collapsed} onCollapsedChange={setCollapsed}
        level={level} constantMin={constantMin} constantMax={constantMax}
        constantBounds={constantBounds}
        accuracyMin={accuracyMin} accuracyMax={accuracyMax} rank={rank} xing={xing}
        chapter={chapter} versions={catalogQuery.data?.snapshot.versions ?? []} onChapterChange={setChapter}
        kyouTags={kyouChartTags.data?.tags ?? []}
        selectedKyouTagIds={selectedKyouTagIds}
        kyouTagState={kyouChartTags.data ? 'ready' : kyouChartTags.isLoading ? 'loading' : 'unavailable'}
        onKyouTagIdsChange={setSelectedKyouTagIds}
        onLevelChange={setLevel} onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
        onAccuracyMinChange={setAccuracyMin} onAccuracyMaxChange={setAccuracyMax}
        onRankChange={setRank} onXingChange={setXing}
        onReset={clearFilters}
      />
      <RecordsListPage<{ record: ScoreRecord; title: string }>
        isLoading={isGameLoading}
        isError={isGameError}
        isEmpty={!isGameLoading && filtered.length === 0}
        error={error}
        onRetry={refetchAll}
        emptyText={hasActiveFilters ? '筛选结果为空' : '暂无成绩数据'}
        data={!isGameLoading && filtered.length > 0 ? filtered : undefined}
        flatListProps={{
          testID: 'phigros-records-list',
          contentInsetAdjustmentBehavior: 'automatic',
          style: styles.list,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 16 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          keyExtractor: (item) => recordKey(item.record),
          ...TAB_LIST_CACHE_PROPS,
          ListHeaderComponent: <View style={styles.header}>
            <Text style={styles.note}>共 {filtered.length} 条成绩</Text>
          </View>,
          renderItem: ({ item }) => (
            <PhigrosScoreCard
              record={item.record}
              artworkSource={catalogQuery.data?.provider?.getIllustrationUrl(item.record.songId)}
              catalogTitle={item.title}
              totalNotes={noteTotalByKey[
                phigrosChartNoteKey(item.record.songId, item.record.levelIndex)
              ]}
            />
          ),
        }}
      />
    </View>
  );
}

function recordKey(record: ScoreRecord): string {
  return `${record.songId}-${record.type}-${record.levelIndex}`;
}
