import { useDeferredValue, useEffect, useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type ListRenderItem } from 'react-native';
import { EmptyDataView } from '@/components/EmptyDataView';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { RecordsListPage } from '@/components/game-content/GameListPages';
import { MaimaiFilterBar, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { SourceStatus } from '@/components/SourceStatus';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { PhigrosFilterBar } from '@/components/phigros/PhigrosFilterBar';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { ChunithmScoreCard } from '@/components/chunithm/ChunithmScoreCard';
import { ChunithmFilterBar } from '@/components/chunithm/ChunithmFilterBar';
import { matchesAchievementRange, matchesConstantRange, matchesMultiAchievementFilter, matchesSoloAchievementFilter } from '@/domain/maimai-filters';
import { buildDxRatingChartTagIndex, dxRatingChartHasAllTags } from '@/domain/dxrating-chart-tags';
import { matchesChunithmConstantRange, matchesChunithmRankRange } from '@/domain/chunithm-filters';
import { matchesPhigrosLevel, matchesPhigrosRankFilter } from '@/domain/phigros-filters';
import { buildPhigrosKyouChartTagIndex, phigrosKyouChartHasAllTags } from '@/domain/phigros-kyou';
import { matchesPhigrosXingFilter, phigrosChartNoteKey } from '@/domain/phigros-xing';
import {
  buildChunithmScoreCards,
  compareChunithmScores,
  type ChunithmScoreCardData,
} from '@/domain/chunithm-score-presentation';
import type { DataSource, ScoreRecord } from '@/domain/models';
import { canReadChunithmScores } from '@/domain/provider-capabilities';
import { buildPhigrosNoteTotalByKey } from '@/features/phigros-best-image/phigros-best-image-custom';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { usePhigrosKyouChartTags } from '@/hooks/use-phigros-kyou';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useGameData } from '@/hooks/use-game-data';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDxRatingChartTags } from '@/hooks/use-dxrating-chart-tags';
import { usePhigrosRecordsFilter } from '@/state/phigros-records-filter';
import { useChunithmRecordsFilter } from '@/state/chunithm-records-filter';
import { useRecordsFilter } from '@/state/records-filter';
import { useSession } from '@/state/session-store';
import { buildSearchDocument, buildSongSearchIndex, searchDocumentMatches } from '@/utils/search';
import { useAppTheme } from '@/theme/app-theme';

export default function RecordsTabScreen() {
  return <CachedTabScreen><RecordsScreen /></CachedTabScreen>;
}

export function RecordsScreen() {
  const activeGameId = useSession((s) => s.activeGameId);
  const { data, isLoading, isError, error, refetch } = useScoreSnapshot();
  const catalog = useDetailedCatalog();
  const dxRatingChartTags = useDxRatingChartTags();
  const theme = useAppTheme();
  const tabBottomInset = useNativeTabBottomInset();
  const {
    keyword, collapsed, difficulty, version, type, constantMin, constantMax, achievementMin, achievementMax,
    soloAchievement, multiAchievement, versionLocale, selectedDxRatingTagIds,
    setKeyword, setCollapsed,
    setDifficulty, setVersion, setType, setConstantMin, setConstantMax, setAchievementMin, setAchievementMax,
    setSoloAchievement, setMultiAchievement, setVersionLocale, setSelectedDxRatingTagIds, clearFilters,
  } = useRecordsFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const searchBySongId = useMemo(() => new Map(buildSongSearchIndex(catalog.data?.songs ?? [])
    .map(({ song, text, compact }) => [song.id, { text, compact }] as const)), [catalog.data?.songs]);
  const dxRatingTagIndex = useMemo(() => buildDxRatingChartTagIndex(
    dxRatingChartTags.data,
    catalog.data?.songs ?? [],
  ), [catalog.data?.songs, dxRatingChartTags.data]);

  useEffect(() => {
    if (activeGameId !== 'maimai' || selectedDxRatingTagIds.length === 0) return;
    if (dxRatingChartTags.data) {
      const validIds = new Set(dxRatingChartTags.data.tags.map((tag) => tag.id));
      const next = selectedDxRatingTagIds.filter((tagId) => validIds.has(tagId));
      if (next.length !== selectedDxRatingTagIds.length) setSelectedDxRatingTagIds(next);
    } else if (dxRatingChartTags.isError) {
      setSelectedDxRatingTagIds([]);
    }
  }, [activeGameId, dxRatingChartTags.data, dxRatingChartTags.isError, selectedDxRatingTagIds, setSelectedDxRatingTagIds]);

  const versions = useMemo<VersionFilterOption[]>(() => {
    if (!data) return [];
    return Array.from(new Set(data.records.map((record) => record.version))).sort()
      .map((name) => ({ value: name, name }));
  }, [data]);

  const filterSpec = useMemo(() => ({
    keyword: debouncedKeyword, difficulty, version, type, constantMin, constantMax, achievementMin, achievementMax,
    soloAchievement, multiAchievement, selectedDxRatingTagIds,
  }), [achievementMax, achievementMin, soloAchievement, multiAchievement, constantMax, constantMin, debouncedKeyword, difficulty, selectedDxRatingTagIds, type, version]);
  const deferredFilterSpec = useDeferredValue(filterSpec);
  const filtered = useMemo<ScoreRecord[]>(() => {
    if (!data) return [];
    let list = data.records.slice();
    if (deferredFilterSpec.keyword.trim()) list = list.filter((record) => searchDocumentMatches(
      searchBySongId.get(record.songId) ?? buildSearchDocument([record.songId, record.title]),
      deferredFilterSpec.keyword,
    ));
    if (deferredFilterSpec.difficulty !== 'all') {
      list = list.filter((record) => record.difficulty === deferredFilterSpec.difficulty);
    }
    if (deferredFilterSpec.version !== 'all') {
      list = list.filter((record) => record.version === deferredFilterSpec.version);
    }
    if (deferredFilterSpec.type !== 'all') {
      list = list.filter((record) => record.type === deferredFilterSpec.type);
    }
    const hasConstantFilter = !!(deferredFilterSpec.constantMin || deferredFilterSpec.constantMax);
    list = list.filter((record) => !(record.type === 'UTAGE' && hasConstantFilter) &&
      matchesConstantRange(
        record.difficultyConstant, deferredFilterSpec.constantMin, deferredFilterSpec.constantMax,
      ));
    list = list.filter((record) => matchesAchievementRange(
      record.achievements, deferredFilterSpec.achievementMin, deferredFilterSpec.achievementMax,
    ));
    list = list.filter((record) => matchesSoloAchievementFilter(record, deferredFilterSpec.soloAchievement));
    list = list.filter((record) => matchesMultiAchievementFilter(record, deferredFilterSpec.multiAchievement));
    if (dxRatingChartTags.data && deferredFilterSpec.selectedDxRatingTagIds.length > 0) {
      list = list.filter((record) => dxRatingChartHasAllTags(
        dxRatingTagIndex,
        record.songId,
        record.type,
        record.levelIndex,
        deferredFilterSpec.selectedDxRatingTagIds,
      ));
    }
    return list.sort((a, b) =>
      Number(a.type === 'UTAGE') - Number(b.type === 'UTAGE') ||
      b.rating - a.rating ||
      b.achievements - a.achievements);
  }, [data, deferredFilterSpec, dxRatingChartTags.data, dxRatingTagIndex, searchBySongId]);

  const isEmpty = !!data && filtered.length === 0;

  if (activeGameId === 'phigros') {
    return <PhigrosRecordsScreen />;
  }

  if (activeGameId === 'chunithm') {
    return <ChunithmRecordsScreen />;
  }

  if (activeGameId !== 'maimai') {
    return <EmptyDataView title="暂无成绩" detail="当前游戏暂未接入成绩数据" />;
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput accessibilityLabel="成绩搜索" autoCapitalize="none" autoCorrect={false}
          placeholder="曲名 / 曲师 / 谱师 / 罗马音" placeholderTextColor={theme.textMuted}
          value={keyword} onChangeText={setKeyword}
          style={[styles.searchBox, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
      </View>
      <MaimaiFilterBar collapsed={collapsed} onCollapsedChange={setCollapsed}
        difficulty={difficulty} version={version} type={type}
        constantMin={constantMin} constantMax={constantMax}
        achievementMin={achievementMin} achievementMax={achievementMax}
        soloAchievement={soloAchievement} multiAchievement={multiAchievement}
        versionLocale={versionLocale} versions={versions}
        dxRatingTags={dxRatingChartTags.data?.tags ?? []}
        selectedDxRatingTagIds={selectedDxRatingTagIds}
        dxRatingTagState={dxRatingChartTags.data ? 'ready' : dxRatingChartTags.isLoading ? 'loading' : 'unavailable'}
        onDifficultyChange={setDifficulty} onVersionChange={setVersion} onTypeChange={setType}
        onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
        onAchievementMinChange={setAchievementMin} onAchievementMaxChange={setAchievementMax}
        onSoloAchievementChange={setSoloAchievement} onMultiAchievementChange={setMultiAchievement}
        onVersionLocaleChange={setVersionLocale} onDxRatingTagIdsChange={setSelectedDxRatingTagIds}
        onReset={clearFilters} />
      <RecordsListPage<ScoreRecord>
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="当前筛选条件下没有成绩"
        data={data && filtered.length > 0 ? filtered : undefined}
        flatListProps={{
          testID: 'records-results-list',
          contentInsetAdjustmentBehavior: 'automatic',
          style: styles.list,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 16 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          keyExtractor: recordKey,
          ...TAB_LIST_CACHE_PROPS,
          ListHeaderComponent: data ? <View style={styles.header}><SourceStatus items={[
            { key: 'scores', label: data.source.label, updatedAt: data.source.updatedAt, state: data.source.isStale ? 'cache' : 'live' },
            { key: 'catalog', label: data.catalogSource.label, updatedAt: data.catalogSource.updatedAt, state: data.catalogSource.isStale ? 'cache' : 'live' },
            ...(dxRatingChartTags.data ? [{
              key: 'dxrating-tags' as const,
              label: dxRatingChartTags.data.source.label,
              updatedAt: dxRatingChartTags.data.source.updatedAt,
              state: dxRatingChartTags.data.source.isStale ? 'cache' as const : 'live' as const,
            }] : dxRatingChartTags.isError ? [{
              key: 'dxrating-tags' as const, label: 'DXRating 标签不可用', state: 'unavailable' as const,
            }] : []),
          ]} /><Text style={styles.note}>共 {filtered.length} 条成绩</Text></View> : null,
          renderItem: renderRecord,
        }}
      />
    </View>
  );
}

const renderRecord: ListRenderItem<ScoreRecord> = ({ item }) => <ScoreRecordCard record={item} />;
function recordKey(record: ScoreRecord): string {
  return `${record.songId}-${record.type}-${record.levelIndex}`;
}

function ChunithmRecordsScreen() {
  const gameData = useGameData();
  const catalogQuery = useChunithmCatalog();
  const activeProviderId = useSession((state) => state.activeProviderId);
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
            <SourceStatus items={[
              ...(payload?.source ? [{
                key: 'scores' as const,
                label: payload.source.label,
                updatedAt: payload.source.updatedAt,
                state: payload.source.isStale ? 'cache' as const : 'live' as const,
              }] : []),
              ...(catalogQuery.data?.source ? [{
                key: 'catalog' as const,
                label: catalogQuery.data.source.label,
                updatedAt: catalogQuery.data.source.updatedAt,
                state: catalogQuery.data.source.isStale ? 'cache' as const : 'live' as const,
              }] : []),
            ]} />
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
  const hasSession = session?.mode === 'phi-session';
  const phigrosPayload = gameData.data?.payload.kind === 'phigros' ? gameData.data.payload : null;
  const records = useMemo(
    () => phigrosPayload?.records ?? [],
    [phigrosPayload?.records],
  );

  const catalogSongs = useMemo(
    () => catalogQuery.data?.snapshot.songs ?? [],
    [catalogQuery.data?.snapshot.songs],
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

  const searchDocs = useMemo(() => new Map(
    records.map((r) => {
      const title = titleMap.get(r.songId) ?? r.songId;
      const song = catalogSongs.find((item) => item.id === r.songId);
      return [recordKey(r), {
        ...buildSearchDocument([r.songId, title, ...(song?.aliases ?? [])]),
        title,
      }] as const;
    }),
  ), [catalogSongs, records, titleMap]);

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
  const source: DataSource = phigrosPayload?.source ?? {
    kind: 'generated',
    label: 'TapTap云存档',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
  const catalogSource: DataSource = phigrosPayload?.catalogSource
    ?? catalogQuery.data?.snapshot.source
    ?? {
      kind: 'generated',
      label: 'Phigros',
      updatedAt: new Date().toISOString(),
      isStale: false,
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

  if (!hasSession && !isGameLoading) {
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
            <SourceStatus items={[
              { key: 'scores', label: source.label, updatedAt: source.updatedAt, state: source.isStale ? 'cache' : 'live' },
              { key: 'catalog', label: catalogSource.label, updatedAt: catalogSource.updatedAt, state: catalogSource.isStale ? 'cache' : 'live' },
              ...(kyouChartTags.data ? [{
                key: 'phigros-kyou-tags' as const,
                label: kyouChartTags.data.source.label,
                updatedAt: kyouChartTags.data.source.updatedAt,
                state: kyouChartTags.data.source.isStale ? 'cache' as const : 'live' as const,
              }] : kyouChartTags.isError ? [{
                key: 'phigros-kyou-tags' as const,
                label: 'Kyou 谱面标签不可用',
                state: 'unavailable' as const,
              }] : []),
            ]} />
            <Text style={styles.note}>共 {filtered.length} 条成绩</Text>
          </View>,
          renderItem: ({ item }) => (
            <PhigrosScoreCard
              record={item.record}
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  note: { color: '#6B7280', marginBottom: 6 },
  header: { gap: 9 },
  searchArea: { padding: 12, paddingBottom: 8 },
  searchBox: { borderWidth: 1, borderRadius: 10, padding: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  statusText: { fontSize: 16, fontWeight: '600' },
  statusHint: { fontSize: 13 },
});
