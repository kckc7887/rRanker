import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { ExampleRecordsScreen } from '@/screens/ExampleScreens';
import { useCallback, useEffect, useMemo } from 'react';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { EmptyDataView } from '@/components/EmptyDataView';
import { RecordsListPage } from '@/components/game-content/GameListPages';
import { useStableRangeBounds } from '@/components/game-content/RangeSelector';
import { ChunithmFilterBar } from '@/components/chunithm/ChunithmFilterBar';
import { ChunithmScoreCard } from '@/components/chunithm/ChunithmScoreCard';
import { PhigrosFilterBar } from '@/components/phigros/PhigrosFilterBar';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { indexSongsById } from '@/domain/catalog';
import {
  buildChunithmScoreCards,
  compareChunithmScores,
  type ChunithmScoreCardData,
} from '@/domain/chunithm-score-presentation';
import { matchesChunithmConstantRange, matchesChunithmRankRange } from '@/domain/chunithm-filters';
import { isOsuGameId } from '@/domain/game-mode-family';
import { matchesAchievementRange, matchesConstantRange } from '@/domain/maimai-filters';
import type { ScoreRecord, Song } from '@/domain/models';
import { matchesPhigrosLevel, matchesPhigrosRankFilter } from '@/domain/phigros-filters';
import { buildPhigrosKyouChartTagIndex, phigrosKyouChartHasAllTags } from '@/domain/phigros-kyou';
import { matchesPhigrosXingFilter, phigrosChartNoteKey } from '@/domain/phigros-xing';
import { canReadChunithmScores, canReadPhigrosScores } from '@/domain/provider-capabilities';
import { buildPhigrosNoteTotalByKey } from '@/features/phigros-best-image/phigros-best-image-custom';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useLocalSearch } from '@/hooks/use-local-search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGameData } from '@/hooks/use-game-data';
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
import { searchDocumentFor, searchDocumentMatches } from '@/utils/search';

export default function RecordsTabScreen() {
  return <CachedTabScreen><RecordsScreen /></CachedTabScreen>;
}

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
  if (activeGameId === 'example') return <ExampleRecordsScreen />;
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

const chunithmRecordSearchValues = (card: ChunithmScoreCardData) => [card.title, card.songId, card.artist ?? '', card.noteDesigner ?? ''];
const phigrosRecordSongValues = (song: Song) => [song.id, song.title, ...(song.aliases ?? [])];
const phigrosRecordValues = (record: ScoreRecord) => [record.songId];

function ChunithmRecordsScreen() {
  const gameData = useGameData();
  const catalogQuery = useChunithmCatalog();
  const activeProviderId = useSession((state) => state.activeProviderId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const session = useSession((state) => state.session);
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
  const filterSpec = useMemo(() => ({
    keyword: debouncedKeyword,
    difficulty,
    version,
    constantMin,
    constantMax,
    rankMin,
    rankMax,
  }), [constantMax, constantMin, debouncedKeyword, difficulty, rankMax, rankMin, version]);
  const selectCard = useCallback((card: ChunithmScoreCardData, filters: typeof filterSpec) => {
    if (!searchDocumentMatches(searchDocumentFor(card, chunithmRecordSearchValues), filters.keyword)) return undefined;
    if (filters.difficulty !== 'all' && card.levelIndex !== filters.difficulty) return undefined;
    if (filters.version !== 'all' && String(card.versionId) !== filters.version) return undefined;
    if (!matchesChunithmConstantRange(card.difficultyConstant, filters.constantMin, filters.constantMax)
      || !matchesChunithmRankRange(card.rank, filters.rankMin, filters.rankMax)) return undefined;
    return card;
  }, []);
  const { data: filtered, isFiltering } = useLocalSearch(cards, filterSpec, selectCard);
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

  const controls = <>
    <GameSearchHeader accessibilityLabel="中二成绩搜索"
      placeholder="曲名 / ID / 艺术家 / 谱师" value={keyword} onChangeText={setKeyword} />
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
  </>;
  return (
    <RecordsListPage<ChunithmScoreCardData>
      beforeList={controls}
      data={!isLoading && filtered.length ? filtered : undefined}
      emptyText={hasActiveFilters ? '当前筛选条件下没有中二成绩' : '落雪尚未同步中二成绩'}
      error={error}
      isEmpty={!isLoading && filtered.length === 0}
      isError={isError}
      isLoading={isLoading || (isFiltering && filtered.length === 0)}
      onRetry={retry}
      count={filtered.length} flatListProps={{
        keyExtractor: (item) => item.key,
        renderItem: ({ item }) => <ChunithmScoreCard record={item} />,
        testID: 'chunithm-records-list',
      }}
    />
  );
}

function PhigrosRecordsScreen() {
  const session = useSession((s) => s.session);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const gameData = useGameData();
  const catalogQuery = usePhigrosCatalog();
  const kyouChartTags = usePhigrosKyouChartTags();
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
  const filterSpec = useMemo(() => ({
    keyword: debouncedKeyword, level, constantMin, constantMax, accuracyMin, accuracyMax, rank, xing, chapter,
    selectedKyouTagIds,
  }), [accuracyMax, accuracyMin, chapter, constantMax, constantMin, debouncedKeyword, level, rank,
    selectedKyouTagIds, xing]);
  const selectRecord = useCallback((record: ScoreRecord, filters: typeof filterSpec) => {
    const song = catalogSongIndex.get(record.songId);
    const document = song
      ? searchDocumentFor(song, phigrosRecordSongValues)
      : searchDocumentFor(record, phigrosRecordValues);
    if (!searchDocumentMatches(document, filters.keyword)) return undefined;
    if (filters.chapter !== 'all' && chapterIdBySong.get(record.songId) !== Number(filters.chapter)) return undefined;
    if (filters.level !== 'all' && !matchesPhigrosLevel(record.levelIndex, filters.level)) return undefined;
    if (!matchesConstantRange(record.difficultyConstant, filters.constantMin, filters.constantMax)
      || !matchesAchievementRange(record.achievements, filters.accuracyMin, filters.accuracyMax)
      || !matchesPhigrosRankFilter(record, filters.rank)
      || !matchesPhigrosXingFilter(record, filters.xing, noteTotalByKey)) return undefined;
    if (kyouChartTags.data && filters.selectedKyouTagIds.length > 0
      && !phigrosKyouChartHasAllTags(kyouTagIndex, record.songId, record.levelIndex, filters.selectedKyouTagIds)) return undefined;
    return { record, title: titleMap.get(record.songId) ?? record.songId };
  }, [catalogSongIndex, chapterIdBySong, kyouChartTags.data, kyouTagIndex, noteTotalByKey, titleMap]);
  const { data: filtered, isFiltering } = useLocalSearch(records, filterSpec, selectRecord, catalogSongs);

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
      <EmptyDataView title="尚未绑定 TapTap 账号" detail="请在游戏管理中绑定 Phigros 的 TapTap 云存档" />
    );
  }

  const controls = <>
    <GameSearchHeader accessibilityLabel="成绩搜索"
      placeholder="曲名 / 别名 / 曲师 / 谱师" value={keyword} onChangeText={setKeyword} />
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
  </>;
  return (
    <RecordsListPage<{ record: ScoreRecord; title: string }>
      beforeList={controls}
      isLoading={isGameLoading || (isFiltering && filtered.length === 0)}
      isError={isGameError}
      isEmpty={!isGameLoading && filtered.length === 0}
      error={error}
      onRetry={refetchAll}
      emptyText={hasActiveFilters ? '筛选结果为空' : '暂无成绩数据'}
      data={!isGameLoading && filtered.length > 0 ? filtered : undefined}
      count={filtered.length} flatListProps={{
        testID: 'phigros-records-list',
        keyExtractor: (item) => recordKey(item.record),
        renderItem: ({ item }) => (
          <PhigrosScoreCard
            record={item.record}
            artworkSource={catalogQuery.data?.provider?.getIllustrationLowresUrl(item.record.songId)}
            catalogTitle={item.title}
            totalNotes={noteTotalByKey[
              phigrosChartNoteKey(item.record.songId, item.record.levelIndex)
            ]}
          />
        ),
      }}
    />
  );
}

function recordKey(record: ScoreRecord): string {
  return `${record.songId}-${record.type}-${record.levelIndex}`;
}
