import { SongInformationCard } from '@/components/game-content/SongInformationCard';
import { SongDetailHero } from '@/components/game-content/SongDetailHero';
import { SongListSectionHeader } from '@/components/game-content/SongListSectionHeader';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RemoteImage as Image } from '@/components/RemoteImage';
import { router, useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useStackScreenReady } from '@/components/CachedTabScreen';
import { QueryStateView } from '@/components/QueryStateView';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { InfinitePageFooter } from '@/components/game-content/InfinitePageFooter';
import { DetailGestureRoot } from '@/components/game-content/DetailPressable';
import { ChartAction, GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { useStableRangeBounds } from '@/components/game-content/RangeSelector';
import { SongMetadataTable } from '@/components/game-content/SongMetadataTable';
import { Card } from '@/components/Card';
import { LibraryTagEditor } from '@/components/game-content/LibraryTagEditor';
import { PhiraFilterBar } from '@/components/phira/PhiraFilterBar';
import { PhiraRateBadge, resolvePhiraRate, PhiraScoreValue, PhiraXingBadge } from '@/components/phira/PhiraScoreVisuals';
import { SongDetailChrome } from '@/components/game-content/SongDetailChrome';
import { VERTICAL_SONG_DETAIL_STYLES as detailStyles } from '@/components/game-content/SongDetailChromeStyles';
import { useNotification } from '@/components/AppNotification';
import { openChartPreviewNavigation } from '@/features/chart-preview-shared/chart-preview-open';
import { useChartPackageDownload } from '@/features/chart-download-shared/use-chart-package-download';
import { downloadPhiraChartPackage } from '@/features/phira-chart-download/chart-package-download';
import { PhiraScoreCard } from '@/components/phira/PhiraScoreCard';
import { PhiraSongRow } from '@/components/phira/PhiraSongRow';
import { phiraPlayerIdFromAccountId } from '@/domain/bound-account';
import { dedupePhiraCharts, filterPhiraBests, filterPhiraCharts, type PhiraCatalogSort, type PhiraScoreSort } from '@/domain/phira-filters';
import { formatPhiraAccuracy, formatPhiraRating, phiraCatalogListView, phiraCatalogPageState, phiraCatalogQueryIdentity, phiraCatalogScanNext, phiraCatalogScanObservation, PHIRA_STATUS_LABELS, phiraChartStatus, type PhiraCatalogScanRequest, type PhiraChart, type PhiraChartStatus, type PhiraQueriedBest } from '@/domain/phira';
import { presentPhiraBestSection, presentPhiraChart } from '@/features/game-content/adapters';
import { providerErrorToUserMessage } from '@/providers/errors';
import { buildMaxedPhiraBest } from '@/providers/maxed-phira-test-provider';
import { useLocalSearch } from '@/hooks/use-local-search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePhiraBests, usePhiraChart, usePhiraChartBest, usePhiraCharts, usePhiraDemoBests, usePhiraNotes, usePhiraUploader, useRefreshAllPhiraBests, type PhiraBestRefreshOutcome } from '@/hooks/use-phira';
import { useGameData } from '@/hooks/use-game-data';
import { usePhiraRecordsFilter } from '@/state/phira-records-filter';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

function usePlayerId() { return phiraPlayerIdFromAccountId(useSession((state) => state.activeAccountId)); }
const actualBests = (items: Record<string, PhiraQueriedBest> | undefined) => Object.values(items ?? {}).filter((item) => item.record !== null);

const PHIRA_SCORE_SORT_OPTIONS = [
  { value: 'score', label: 'Score' }, { value: 'acc', label: 'ACC' }, { value: 'constant', label: '定数' },
] as const;
const PHIRA_CATALOG_STATUS_OPTIONS = [
  { value: 'ranked', label: '上架' }, { value: 'special', label: '特殊' }, { value: 'unstable', label: '未上架' },
] as const;
const PHIRA_CATALOG_SORT_OPTIONS = [
  { value: 'updated', label: '最近更新' }, { value: 'constant-desc', label: '定数降序' },
  { value: 'constant-asc', label: '定数升序' }, { value: 'name', label: '名称' },
] as const;

export function PhiraBestScreen() {
  const id = usePlayerId(); const gameData = useGameData();
  const accountId = useSession((state) => state.activeAccountId);
  const example = accountId === 'phira:test';
  const demo = usePhiraDemoBests(accountId, example);
  const player = gameData.data?.payload?.kind === 'phira' ? gameData.data.payload.snapshot : undefined;
  const official = useMemo(() => (player?.pool.bestPool ?? []).map((pool) => ({
    chart: pool.chart, record: pool.record, poolRks: pool.rks, queriedAt: player?.source?.updatedAt ?? '',
  })).slice(0, 20), [player?.pool.bestPool, player?.source?.updatedAt]);
  const ordered = example ? demo.items : official;
  const query = example ? demo : gameData;
  const presented = presentPhiraBestSection(ordered); const sections = [{ id: presented.id, title: example ? '最佳成绩' : presented.title, data: ordered }];
  return <BestListPage<PhiraQueriedBest, typeof sections[number]>
    isLoading={query.isLoading} isError={query.isError} error={query.error}
    onRetry={() => { void query.refetch(); }} isEmpty={!query.isLoading && ordered.length === 0}
    emptyText={example ? '当前没有最佳成绩' : id === null ? '请先绑定 Phira 玩家' : '当前官方池没有 Best 成绩'}
    emptyActionLabel={example && demo.hasNextPage ? '继续加载' : undefined}
    onEmptyAction={example && demo.hasNextPage ? () => { if (!demo.isFetchingNextPage) void demo.fetchNextPage(); } : undefined}
    data={ordered.length ? sections : undefined}
    sectionListProps={{ testID: 'phira-best-results-list',
      keyExtractor: (item) => String(item.record!.id),
      renderSectionHeader: ({ section }) => <SongListSectionHeader title={section.title} value={`${section.data.length} 条`} />,
      onEndReached: () => { if (example && demo.hasNextPage && !demo.isFetchingNextPage) void demo.fetchNextPage(); },
      ListFooterComponent: example ? <InfinitePageFooter loading={demo.isFetchingNextPage} failed={demo.isFetchNextPageError} hasNextPage={demo.hasNextPage === true} onRetry={() => void demo.fetchNextPage()} /> : undefined,
      renderItem: ({ item, index }) => <PhiraScoreCard item={item} rank={index + 1} /> }} />;
}

export function PhiraRecordsScreen() {
  const id = usePlayerId();
  const accountId = useSession((state) => state.activeAccountId);
  const example = accountId === 'phira:test';
  const realQuery = usePhiraBests(id, !example);
  const demo = usePhiraDemoBests(accountId, example);
  const query = example ? demo : realQuery;
  const refresh = useRefreshAllPhiraBests(id);
  const { showNotification, showActionNotification } = useNotification();
  const filter = usePhiraRecordsFilter();
  const officialItems = useMemo(() => actualBests(realQuery.data?.items), [realQuery.data?.items]);
  const unfilteredItems = example ? demo.items : officialItems;
  const constantValues = useMemo(() => unfilteredItems.map((item) => item.chart.difficulty), [unfilteredItems]);
  const constantBounds = useStableRangeBounds(
    constantValues,
    { minimum: 0, maximum: 20 },
    filter.constantMin,
    filter.constantMax,
    `${accountId}:${example ? demo.dataUpdatedAt : realQuery.data?.source.updatedAt ?? 'loading'}`,
  );
  const sortedItems = useMemo(() => example ? undefined : filterPhiraBests(unfilteredItems, {
    keyword: '', constantMin: '', constantMax: '', accuracyMin: '', accuracyMax: '', rank: null, xing: null, sort: filter.sort,
  }), [example, filter.sort, unfilteredItems]);
  const selectBest = useCallback((item: PhiraQueriedBest, filters: typeof filter) => filterPhiraBests([item], filters)[0], []);
  const search = useLocalSearch(sortedItems, filter, selectBest);
  const demoFiltered = useMemo(() => example ? filterPhiraBests(unfilteredItems, filter) : [], [example, filter, unfilteredItems]);
  const items = example ? demoFiltered : search.data;
  const isFiltering = !example && search.isFiltering;
  const runRefresh = async (task: () => Promise<PhiraBestRefreshOutcome>) => {
    let outcome: PhiraBestRefreshOutcome;
    try {
      outcome = await task();
    } catch (error) {
      showNotification({
        title: '刷新失败',
        message: providerErrorToUserMessage(error, '暂时无法刷新成绩，请稍后重试。'),
        variant: 'error',
      });
      return;
    }
    if (outcome.status !== 'partial' && outcome.status !== 'failed') return;
    showActionNotification({
      title: outcome.status === 'partial' ? '部分谱面成绩未更新' : '谱面成绩未更新',
      message: `${outcome.failedChartIds.length} 首谱面刷新失败，可点此重试。`,
      variant: 'warning',
      actions: [{ label: '重试失败项', onPress: () => void runRefresh(refresh.retryFailed) }],
    });
  };
  const retry = async () => { if (!example) await runRefresh(refresh.refreshAll); await query.refetch(); };
  const controls = <><GameSearchHeader value={filter.keyword} onChangeText={filter.setKeyword} placeholder="搜索已查询歌曲" />
    <PhiraFilterBar
      collapsed={filter.collapsed} onCollapsedChange={filter.setCollapsed}
      constantMin={filter.constantMin} constantMax={filter.constantMax}
      constantBounds={constantBounds}
      accuracyMin={filter.accuracyMin} accuracyMax={filter.accuracyMax}
      rank={filter.rank} xing={filter.xing} onConstantMinChange={filter.setConstantMin}
      onConstantMaxChange={filter.setConstantMax} onAccuracyMinChange={filter.setAccuracyMin}
      onAccuracyMaxChange={filter.setAccuracyMax} onRankChange={filter.setRank}
      onXingChange={filter.setXing} selectRows={[{
        id: 'sort', label: '排序', value: filter.sort, defaultValue: 'score', options: PHIRA_SCORE_SORT_OPTIONS,
        accessibilityLabel: '选择成绩排序', optionAccessibilityPrefix: '选择成绩排序',
        onChange: (value) => filter.setSort(value as PhiraScoreSort),
      }]} onReset={filter.clearFilters} /></>;
  return <RecordsListPage beforeList={controls}
    isLoading={query.isLoading || (isFiltering && items.length === 0)} isError={query.isError} error={query.error} onRetry={() => void retry()} isEmpty={!query.isLoading && items.length === 0}
    emptyText={example ? '没有符合条件的成绩' : '查询过歌曲后，最佳成绩会显示在这里'}
    emptyActionLabel={example && demo.hasNextPage ? '继续加载' : undefined}
    onEmptyAction={example && demo.hasNextPage ? () => { if (!demo.isFetchingNextPage) void demo.fetchNextPage(); } : undefined}
    data={items.length ? items : undefined}
    flatListProps={{ testID: 'phira-records-list',
      refreshing: example ? demo.isRefetching : realQuery.isFetching, onRefresh: () => void retry(), keyExtractor: (item) => String(item.record!.id),
      onEndReached: () => { if (example && demo.hasNextPage && !demo.isFetchingNextPage) void demo.fetchNextPage(); },
      ListFooterComponent: example ? <InfinitePageFooter loading={demo.isFetchingNextPage} failed={demo.isFetchNextPageError} hasNextPage={demo.hasNextPage === true} onRetry={() => void demo.fetchNextPage()} /> : undefined,
      renderItem: ({ item }) => <PhiraScoreCard item={item} /> }} />;
}

export function PhiraCatalogScreen() {
  const [status, setStatus] = useState<PhiraChartStatus>('ranked'); const [keyword, setKeyword] = useState('');
  const [collapsed, setCollapsed] = useState(true); const [constantMin, setConstantMin] = useState(''); const [constantMax, setConstantMax] = useState(''); const [sort, setSort] = useState<PhiraCatalogSort>('updated');
  const debounced = useDebouncedValue(keyword, 350); const query = usePhiraCharts(status, debounced);
  const charts = useMemo(() => filterPhiraCharts(dedupePhiraCharts(query.data?.pages.flatMap((page) => page.results) ?? []), constantMin, constantMax, sort), [constantMax, constantMin, query.data?.pages, sort]);
  const pageCount = query.data?.pages.length ?? 0;
  const pageState = phiraCatalogPageState<PhiraChart>({
    items: charts,
    pageCount,
    hasNextPage: query.hasNextPage === true,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchNextPageError: query.isFetchNextPageError,
  });
  const view = phiraCatalogListView(pageState);
  const scanning = pageState.status === 'ready' && pageState.scanning;
  const fetchNextPage = query.fetchNextPage;
  const scanPageParams = query.data?.pageParams;
  const scanLastCursor = scanPageParams?.[scanPageParams.length - 1] ?? null;
  const scanObservation = useMemo(() => phiraCatalogScanObservation({
    identity: phiraCatalogQueryIdentity(status, debounced),
    pageCount,
    lastCursor: scanLastCursor,
    scanning,
    isFetchingNextPage: query.isFetchingNextPage,
  }), [debounced, pageCount, query.isFetchingNextPage, scanLastCursor, scanning, status]);
  const scanRequested = useRef<PhiraCatalogScanRequest | null>(null);
  useEffect(() => {
    const step = phiraCatalogScanNext({ observation: scanObservation, requested: scanRequested.current });
    scanRequested.current = step.requested;
    if (step.action !== 'fetch') return;
    const requested = step.requested;
    void fetchNextPage().catch(() => {
      if (scanRequested.current === requested) scanRequested.current = null;
    });
  }, [fetchNextPage, scanObservation]);
  const controls = <><GameSearchHeader value={keyword} onChangeText={setKeyword} placeholder="搜索 Phira 谱面" />
    <PhiraFilterBar collapsed={collapsed}
      constantMin={constantMin} constantMax={constantMax} onCollapsedChange={setCollapsed}
      onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
      selectRows={[
        { id: 'status', label: '类别', value: status, defaultValue: 'ranked', options: PHIRA_CATALOG_STATUS_OPTIONS,
          accessibilityLabel: '选择谱面类别', optionAccessibilityPrefix: '选择谱面类别',
          onChange: (value) => setStatus(value as PhiraChartStatus) },
        { id: 'sort', label: '排序', value: sort, defaultValue: 'updated', options: PHIRA_CATALOG_SORT_OPTIONS,
          accessibilityLabel: '选择曲库排序', optionAccessibilityPrefix: '选择曲库排序',
          onChange: (value) => setSort(value as PhiraCatalogSort) },
      ]}
      onReset={() => { setStatus('ranked'); setSort('updated'); setConstantMin(''); setConstantMax(''); }} /></>;
  const footer = (
    <InfinitePageFooter
      loading={query.isFetchingNextPage || scanning}
      failed={pageState.status === 'ready' && pageState.nextPageFailed}
      hasNextPage={pageState.status === 'ready' && pageState.hasNextPage}
      onRetry={() => void fetchNextPage()}
    />
  );
  const pausedByScanBudget = view.emptyReason === 'scanBudget';
  return <CatalogListPage<PhiraChart> beforeList={controls}
    isLoading={view.isLoading} isError={view.isError} error={query.error}
    onRetry={() => void query.refetch()} isEmpty={view.isEmpty}
    emptyText={pausedByScanBudget ? `已扫描 ${pageCount} 页仍无匹配谱面` : '没有找到 Phira 谱面'}
    emptyActionLabel={pausedByScanBudget ? '继续扫描' : undefined}
    onEmptyAction={pausedByScanBudget ? () => void fetchNextPage() : undefined}
    data={view.data}
    flatListProps={{ testID: 'phira-catalog-results-list',
      keyExtractor: (item) => String(item.id), renderItem: ({ item }) => <PhiraSongRow chart={item} />,
      onEndReached: () => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }, ListFooterComponent: footer }} />;
}

export function PhiraSongDetailScreen({ chartId }: { chartId: string }) {
  const theme = useAppTheme(); const playerId = usePlayerId();
  const numericId = /^\d+$/.test(chartId) ? Number(chartId) : null; const chartQuery = usePhiraChart(numericId); const chart = chartQuery.data;
  const loading = !chart && numericId !== null && chartQuery.isPending;
  const library = useUserLibrary();
  const item = chart ? library.data?.find((entry) => entry.key === library.songKey(String(chart.id))) : undefined;
  const favorite = item?.kind === 'song' ? item.favorite : false;
  return <>
    <StatusBar style="light" />
    <View style={[detailStyles.page, { backgroundColor: theme.background }]}>
      <QueryStateView<PhiraChart>
        isLoading={loading}
        isError={chartQuery.isError}
        isEmpty={numericId === null || (!loading && !chartQuery.isError && !chart)}
        error={chartQuery.error}
        onRetry={() => void chartQuery.refetch()}
        emptyText="找不到这首谱面"
        data={chart}
        renderData={(detailChart) => <PhiraSongDetailContent
          chart={detailChart}
          chartUnavailable={chartQuery.isError}
          library={library}
          playerId={playerId}
        />}
      />
      <SongDetailChrome
        songTitle={chart?.name}
        favorite={favorite}
        favoriteDisabled={library.isLoading || library.isUpdating}
        onToggleFavorite={chart ? () => void library.setSongFavorite(String(chart.id), !favorite) : undefined}
      />
    </View>
  </>;
}

type PhiraLibraryHook = ReturnType<typeof useUserLibrary>;

function PhiraSongDetailContent({
  chart,
  chartUnavailable,
  library,
  playerId,
}: {
  chart: PhiraChart;
  chartUnavailable: boolean;
  library: PhiraLibraryHook;
  playerId: number | null;
}) {
  const theme = useAppTheme(); const { width } = useWindowDimensions();
  const { showNotification } = useNotification();
  const { isRunning: downloadRunning, start: startChartDownload } = useChartPackageDownload({
    successMessage: '可将 ZIP 文件导入 Phira 游玩。',
  });
  const navigation = useNavigation();
  const cancelPreviewNavigation = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPreviewNavigation.current?.(), []);
  const deferredReady = useStackScreenReady(); const [coverFailed, setCoverFailed] = useState(false);
  const example = useSession((state) => state.activeAccountId) === 'phira:test';
  const scoreQuery = usePhiraChartBest(playerId, deferredReady ? chart : undefined);
  const notes = usePhiraNotes(chart, deferredReady);
  const score = { ...scoreQuery, data: example ? buildMaxedPhiraBest(chart, notes.data?.counts) : scoreQuery.data };
  const uploader = usePhiraUploader(deferredReady ? chart.uploader : null);
  useEffect(() => setCoverFailed(false), [chart.id]);
  const colors = { bg: theme.dark ? theme.surface : '#EDE9FE', fg: '#8D5BD6' }; const presented = presentPhiraChart({ chart, notes: notes.data?.counts }, score.data);
  const xingTone = presented.achievementRows.flat().find((badge) => badge.key === 'xing')?.tone;
  const xing = xingTone === 'xing-good' ? 'good' : xingTone === 'xing-miss' ? 'miss' : null;
  const noteGroup = presented.notes[0]; const judgement = score.data?.record && (!example || notes.data?.counts) ? { key: 'judgements', values: [
    { key: 'perfect', label: 'Perfect', value: score.data.record.perfect }, { key: 'good', label: 'Good', value: score.data.record.good },
    { key: 'bad', label: 'Bad', value: score.data.record.bad }, { key: 'miss', label: 'Miss', value: score.data.record.miss },
  ] } : null;
  return <ScrollView testID="phira-song-detail-scroll" contentContainerStyle={detailStyles.content}>
      <SongDetailHero size={width} id={`#${chart.id}`} title={chart.name} artist={chart.composer || '曲师未知'} titleTestID="phira-song-title-scroll"
        cover={chart.illustration && !coverFailed ? <Image accessibilityLabel="曲绘" source={chart.illustration} cacheProfile="artwork" gameId="phira" contentFit="cover" onError={() => setCoverFailed(true)} style={StyleSheet.absoluteFill} transition={120} /> : undefined} />
      <SongMetadataTable accessibilityLabel="歌曲详情数据" items={[
        ...(chart.illustrator?.trim() ? [{ key: 'illustrator', label: '曲绘画师', value: chart.illustrator.trim(), flex: 1 }] : []),
        { key: 'author', label: '作者', value: uploader.data?.name ?? `#${chart.uploader}`, flex: 1 },
        { key: 'status', label: '类型', value: PHIRA_STATUS_LABELS[phiraChartStatus(chart)], flex: 1 },
      ]} testIDPrefix="phira-metadata" />
      {deferredReady ? <><View style={detailStyles.carousel}><GameChartResultCard testID="phira-chart-card" accessibilityLabel={`${chart.level} 难度卡片`} style={[detailStyles.chartCard, { width: Math.max(280, width - 40), backgroundColor: colors.bg, borderColor: colors.fg }]}
          summary={{
            difficulty: chart.level, level: chart.difficulty.toFixed(1), levelColor: colors.fg, label: 'Score',
          value: score.data?.record && <PhiraScoreValue score={score.data.record.score}
            variant={score.data.record.score >= 1_000_000 ? 'phi' : score.data.record.fullCombo ? 'fc' : 'normal'}
            textColor={theme.text} fontSize={38} lineHeight={43} />,
          badges: score.data?.record && <><PhiraRateBadge rate={resolvePhiraRate(score.data.record)} fc={score.data.record.fullCombo} />
            {xing && <PhiraXingBadge kind={xing} />}</>,
          metrics: [{ label: 'ACC', text: score.data?.record ? formatPhiraAccuracy(score.data.record.accuracy) : '—' },
            { label: 'RKS', text: score.data?.poolRks?.toFixed(4) ?? '—' }], charter: chart.charter || '未提供',
          }}>
        {noteGroup ? <GameNoteTable mode="grid" group={noteGroup} accessibilityLabel="谱面物量" /> : <Text style={[detailStyles.chartMeta, { color: theme.textSecondary }]}>{notes.isLoading ? '加载物量中…' : `物量不可用${notes.data?.unavailableReason ? `：${notes.data.unavailableReason}` : ''}`}</Text>}
        {judgement ? <GameNoteTable mode="grid" group={judgement} accessibilityLabel="判定详情" /> : null}
        <DetailGestureRoot>
          <ChartAction label="查看谱面确认"
            accessibilityLabel={`查看谱面确认：${chart.name}`}
            onPress={() => {
              cancelPreviewNavigation.current?.();
              cancelPreviewNavigation.current = openChartPreviewNavigation({ game: 'phira', chart }, {
                push: (href) => router.push(href),
                topRouteName: () => {
                  const state = typeof navigation.getState === 'function' ? navigation.getState() : undefined;
                  return state?.routes[state.index ?? 0]?.name;
                },
                onFail: (message) => showNotification({
                  title: '无法打开谱面确认',
                  message,
                  variant: 'error',
                }),
              });
            }}
            stack="first" style={{ backgroundColor: 'transparent', borderColor: colors.fg }}
            textStyle={{ color: colors.fg }} />
          <ChartAction label="下载谱面文件"
            accessibilityLabel={`下载谱面文件：${chart.name}`}
            accessibilityState={{ disabled: downloadRunning }}
            disabled={downloadRunning}
            onPress={() => {
              void startChartDownload((options) => downloadPhiraChartPackage(chart, options));
            }}
            stack="next" style={{ backgroundColor: 'transparent', borderColor: colors.fg }}
            textStyle={{ color: colors.fg }} />
        </DetailGestureRoot>
      </GameChartResultCard></View>
      <View style={detailStyles.details}>
        <SongInformationCard prominent style={detailStyles.songInformation} fields={[
          { label: '标签', value: chart.tags.join('、') || '—' },
          { label: '更新于', value: chart.updated ? new Date(chart.updated).toLocaleString() : '—' },
          { label: '上传于', value: chart.created ? new Date(chart.created).toLocaleString() : '—' },
          { label: '简介', value: chart.description || '—' },
          { label: '评分', value: `${formatPhiraRating(chart.rating)}（${chart.ratingCount} 票）` },
        ]} />
        <Card><LibraryTagEditor library={library} target={{ kind: 'song', songId: String(chart.id) }} /></Card>
      </View>
      </> : null}
    </ScrollView>;
}
