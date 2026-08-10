import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { SongMetadataTable, type SongMetadataItem } from '@/components/game-content/SongMetadataTable';
import { QueryStateView } from '@/components/QueryStateView';
import { useSongDetailBackNavigation } from '@/components/game-content/SongDetailNavigation';
import { MuseDashScoreCard } from '@/components/musedash/MuseDashScoreCard';
import { MuseDashSongRow } from '@/components/musedash/MuseDashSongRow';
import {
  MuseDashCatalogFilterBar, MuseDashRecordsFilterBar,
  type MuseDashDifficultySlot, type MuseDashPlatform, type MuseDashRecordSort,
} from '@/components/musedash/MuseDashFilterBar';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { museDashUserIdFromAccountId } from '@/domain/bound-account';
import {
  museDashCharacterName,
  museDashDiffdiffMap,
  museDashElfinName,
  museDashSongAuthor,
  museDashSongsByUid,
  museDashSongsFromAlbums,
  museDashSongTitle,
  type MuseDashAlbumsResponse,
  type MuseDashCeResponse,
  type MuseDashPlayer,
  type MuseDashRawScore,
} from '@/domain/muse-dash';
import { presentMuseDashChart } from '@/features/game-content/adapters';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import {
  useMuseDashAlbums,
  useMuseDashCe,
  useMuseDashDiffdiff,
  useMuseDashPlayer,
} from '@/hooks/use-muse-dash';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

function useActiveMuseDashUserId() {
  const accountId = useSession((state) => state.activeAccountId);
  return museDashUserIdFromAccountId(accountId);
}

function buildRawScores(
  player: MuseDashPlayer,
  albums: MuseDashAlbumsResponse | undefined,
  ce: MuseDashCeResponse | undefined,
): MuseDashRawScore[] {
  const songsByUid = albums ? museDashSongsByUid(albums) : new Map();
  return player.plays.map((play) => {
    const joined = songsByUid.get(play.uid);
    return {
      play,
      song: joined?.song ?? null,
      albumTitle: joined?.albumTitle ?? '未知专辑',
      characterName: ce ? museDashCharacterName(ce, play.character_uid) : null,
      elfinName: ce ? museDashElfinName(ce, play.elfin_uid) : null,
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
  const rawScores = useMemo(
    () => player.data ? buildRawScores(player.data, albums.data, ce.data) : [],
    [player.data, albums.data, ce.data],
  );
  const ordered = useMemo(() => [...rawScores]
    .sort((left, right) => {
      const leftValue = left.play.sum ?? left.play.score;
      const rightValue = right.play.sum ?? right.play.score;
      return rightValue - leftValue;
    })
    .slice(0, 30), [rawScores]);
  const sections: MuseDashBestSection[] = [{ id: 'best30', title: 'Best 30', data: ordered }];
  const loading = player.isLoading || albums.isLoading || ce.isLoading;
  const error = player.error ?? albums.error ?? ce.error;
  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <BestListPage<MuseDashRawScore, MuseDashBestSection>
      isLoading={loading} isError={!!error} isEmpty={!loading && ordered.length === 0}
      error={error} onRetry={() => { void player.refetch(); void albums.refetch(); void ce.refetch(); }}
      emptyText={userId === null ? '请先在游戏管理中绑定喵斯快跑玩家' : '当前公开资料没有成绩'}
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

function sortRawScores(scores: MuseDashRawScore[], sortBy: MuseDashRecordSort): MuseDashRawScore[] {
  const sorted = [...scores];
  sorted.sort((left, right) => {
    if (sortBy === 'acc') return right.play.acc - left.play.acc;
    if (sortBy === 'score') return right.play.score - left.play.score;
    return (right.play.sum ?? right.play.score) - (left.play.sum ?? left.play.score);
  });
  return sorted;
}

export function MuseDashRecordsScreen() {
  const theme = useAppTheme();
  const inset = useNativeTabBottomInset();
  const userId = useActiveMuseDashUserId();
  const player = useMuseDashPlayer(userId);
  const albums = useMuseDashAlbums();
  const ce = useMuseDashCe();
  const [sortBy, setSortBy] = useState<MuseDashRecordSort>('rating');
  const [platform, setPlatform] = useState<MuseDashPlatform>('all');
  const [keyword, setKeyword] = useState('');
  const [filterExpanded, setFilterExpanded] = useState(true);
  const rawScores = useMemo(
    () => player.data ? buildRawScores(player.data, albums.data, ce.data) : [],
    [player.data, albums.data, ce.data],
  );
  const records = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    const filtered = rawScores.filter((item) => {
      if (platform !== 'all' && (item.play.platform ?? 'mobile') !== platform) return false;
      if (!normalized) return true;
      const title = item.song ? museDashSongTitle(item.song) : item.play.uid;
      return title.toLowerCase().includes(normalized)
        || (item.song ? museDashSongAuthor(item.song).toLowerCase().includes(normalized) : false)
        || item.play.uid.includes(normalized);
    });
    return sortRawScores(filtered, sortBy);
  }, [rawScores, platform, keyword, sortBy]);
  const loading = player.isLoading || albums.isLoading || ce.isLoading;
  const error = player.error ?? albums.error ?? ce.error;
  const controls = <>
    <SearchHeader accessibilityLabel="筛选喵斯快跑成绩" placeholder="搜索歌曲、作者或 uid" value={keyword}
      onChangeText={setKeyword} loaded={records.length} />
    <MuseDashRecordsFilterBar expanded={filterExpanded} sortBy={sortBy} platform={platform}
      onExpandedChange={setFilterExpanded} onSortByChange={setSortBy} onPlatformChange={setPlatform}
      onReset={() => { setSortBy('rating'); setPlatform('all'); }} />
  </>;
  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <RecordsListPage beforeList={controls} isLoading={loading} isError={!!error}
      isEmpty={!loading && records.length === 0} error={error} onRetry={() => { void player.refetch(); void albums.refetch(); void ce.refetch(); }}
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
  const constants = useMemo(() => diffdiff.data ? museDashDiffdiffMap(diffdiff.data) : null, [diffdiff.data]);
  const songs = useMemo(() => {
    const all = albums.data ? museDashSongsFromAlbums(albums.data) : [];
    const normalized = keyword.trim().toLowerCase();
    return all.filter(({ song }) => {
      if (difficultySlot !== 'all' && song.difficulty[difficultySlot] === '0') return false;
      if (!normalized) return true;
      return museDashSongTitle(song).toLowerCase().includes(normalized)
        || museDashSongAuthor(song).toLowerCase().includes(normalized);
    });
  }, [albums.data, keyword, difficultySlot]);
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
    <MuseDashCatalogFilterBar expanded={filterExpanded} difficultySlot={difficultySlot}
      onExpandedChange={setFilterExpanded} onDifficultySlotChange={setDifficultySlot}
      onReset={() => { setDifficultySlot('all'); }} />
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

export function MuseDashSongDetailScreen({ songId }: { songId: string }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigateBack = useSongDetailBackNavigation();
  const albums = useMuseDashAlbums();
  const diffdiff = useMuseDashDiffdiff();
  const ce = useMuseDashCe();
  const userId = useActiveMuseDashUserId();
  const player = useMuseDashPlayer(userId);
  const joined = useMemo(() => {
    if (!albums.data) return null;
    return museDashSongsByUid(albums.data).get(songId) ?? null;
  }, [albums.data, songId]);
  const constants = useMemo(() => diffdiff.data ? museDashDiffdiffMap(diffdiff.data) : null, [diffdiff.data]);
  const scoreByDifficulty = useMemo(() => {
    if (!player.data) return new Map<number, MuseDashRawScore>();
    const map = new Map<number, MuseDashRawScore>();
    for (const raw of buildRawScores(player.data, albums.data, ce.data)) {
      if (raw.play.uid !== songId) continue;
      const previous = map.get(raw.play.difficulty);
      if (!previous || raw.play.sum! > (previous.play.sum ?? 0)) map.set(raw.play.difficulty, raw);
    }
    return map;
  }, [player.data, albums.data, ce.data, songId]);
  const chartSlots = joined
    ? joined.song.difficulty.flatMap((level, difficultyIndex) =>
      level === '0' ? [] : [{ difficultyIndex, level }])
    : [];
  const metadata: SongMetadataItem[] = joined ? [
    { key: 'artist', label: '艺术家', value: museDashSongAuthor(joined.song), flex: 1 },
    { key: 'album', label: '专辑', value: joined.albumTitle, flex: 1 },
    { key: 'bpm', label: 'BPM', value: joined.song.bpm || '—', flex: 1 },
    { key: 'charter', label: '谱师', value: joined.song.levelDesigner.filter((name): name is string => !!name).join('、') || '—', flex: 2 },
    { key: 'cover', label: '封面标识', value: joined.song.cover || '—', flex: 1 },
  ] : [];
  const loading = albums.isLoading || player.isLoading;
  const error = albums.error ?? player.error;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="返回" hitSlop={12}
      onPress={navigateBack}
      style={({ pressed }) => [
        styles.headerButton, styles.headerFloatingButton, { top: insets.top + 8, left: 8 },
        Platform.OS !== 'ios' && styles.headerButtonBg, pressed && { opacity: 0.7 },
      ]}>
      <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} color="#FFFFFF" size={28} />
    </Pressable>
    <QueryStateView isLoading={loading} isError={!!error} isEmpty={!joined}
    error={error} onRetry={() => { void albums.refetch(); void player.refetch(); }}
    emptyText="未找到该喵斯快跑歌曲" data={joined}
    renderData={() => <ScrollView contentInsetAdjustmentBehavior="automatic" style={[styles.page, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.detail}>
      <Text style={[styles.detailTitle, { color: theme.text }]}>{museDashSongTitle(joined!.song)}</Text>
      <Text style={[styles.detailArtist, { color: theme.textMuted }]}>{museDashSongAuthor(joined!.song)} · {joined!.albumTitle}</Text>
      <SongMetadataTable accessibilityLabel="喵斯快跑歌曲信息" items={metadata} testIDPrefix="musedash-song-metadata"
        style={styles.metadata} cellStyle={styles.metadataCell} labelStyle={styles.metadataLabel}
        valueStyle={styles.metadataValue} valueBlockStyle={styles.metadataBlock} measureStyle={styles.metadataMeasure} />
      {chartSlots.map(({ difficultyIndex, level }) => {
        const entry = constants?.get(`${songId}:${difficultyIndex}`);
        const chart = presentMuseDashChart({
          song: joined!.song, albumTitle: joined!.albumTitle, difficultyIndex, constant: entry?.[4],
        }, scoreByDifficulty.get(difficultyIndex));
        return <GameChartResultCard key={difficultyIndex}
          style={[styles.chartCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
          testID={`musedash-chart-${difficultyIndex}`} accessibilityLabel={`难度 ${chart.difficulty.label} ${level}`}>
          <View style={styles.chartHeader}>
            <Text style={[styles.chartDifficulty, { color: theme.accent }]}>{chart.difficulty.label}</Text>
            <Text style={[styles.chartLevel, { color: theme.text }]}>Lv.{level}</Text>
          </View>
          <Text style={[styles.chartCharter, { color: theme.textMuted }]}>谱师：{chart.charter}</Text>
          <View style={styles.chartScore}>
            <Text style={[styles.chartScoreLabel, { color: theme.textMuted }]}>{chart.primaryMetric.label ?? 'Score'}</Text>
            <Text style={[styles.chartScoreValue, { color: theme.text }]}>{chart.primaryMetric.text}</Text>
          </View>
          {chart.secondaryMetrics.length > 0 ? <Text style={[styles.chartSecondary, { color: theme.textMuted }]}>
            {chart.secondaryMetrics.map((metric) => `${metric.label ?? ''} ${metric.text}`).join(' · ')}
          </Text> : null}
          {chart.achievementRows.length > 0 ? <View style={styles.chartBadges}>
            {chart.achievementRows.flat().map((badge) => <View key={badge.key} style={[styles.chartBadge, { borderColor: theme.border }]}>
              <Text style={[styles.chartBadgeText, { color: theme.textMuted }]}>{badge.label}</Text>
            </View>)}
          </View> : null}
          {chart.notes.map((group) => <GameNoteTable key={group.key} mode="cells" group={group}
            containerStyle={styles.noteTable} itemStyle={[styles.noteItem, { borderColor: theme.border }]}
            labelStyle={[styles.noteLabel, { color: theme.textMuted }]} valueStyle={[styles.noteValue, { color: theme.text }]} />)}
        </GameChartResultCard>;
      })}
      {scoreByDifficulty.size === 0 && player.data ? (
        <Text style={[styles.notice, { color: theme.textMuted }]}>当前绑定玩家尚未游玩此曲。</Text>
      ) : null}
    </ScrollView>} />
  </>;
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
  detail: { padding: 16, gap: 12, paddingBottom: 40 }, detailTitle: { fontSize: 25, fontWeight: '900' }, detailArtist: { fontSize: 14 },
  metadata: { borderRadius: 15, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }, metadataCell: { minWidth: '48%', padding: 13 },
  metadataLabel: { fontSize: 10 }, metadataValue: { fontSize: 13, fontWeight: '700' }, metadataBlock: {}, metadataMeasure: { position: 'absolute', opacity: 0 },
  chartCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, padding: 15, gap: 9 },
  chartHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  chartDifficulty: { fontSize: 17, fontWeight: '900' }, chartLevel: { fontSize: 14, fontWeight: '800' },
  chartCharter: { fontSize: 12 }, chartScore: { gap: 1 }, chartScoreLabel: { fontSize: 10 },
  chartScoreValue: { fontSize: 19, fontWeight: '900', fontVariant: ['tabular-nums'] },
  chartSecondary: { fontSize: 12 }, chartBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chartBadge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  chartBadgeText: { fontSize: 9, fontWeight: '700' },
  noteTable: { flexDirection: 'row', gap: 8 }, noteItem: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 8, minWidth: 72 }, noteLabel: { fontSize: 9 }, noteValue: { fontSize: 15, fontWeight: '800' },
  notice: { fontSize: 12, paddingVertical: 6 },
});
