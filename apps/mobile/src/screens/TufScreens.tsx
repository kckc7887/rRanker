import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { SongMetadataTable, type SongMetadataItem } from '@/components/game-content/SongMetadataTable';
import { Card } from '@/components/Card';
import { TagEditor } from '@/components/TagEditor';
import { TufScoreCard } from '@/components/adofai/TufScoreCard';
import { TufSongRow } from '@/components/adofai/TufSongRow';
import {
  TufCatalogFilterBar, TufRecordsFilterBar, type TufDifficultyBand,
} from '@/components/adofai/TufFilterBar';
import { QueryStateView } from '@/components/QueryStateView';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { tufPlayerIdFromAccountId } from '@/domain/bound-account';
import type { TufLevelSort, TufPass, TufPassSort, TufSortOrder } from '@/domain/tuf';
import { buildTagHistory } from '@/domain/user-library';
import { presentTufChart } from '@/features/game-content/adapters';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useTufDifficulties, useTufLevel, useTufLevelSearch, useTufPasses, useTufProfile } from '@/hooks/use-tuf';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

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
  const passById = new Map(allPasses.map((pass) => [pass.id, pass]));
  const ordered = profile.data?.topScores.slice(0, 20).flatMap((top) => {
    const pass = passById.get(top.id);
    return pass ? [{ ...pass, impact: top.impact }] : [];
  }) ?? [];
  const missing = Math.max(0, Math.min(20, profile.data?.topScores.length ?? 0) - ordered.length);
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
        ListHeaderComponent: missing > 0 ? <Text style={[styles.notice, { color: theme.textMuted }]}>有 {missing} 条 Top 记录未公开，已跳过。</Text> : null,
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
  const [keyword, setKeyword] = useState('');
  const [filterExpanded, setFilterExpanded] = useState(true);
  const debounced = useDebouncedValue(keyword, 350);
  const query = useTufPasses(playerId, { sortBy, order, bestPerLevel, query: debounced.trim() || undefined });
  const records = uniqueById(query.data?.pages.flatMap((page) => page.passes) ?? []);
  const total = query.data?.pages[0]?.total;
  const controls = <>
    <SearchHeader accessibilityLabel="筛选 TUF 成绩" placeholder="搜索关卡、歌曲或作者" value={keyword}
      onChangeText={setKeyword} loaded={records.length} total={total} />
    <TufRecordsFilterBar expanded={filterExpanded} sortBy={sortBy} order={order} bestPerLevel={bestPerLevel}
      onExpandedChange={setFilterExpanded} onSortByChange={setSortBy} onOrderChange={setOrder}
      onBestPerLevelChange={setBestPerLevel} onReset={() => {
        setSortBy('date'); setOrder('DESC'); setBestPerLevel(false);
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
  const [filterExpanded, setFilterExpanded] = useState(true);
  const [sortBy, setSortBy] = useState<TufLevelSort>('RECENT');
  const [order, setOrder] = useState<TufSortOrder>('DESC');
  const [difficultyBand, setDifficultyBand] = useState<TufDifficultyBand>('all');
  const [includeSpecial, setIncludeSpecial] = useState(true);
  const debounced = useDebouncedValue(keyword, 350);
  const difficulties = useTufDifficulties();
  const specialDifficulties = difficulties.data?.filter((item) => item.type !== 'PGU').map((item) => item.name) ?? [];
  const pguRange = difficultyBand === 'all'
    ? (includeSpecial ? undefined : 'P1,U20')
    : `${difficultyBand}1,${difficultyBand}20`;
  const query = useTufLevelSearch(debounced, {
    sort: sortBy, order, pguRange,
    specialDifficulties: includeSpecial && difficultyBand !== 'all' && specialDifficulties.length
      ? specialDifficulties
      : undefined,
  });
  const levels = uniqueById(query.data?.pages.flatMap((page) => page.results) ?? []);
  const total = query.data?.pages[0]?.total;
  const search = <>
    <SearchHeader accessibilityLabel="搜索 TUF 关卡" placeholder="搜索关卡、歌曲或作者" value={keyword}
      onChangeText={setKeyword} loaded={levels.length} total={total} />
    <TufCatalogFilterBar expanded={filterExpanded} sortBy={sortBy} order={order} difficultyBand={difficultyBand}
      includeSpecial={includeSpecial} specialAvailable={specialDifficulties.length > 0}
      onExpandedChange={setFilterExpanded} onSortByChange={setSortBy} onOrderChange={setOrder}
      onDifficultyBandChange={setDifficultyBand} onIncludeSpecialChange={setIncludeSpecial}
      onReset={() => { setSortBy('RECENT'); setOrder('DESC'); setDifficultyBand('all'); setIncludeSpecial(true); }} />
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

function safeHttps(url: string | null | undefined): string | null {
  if (!url) return null;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' ? parsed.toString() : null; } catch { return null; }
}

export function TufLevelDetailScreen({ levelId }: { levelId: string }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const numericId = /^\d+$/.test(levelId) ? Number(levelId) : null;
  const query = useTufLevel(numericId);
  const level = query.data?.level;
  const chart = level ? presentTufChart(level) : null;
  const library = useUserLibrary();
  const songItem = level ? library.data?.find((item) => item.key === library.songKey(level.id)) : undefined;
  const favorite = songItem?.kind === 'song' && songItem.favorite;
  const favoriteDisabled = library.isLoading || library.isUpdating;
  const onToggleFavorite = level
    ? () => void library.setSongFavorite(String(level.id), !favorite)
    : undefined;
  const localTags = level ? (songItem?.kind === 'song' ? songItem.tags : []) : [];
  const tags = level?.tags.map((tag) => typeof tag === 'string' ? tag : tag.name).join('、') || '—';
  const credits = level?.levelCredits.map((credit) => `${credit.creator.name}（${credit.role}）`).join('、') || '—';
  const metadata: SongMetadataItem[] = level ? [
    { key: 'artist', label: '艺术家', value: level.artist || '—', flex: 1 },
    { key: 'bpm', label: 'BPM', value: level.bpm == null ? '—' : String(level.bpm), flex: 1 },
    { key: 'duration', label: '时长', value: level.levelLengthInMs == null ? '—' : `${(level.levelLengthInMs / 1000).toFixed(1)} 秒`, flex: 1 },
    { key: 'tiles', label: '物量', value: String(level.tilecount ?? level.autoTileCount ?? '—'), flex: 1 },
    { key: 'credits', label: '谱师 / VFX', value: credits, flex: 2 },
    { key: 'tags', label: '标签', value: tags, flex: 2 },
    { key: 'curations', label: '策展', value: level.curations.length ? `${level.curations.length} 条` : '—', flex: 1 },
    { key: 'stats', label: '社区统计', value: [
      level.clears == null ? null : `通关 ${level.clears}`,
      level.uniqueClears == null ? null : `玩家 ${level.uniqueClears}`,
      level.likes == null ? null : `喜欢 ${level.likes}`,
      level.downloadCount == null ? null : `下载 ${level.downloadCount}`,
    ].filter(Boolean).join(' · ') || (level.stats ? JSON.stringify(level.stats) : '—'), flex: 2 },
  ] : [];
  const links = level ? [
    ['TUF 关卡页', `https://tuforums.com/levels/${level.id}`],
    ['谱面下载', safeHttps(level.dlLink ?? level.downloadLink)], ['创意工坊', safeHttps(level.workshopLink)],
    ['视频', safeHttps(level.videoLink)],
  ].filter((item): item is [string, string] => typeof item[1] === 'string') : [];
  return <>
    {onToggleFavorite ? <Pressable accessibilityRole="button"
      accessibilityLabel={favorite ? `取消收藏 ${level!.song}` : `收藏 ${level!.song}`}
      disabled={favoriteDisabled} hitSlop={12}
      onPress={onToggleFavorite}
      style={({ pressed }) => [
        styles.headerButton, styles.headerFloatingButton, { top: insets.top + 8, right: 8 },
        favorite && styles.headerFavoriteActive,
        Platform.OS !== 'ios' && styles.headerButtonBg,
        Platform.OS !== 'ios' && favorite && styles.headerFavoriteActiveBg,
        pressed && { opacity: 0.7 },
      ]}>
      <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={favorite ? '#A78BFA' : '#FFFFFF'} size={22} />
    </Pressable> : null}
    <QueryStateView isLoading={query.isLoading} isError={query.isError} isEmpty={!level}
      error={query.error} onRetry={() => void query.refetch()} emptyText="未找到该 TUF 关卡" data={level}
      renderData={() => <ScrollView contentInsetAdjustmentBehavior="automatic" style={[styles.page, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.detail}>
        <Text style={[styles.detailTitle, { color: theme.text }]}>{level!.song}</Text>
        <Text style={[styles.detailArtist, { color: theme.textMuted }]}>{level!.artist || '艺术家未知'}</Text>
        <SongMetadataTable accessibilityLabel="TUF 关卡信息" items={metadata} testIDPrefix="tuf-level-metadata"
          style={styles.metadata} cellStyle={styles.metadataCell} labelStyle={styles.metadataLabel}
          valueStyle={styles.metadataValue} valueBlockStyle={styles.metadataBlock} measureStyle={styles.metadataMeasure} />
        <GameChartResultCard style={[styles.chartCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
          testID="tuf-level-chart" accessibilityLabel={`难度 ${chart!.difficulty.label}`}>
          <Text style={[styles.chartDifficulty, { color: theme.accent }]}>{chart!.difficulty.label} {chart!.difficulty.value ?? ''}</Text>
          <Text style={[styles.chartCharter, { color: theme.textMuted }]}>谱师 / VFX：{chart!.charter}</Text>
          {chart!.notes.map((group) => <GameNoteTable key={group.key} mode="cells" group={group}
            containerStyle={styles.noteTable} itemStyle={[styles.noteItem, { borderColor: theme.border }]}
            labelStyle={[styles.noteLabel, { color: theme.textMuted }]} valueStyle={[styles.noteValue, { color: theme.text }]} />)}
        </GameChartResultCard>
        <View style={styles.links}>{links.map(([label, url]) => <Pressable key={label} accessibilityRole="link"
          onPress={() => void Linking.openURL(url)} style={[styles.link, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.linkText, { color: theme.accent }]}>{label}</Text>
        </Pressable>)}</View>
        <Card>
          <TagEditor testID="tuf-level-local-tags" tags={localTags}
            presets={library.tagPresets ?? []}
            historyTags={buildTagHistory(library.data ?? [], library.songKey(level!.id), library.tagPresets ?? [])}
            disabled={library.isUpdating} onPresetsChange={library.setTagPresets}
            onChange={(tags) => library.setTags({ kind: 'song', songId: String(level!.id) }, tags)} />
        </Card>
        {level!.description ? <Text style={[styles.description, { color: theme.textMuted }]}>{level!.description}</Text> : null}
      </ScrollView>} />
  </>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, list: { flex: 1 }, listContent: { padding: 12, gap: 9 }, footer: { marginVertical: 18 },
  sectionHeader: { marginTop: 8, marginBottom: 3, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: 18, fontWeight: '900' }, sectionCount: { fontSize: 11 }, notice: { padding: 12, fontSize: 12 },
  searchWrap: { padding: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInput: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 }, resultCount: { fontSize: 11 },
  detail: { padding: 16, gap: 12, paddingBottom: 40 }, detailTitle: { fontSize: 25, fontWeight: '900' }, detailArtist: { fontSize: 14 },
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerFloatingButton: { position: 'absolute', zIndex: 30, elevation: 30 },
  headerButtonBg: { backgroundColor: 'rgba(17,24,39,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  headerFavoriteActive: {},
  headerFavoriteActiveBg: { backgroundColor: 'rgba(141,91,214,0.88)' },
  metadata: { borderRadius: 15, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }, metadataCell: { minWidth: '48%', padding: 13 },
  metadataLabel: { fontSize: 10 }, metadataValue: { fontSize: 13, fontWeight: '700' }, metadataBlock: {}, metadataMeasure: { position: 'absolute', opacity: 0 },
  chartCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 15, gap: 9 }, chartDifficulty: { fontSize: 17, fontWeight: '900' }, chartCharter: { fontSize: 12 },
  noteTable: { flexDirection: 'row', gap: 8 }, noteItem: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8, minWidth: 72 }, noteLabel: { fontSize: 9 }, noteValue: { fontSize: 15, fontWeight: '800' },
  links: { gap: 8 }, link: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 13 }, linkText: { fontWeight: '800' }, description: { lineHeight: 20 },
});
