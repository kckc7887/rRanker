import { useState } from 'react';
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { SongMetadataTable, type SongMetadataItem } from '@/components/game-content/SongMetadataTable';
import { TufScoreCard } from '@/components/adofai/TufScoreCard';
import { TufSongRow } from '@/components/adofai/TufSongRow';
import { QueryStateView } from '@/components/QueryStateView';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { tufPlayerIdFromAccountId } from '@/domain/bound-account';
import type { TufPass, TufPassSort, TufSortOrder } from '@/domain/tuf';
import { formatTufAccuracy, presentTufChart } from '@/features/game-content/adapters';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGameData } from '@/hooks/use-game-data';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useTufLevel, useTufLevelSearch, useTufPasses, useTufProfile } from '@/hooks/use-tuf';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

function useActiveTufPlayerId() {
  const accountId = useSession((state) => state.activeAccountId);
  return tufPlayerIdFromAccountId(accountId);
}

function LoadingFooter({ loading }: { loading: boolean }) {
  return loading ? <ActivityIndicator style={styles.footer} /> : null;
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

const SORTS: { id: TufPassSort; label: string }[] = [
  { id: 'score', label: 'Score' }, { id: 'speed', label: '速度' }, { id: 'date', label: '日期' },
  { id: 'xacc', label: 'XACC' }, { id: 'difficulty', label: '难度' }, { id: 'impact', label: 'Impact' },
];

export function TufRecordsScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const playerId = useActiveTufPlayerId();
  const [sortBy, setSortBy] = useState<TufPassSort>('date');
  const [order, setOrder] = useState<TufSortOrder>('DESC');
  const [bestPerLevel, setBestPerLevel] = useState(false);
  const query = useTufPasses(playerId, { sortBy, order, bestPerLevel });
  const records = query.data?.pages.flatMap((page) => page.passes) ?? [];
  const controls = <View style={[styles.controls, { borderBottomColor: theme.border }]}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {SORTS.map((sort) => <Pressable key={sort.id} onPress={() => setSortBy(sort.id)}
        style={[styles.chip, { borderColor: theme.border }, sortBy === sort.id && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
        <Text style={[styles.chipText, { color: sortBy === sort.id ? '#FFF' : theme.text }]}>{sort.label}</Text>
      </Pressable>)}
    </ScrollView>
    <View style={styles.controlRow}>
      <Pressable accessibilityRole="button" onPress={() => setOrder((value) => value === 'DESC' ? 'ASC' : 'DESC')}>
        <Text style={[styles.order, { color: theme.accent }]}>{order === 'DESC' ? '降序 ↓' : '升序 ↑'}</Text>
      </Pressable>
      <View style={styles.switchRow}><Text style={[styles.switchLabel, { color: theme.text }]}>每关最佳</Text>
        <Switch value={bestPerLevel} onValueChange={setBestPerLevel} /></View>
    </View>
  </View>;
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
  const debounced = useDebouncedValue(keyword, 350);
  const query = useTufLevelSearch(debounced);
  const levels = query.data?.pages.flatMap((page) => page.results) ?? [];
  const search = <View style={styles.searchWrap}><TextInput accessibilityLabel="搜索 TUF 关卡"
    placeholder="搜索关卡、歌曲或作者" placeholderTextColor={theme.textMuted} value={keyword} onChangeText={setKeyword}
    style={[styles.searchInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]} /></View>;
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

export function TufOverviewScreen() {
  const theme = useAppTheme();
  const query = useGameData();
  const queryPayload = query.data?.payload;
  const payload = queryPayload?.kind === 'adofai' ? queryPayload : null;

  if (!payload) {
    return <QueryStateView isLoading={query.isLoading} isError={query.isError} isEmpty
      error={query.error} onRetry={() => void query.refetch()} emptyText="请在游戏管理中绑定 TUF 玩家"
      data={undefined} renderData={() => <></>} />;
  }

  const player = payload.player;
  const metrics = [
    ['世界排名', player.globalRank ?? player.rank ? `#${player.globalRank ?? player.rank}` : '—'],
    ['General Score', player.generalScore.toFixed(2)], ['PP Score', player.ppScore.toFixed(2)],
    ['平均 XACC', player.averageXacc == null ? '—' : formatTufAccuracy(player.averageXacc)],
    ['过关数', String(player.totalPasses)], ['Universal Pass', String(player.universalPassCount)],
    ['最高难度', player.topDiff == null ? '—' : typeof player.topDiff === 'object' ? player.topDiff.name : String(player.topDiff)],
    ['世界首杀', String(player.worldFirstCount)],
  ];
  return <ScrollView contentInsetAdjustmentBehavior="automatic"
    style={[styles.page, { backgroundColor: theme.background }]} contentContainerStyle={styles.overview}>
    <View style={styles.signature}><View style={styles.iceRail} /><View style={styles.fireRail} /></View>
    <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.heroLabel, { color: theme.textMuted }]}>TUF · RANKED SCORE</Text>
      <Text style={[styles.heroScore, { color: theme.text }]}>{payload.playerScore.display}</Text>
      <Text style={[styles.heroName, { color: theme.text }]}>{player.name}</Text>
      <Text style={[styles.heroMeta, { color: theme.textMuted }]}>PID {player.id} · 公开社区资料</Text>
    </View>
    <View style={styles.metricGrid}>{metrics.map(([label, value]) => <View key={label}
      style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
    </View>)}</View>
  </ScrollView>;
}

function safeHttps(url: string | null | undefined): string | null {
  if (!url) return null;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' ? parsed.toString() : null; } catch { return null; }
}

export function TufLevelDetailScreen({ levelId }: { levelId: string }) {
  const theme = useAppTheme();
  const numericId = /^\d+$/.test(levelId) ? Number(levelId) : null;
  const query = useTufLevel(numericId);
  const level = query.data?.level;
  const chart = level ? presentTufChart(level) : null;
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
  return <QueryStateView isLoading={query.isLoading} isError={query.isError} isEmpty={!level}
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
      {level!.description ? <Text style={[styles.description, { color: theme.textMuted }]}>{level!.description}</Text> : null}
    </ScrollView>} />;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, list: { flex: 1 }, listContent: { padding: 16, gap: 10 }, footer: { marginVertical: 18 },
  sectionHeader: { marginTop: 8, marginBottom: 3, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: 18, fontWeight: '900' }, sectionCount: { fontSize: 11 }, notice: { padding: 12, fontSize: 12 },
  controls: { paddingTop: 10, paddingHorizontal: 14, paddingBottom: 10, gap: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  chips: { gap: 7 }, chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }, chipText: { fontSize: 12, fontWeight: '700' },
  controlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, order: { fontWeight: '700' }, switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, switchLabel: { fontSize: 13 },
  searchWrap: { padding: 14 }, searchInput: { height: 46, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  overview: { padding: 16, gap: 14 }, signature: { height: 4, borderRadius: 2, overflow: 'hidden', flexDirection: 'row' }, iceRail: { flex: 1, backgroundColor: '#44C7F4' }, fireRail: { flex: 1, backgroundColor: '#F15B55' },
  hero: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 22, alignItems: 'center' }, heroLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heroScore: { fontSize: 42, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 5 }, heroName: { fontSize: 20, fontWeight: '800', marginTop: 9 }, heroMeta: { fontSize: 12, marginTop: 3 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, metricCard: { width: '48%', flexGrow: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 5 },
  metricLabel: { fontSize: 11 }, metricValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  detail: { padding: 16, gap: 12, paddingBottom: 40 }, detailTitle: { fontSize: 25, fontWeight: '900' }, detailArtist: { fontSize: 14 },
  metadata: { borderRadius: 15, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }, metadataCell: { minWidth: '48%', padding: 13 },
  metadataLabel: { fontSize: 10 }, metadataValue: { fontSize: 13, fontWeight: '700' }, metadataBlock: {}, metadataMeasure: { position: 'absolute', opacity: 0 },
  chartCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 15, gap: 9 }, chartDifficulty: { fontSize: 17, fontWeight: '900' }, chartCharter: { fontSize: 12 },
  noteTable: { flexDirection: 'row', gap: 8 }, noteItem: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8, minWidth: 72 }, noteLabel: { fontSize: 9 }, noteValue: { fontSize: 15, fontWeight: '800' },
  links: { gap: 8 }, link: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 13 }, linkText: { fontWeight: '800' }, description: { lineHeight: 20 },
});
