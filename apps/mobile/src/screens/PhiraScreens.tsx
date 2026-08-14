import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, InteractionManager, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { QueryStateView } from '@/components/QueryStateView';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { AutoScrollText } from '@/components/game-content/AutoScrollText';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { SongMetadataTable } from '@/components/game-content/SongMetadataTable';
import { Card } from '@/components/Card';
import { SourceStatus } from '@/components/SourceStatus';
import { TagEditor } from '@/components/TagEditor';
import { PhigrosFilterBar } from '@/components/phigros/PhigrosFilterBar';
import { PhigrosRateBadge, resolvePhigrosRate } from '@/components/phigros/PhigrosRateBadge';
import { PhigrosScoreValue } from '@/components/phigros/PhigrosScoreValue';
import { PhigrosDetailChrome, PHIGROS_SONG_DETAIL_STYLES as detailStyles } from '@/components/phigros/PhigrosSongDetail';
import { PhigrosXingBadge } from '@/components/phigros/PhigrosXingBadge';
import { PhiraScoreCard } from '@/components/phira/PhiraScoreCard';
import { PhiraSongRow } from '@/components/phira/PhiraSongRow';
import { phiraPlayerIdFromAccountId } from '@/domain/bound-account';
import { filterPhiraBests, filterPhiraCharts, type PhiraCatalogSort, type PhiraScoreSort } from '@/domain/phira-filters';
import { formatPhiraAccuracy, formatPhiraRating, PHIRA_STATUS_LABELS, phiraChartStatus, type PhiraChart, type PhiraChartStatus, type PhiraQueriedBest } from '@/domain/phira';
import { buildTagHistory } from '@/domain/user-library';
import { presentPhiraBestSection, presentPhiraChart } from '@/features/game-content/adapters';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { usePhiraBests, usePhiraChart, usePhiraChartBest, usePhiraCharts, usePhiraNotes, usePhiraPlayer, usePhiraUploader, useRefreshAllPhiraBests } from '@/hooks/use-phira';
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

function Search({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const theme = useAppTheme();
  return <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
    <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor={theme.textMuted} style={[styles.search, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]} />
  </View>;
}

export function PhiraBestScreen() {
  const theme = useAppTheme(); const inset = useNativeTabBottomInset(); const id = usePlayerId(); const player = usePhiraPlayer(id);
  const ordered = (player.data?.pool.bestPool ?? []).map((pool) => ({
    chart: pool.chart, record: pool.record, poolRks: pool.rks, queriedAt: player.data?.source?.updatedAt ?? '',
  })).slice(0, 20);
  const presented = presentPhiraBestSection(ordered); const sections = [{ id: presented.id, title: presented.title, data: ordered }];
  return <View style={[styles.page, { backgroundColor: theme.background }]}><BestListPage<PhiraQueriedBest, typeof sections[number]>
    isLoading={player.isLoading} isError={player.isError} error={player.error}
    onRetry={() => { void player.refetch(); }} isEmpty={!player.isLoading && ordered.length === 0}
    emptyText={id === null ? '请先绑定 Phira 玩家' : '当前官方池没有 Best 成绩'} data={ordered.length ? sections : undefined}
    sectionListProps={{ style: styles.list, contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
      keyExtractor: (item) => String(item.record!.id), stickySectionHeadersEnabled: false,
      renderSectionHeader: ({ section }) => <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text><Text style={{ color: theme.textMuted }}>{section.data.length} 条</Text></View>,
      renderItem: ({ item, index }) => <PhiraScoreCard item={item} rank={index + 1} /> }} /></View>;
}

export function PhiraRecordsScreen() {
  const theme = useAppTheme(); const inset = useNativeTabBottomInset(); const id = usePlayerId(); const player = usePhiraPlayer(id); const query = usePhiraBests(id);
  const refreshAll = useRefreshAllPhiraBests(id);
  const filter = usePhiraRecordsFilter();
  const items = useMemo(() => filterPhiraBests(actualBests(query.data?.items), filter), [filter, query.data?.items]);
  const retry = async () => { await refreshAll(); await query.refetch(); };
  const controls = <><Search value={filter.keyword} onChangeText={filter.setKeyword} placeholder="搜索已查询歌曲" />
    <PhigrosFilterBar showLevel={false} level="all" onLevelChange={() => undefined}
      collapsed={filter.collapsed} onCollapsedChange={filter.setCollapsed}
      constantMin={filter.constantMin} constantMax={filter.constantMax}
      accuracyMin={filter.accuracyMin} accuracyMax={filter.accuracyMax}
      rank={filter.rank} xing={filter.xing} onConstantMinChange={filter.setConstantMin}
      onConstantMaxChange={filter.setConstantMax} onAccuracyMinChange={filter.setAccuracyMin}
      onAccuracyMaxChange={filter.setAccuracyMax} onRankChange={filter.setRank}
      onXingChange={filter.setXing} selectRows={[{
        id: 'sort', label: '排序', value: filter.sort, defaultValue: 'score', options: PHIRA_SCORE_SORT_OPTIONS,
        accessibilityLabel: '选择成绩排序', optionAccessibilityPrefix: '选择成绩排序',
        onChange: (value) => filter.setSort(value as PhiraScoreSort),
      }]} onReset={filter.clearFilters} /></>;
  return <View style={[styles.page, { backgroundColor: theme.background }]}><RecordsListPage beforeList={controls}
    isLoading={player.isLoading || query.isLoading} isError={player.isError || query.isError} error={player.error ?? query.error} onRetry={() => void retry()} isEmpty={!player.isLoading && !query.isLoading && items.length === 0}
    emptyText="查询过歌曲后，最佳成绩会显示在这里" data={items.length ? items : undefined}
    flatListProps={{ style: styles.list, contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }], refreshing: player.isFetching || query.isFetching, onRefresh: () => void retry(), keyExtractor: (item) => String(item.record!.id), renderItem: ({ item }) => <PhiraScoreCard item={item} /> }} /></View>;
}

export function PhiraCatalogScreen() {
  const theme = useAppTheme(); const inset = useNativeTabBottomInset(); const [status, setStatus] = useState<PhiraChartStatus>('ranked'); const [keyword, setKeyword] = useState('');
  const [collapsed, setCollapsed] = useState(true); const [constantMin, setConstantMin] = useState(''); const [constantMax, setConstantMax] = useState(''); const [sort, setSort] = useState<PhiraCatalogSort>('updated');
  const debounced = useDebouncedValue(keyword, 350); const query = usePhiraCharts(status, debounced);
  const charts = useMemo(() => filterPhiraCharts(query.data?.pages.flatMap((page) => page.results) ?? [], constantMin, constantMax, sort), [constantMax, constantMin, query.data?.pages, sort]);
  const controls = <><Search value={keyword} onChangeText={setKeyword} placeholder="搜索 Phira 谱面" />
    <PhigrosFilterBar showLevel={false} level="all" onLevelChange={() => undefined} collapsed={collapsed}
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
  return <View style={[styles.page, { backgroundColor: theme.background }]}><CatalogListPage beforeList={controls} isLoading={query.isLoading} isError={query.isError} error={query.error}
    onRetry={() => void query.refetch()} isEmpty={!query.isLoading && charts.length === 0} emptyText="没有找到 Phira 谱面" data={charts.length ? charts : undefined}
    flatListProps={{ style: styles.list, contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }], keyExtractor: (item) => String(item.id), renderItem: ({ item }) => <PhiraSongRow chart={item} />,
      onEndReached: () => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }, ListFooterComponent: query.isFetchingNextPage ? <ActivityIndicator /> : null }} /></View>;
}

export function PhiraSongDetailScreen({ chartId }: { chartId: string }) {
  const theme = useAppTheme(); const playerId = usePlayerId();
  const numericId = /^\d+$/.test(chartId) ? Number(chartId) : null; const chartQuery = usePhiraChart(numericId); const chart = chartQuery.data;
  const library = useUserLibrary();
  const item = chart ? library.data?.find((entry) => entry.key === library.songKey(String(chart.id))) : undefined;
  const favorite = item?.kind === 'song' ? item.favorite : false;
  return <>
    <StatusBar style="light" />
    <View style={[detailStyles.page, { backgroundColor: theme.background }]}>
      <QueryStateView<PhiraChart>
        isLoading={chartQuery.isLoading}
        isError={chartQuery.isError}
        isEmpty={numericId === null || (!chartQuery.isLoading && !chartQuery.isError && !chart)}
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
      <PhigrosDetailChrome
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
  const [deferredReady, setDeferredReady] = useState(false); const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => {
    setDeferredReady(false);
    const task = InteractionManager.runAfterInteractions(() => setDeferredReady(true));
    return () => task.cancel();
  }, [chart.id]);
  const score = usePhiraChartBest(playerId, deferredReady ? chart : undefined);
  const notes = usePhiraNotes(chart, deferredReady);
  const uploader = usePhiraUploader(deferredReady ? chart.uploader : null);
  useEffect(() => setCoverFailed(false), [chart.id]);
  const item = library.data?.find((entry) => entry.key === library.songKey(String(chart.id)));
  const colors = { bg: theme.dark ? theme.surface : '#EDE9FE', fg: '#8D5BD6' }; const presented = presentPhiraChart({ chart, notes: notes.data?.counts }, score.data);
  const xingTone = presented.achievementRows.flat().find((badge) => badge.key === 'xing')?.tone;
  const xing = xingTone === 'xing-good' ? 'good' : xingTone === 'xing-miss' ? 'miss' : null;
  const noteGroup = presented.notes[0]; const judgement = score.data?.record ? { key: 'judgements', values: [
    { key: 'perfect', label: 'Perfect', value: score.data.record.perfect }, { key: 'good', label: 'Good', value: score.data.record.good },
    { key: 'bad', label: 'Bad', value: score.data.record.bad }, { key: 'miss', label: 'Miss', value: score.data.record.miss },
  ] } : null;
  return <ScrollView testID="phira-song-detail-scroll" contentContainerStyle={detailStyles.content}>
      <View style={[detailStyles.hero, { width, height: width }]}>{chart.illustration && !coverFailed ? <Image accessibilityLabel="曲绘" source={chart.illustration} cachePolicy="disk" contentFit="cover" onError={() => setCoverFailed(true)} style={StyleSheet.absoluteFillObject} transition={120} /> : <View style={[detailStyles.heroPlaceholder, { backgroundColor: theme.input }]}><Text style={detailStyles.heroPlaceholderNote}>♪</Text></View>}
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.40)']} locations={[0, 1]} style={detailStyles.heroShade} />
        <View style={detailStyles.heroCopy}><Text numberOfLines={1} style={detailStyles.songId}>#{chart.id}</Text><AutoScrollText testID="phira-song-title-scroll" text={chart.name} textStyle={detailStyles.title} style={detailStyles.singleLine} contentContainerStyle={detailStyles.singleLineContent} /><Text numberOfLines={1} style={detailStyles.artist}>{chart.composer || '曲师未知'}</Text></View></View>
      <SongMetadataTable accessibilityLabel="歌曲详情数据" items={[
        ...(chart.illustrator?.trim() ? [{ key: 'illustrator', label: '曲绘画师', value: chart.illustrator.trim(), flex: 1 }] : []),
        { key: 'author', label: '作者', value: uploader.data?.name ?? `#${chart.uploader}`, flex: 1 },
        { key: 'status', label: '类型', value: PHIRA_STATUS_LABELS[phiraChartStatus(chart)], flex: 1 },
      ]} cellStyle={detailStyles.metadataCell} labelStyle={detailStyles.metadataLabel} measureStyle={detailStyles.metadataValueMeasure} style={detailStyles.metadataTable} testIDPrefix="phira-metadata" valueBlockStyle={detailStyles.metadataValueBlock} valueStyle={detailStyles.metadataValue} />
      {deferredReady ? <><View style={detailStyles.carousel}><GameChartResultCard testID="phira-chart-card" accessibilityLabel={`${chart.level} 难度卡片`} style={[detailStyles.chartCard, { width: Math.max(280, width - 40), backgroundColor: colors.bg, borderColor: colors.fg }]}>
        <View style={detailStyles.chartHeader}><View style={[detailStyles.diffPill, { backgroundColor: colors.fg }]}><Text style={detailStyles.diffPillText}>{chart.level}</Text></View><Text style={[detailStyles.level, { color: colors.fg }]}>{chart.difficulty.toFixed(1)}</Text></View>
        <View style={detailStyles.resultBlock}><Text style={[detailStyles.resultLabel, { color: theme.textMuted }]}>Score</Text>{score.data?.record ? <PhigrosScoreValue score={score.data.record.score} variant={score.data.record.score >= 1_000_000 ? 'phi' : score.data.record.fullCombo ? 'fc' : 'normal'} textColor={theme.text} fontSize={38} lineHeight={43} /> : <Text style={[detailStyles.scoreValue, { color: theme.text }]}>—</Text>}
          {score.data?.record ? <View style={detailStyles.badgeRow}><PhigrosRateBadge rate={resolvePhigrosRate({ dxScore: score.data.record.score, fc: score.data.record.fullCombo ? 'ap' : null })} fc={score.data.record.fullCombo} />{xing ? <PhigrosXingBadge kind={xing} /> : null}</View> : null}</View>
        <View style={detailStyles.statRow}><View style={detailStyles.statCell}><Text style={[detailStyles.resultLabel, { color: theme.textMuted }]}>ACC</Text><Text style={[detailStyles.statValue, { color: theme.text }]}>{score.data?.record ? formatPhiraAccuracy(score.data.record.accuracy) : '—'}</Text></View><View style={detailStyles.statCell}><Text style={[detailStyles.resultLabel, { color: theme.textMuted }]}>RKS</Text><Text style={[detailStyles.statValue, { color: theme.text }]}>{score.data?.poolRks == null ? '—' : score.data.poolRks.toFixed(4)}</Text></View></View>
        <View style={[detailStyles.chartDivider, { backgroundColor: theme.border }]} /><Text style={[detailStyles.chartMeta, { color: theme.textSecondary }]}>谱师：{chart.charter || '未提供'}</Text>
        {noteGroup ? <GameNoteTable mode="grid" group={noteGroup} accessibilityLabel="谱面物量" containerStyle={[detailStyles.notesTable, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} rowStyle={detailStyles.notesRow} headerRowStyle={detailStyles.notesHeaderRow} headerTextStyle={[detailStyles.notesCell, detailStyles.notesHeader, { color: theme.textMuted }]} valueTextStyle={[detailStyles.notesCell, detailStyles.notesValue, { color: theme.text }]} /> : <Text style={[detailStyles.chartMeta, { color: theme.textSecondary }]}>{notes.isLoading ? '加载物量中…' : `物量不可用${notes.data?.unavailableReason ? `：${notes.data.unavailableReason}` : ''}`}</Text>}
        {judgement ? <GameNoteTable mode="grid" group={judgement} accessibilityLabel="判定详情" containerStyle={[detailStyles.notesTable, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} rowStyle={detailStyles.notesRow} headerRowStyle={detailStyles.notesHeaderRow} headerTextStyle={[detailStyles.notesCell, detailStyles.notesHeader, { color: theme.textMuted }]} valueTextStyle={[detailStyles.notesCell, detailStyles.notesValue, { color: theme.text }]} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`查看谱面确认：${chart.name}`}
          onPress={() => router.push({
            pathname: '/songs/phigros-chart-preview',
            params: { game: 'phira', chartId: String(chart.id), title: chart.name },
          } as Href)}
          style={[detailStyles.action, { backgroundColor: 'transparent', borderColor: colors.fg }]}
        >
          <Text style={[detailStyles.actionText, { color: colors.fg }]}>查看谱面确认</Text>
        </Pressable>
      </GameChartResultCard></View>
      <View style={detailStyles.details}><SourceStatus items={[{ key: 'detail', label: 'Phira 谱面详情', updatedAt: chart.updated ?? undefined, state: chartUnavailable ? 'unavailable' : 'live' }, { key: 'scores', label: playerId === null ? '未绑定玩家' : 'Phira 最佳成绩', state: playerId === null ? 'unavailable' : score.isError ? 'unavailable' : 'live' }, { key: 'notes', label: notes.data?.counts ? '谱面物量' : '谱面物量不可用', state: notes.data?.counts ? 'live' : notes.isLoading ? 'cache' : 'unavailable' }]} />
        <Card><View style={detailStyles.songInformation}><Text style={[detailStyles.informationTitle, { color: theme.text }]}>歌曲信息</Text><Text style={[detailStyles.informationValue, { color: theme.text }]}>标签：{chart.tags.join('、') || '—'}</Text><Text style={[detailStyles.informationValue, { color: theme.text }]}>更新于：{chart.updated ? new Date(chart.updated).toLocaleString() : '—'}</Text><Text style={[detailStyles.informationValue, { color: theme.text }]}>上传于：{chart.created ? new Date(chart.created).toLocaleString() : '—'}</Text><Text style={[detailStyles.informationValue, { color: theme.text }]}>简介：{chart.description || '—'}</Text><Text style={[detailStyles.informationValue, { color: theme.text }]}>评分：{formatPhiraRating(chart.rating)}（{chart.ratingCount} 票）</Text></View></Card>
        <Card><TagEditor tags={item?.kind === 'song' ? item.tags : []} presets={library.tagPresets ?? []} historyTags={buildTagHistory(library.data ?? [], library.songKey(String(chart.id)), library.tagPresets ?? [])} disabled={library.isUpdating} onPresetsChange={library.setTagPresets} onChange={(tags) => library.setTags({ kind: 'song', songId: String(chart.id) }, tags)} /></Card>
      </View>
      </> : null}
    </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, list: { flex: 1 }, listContent: { padding: 16, gap: 10 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }, sectionTitle: { fontSize: 18, fontWeight: '800' },
  searchWrap: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth }, search: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
