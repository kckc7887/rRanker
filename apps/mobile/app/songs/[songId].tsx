import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, Platform } from 'react-native';
import {
  GestureHandlerRootView,
  Pressable as GesturePressable,
  ScrollView as GestureScrollView,
} from 'react-native-gesture-handler';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { AchievementValue, DIFFICULTY_VISUAL, DifficultyBadge, ScoreStatusBadges } from '@/components/ScoreVisuals';
import { SongCover } from '@/components/SongCover';
import { SourceStatus } from '@/components/SourceStatus';
import { TagEditor } from '@/components/TagEditor';
import { normalizeSongId } from '@/domain/catalog';
import type { Chart, ChartNotes, ChartType, Difficulty, ScoreRecord, Song } from '@/domain/models';
import { chartLibraryKey, songLibraryKey } from '@/domain/user-library';
import { localizedVersionName, type VersionNameLocale } from '@/domain/version-names';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useUserLibrary } from '@/hooks/use-user-library';

const CARD_GAP = 12;
const DIFFICULTY_ORDER: Record<Difficulty, number> = {
  remaster: 0, master: 1, expert: 2, advanced: 3, basic: 4, unknown: 5,
};

type LibraryHook = ReturnType<typeof useUserLibrary>;

export default function SongDetailScreen() {
  const { songId, chartType, levelIndex } = useLocalSearchParams<{
    songId: string; chartType?: string; levelIndex?: string;
  }>();
  const catalog = useDetailedCatalog();
  const scores = useScoreSnapshot();
  const library = useUserLibrary();
  const song = useMemo(() => {
    const songs = catalog.data?.songs;
    return songs?.find((item) => item.id === songId) ??
      songs?.find((item) => item.id === normalizeSongId(songId));
  }, [catalog.data?.songs, songId]);
  const initialChartType = chartType === 'SD' || chartType === 'DX' ? chartType : undefined;
  const parsedLevelIndex = levelIndex === undefined ? undefined : Number(levelIndex);
  const initialLevelIndex = Number.isInteger(parsedLevelIndex) && parsedLevelIndex! >= 0 ? parsedLevelIndex : undefined;
  const songItem = song ? library.data?.find((item) => item.key === songLibraryKey(song.id)) : undefined;
  const favorite = songItem?.kind === 'song' && songItem.favorite;
  return <>
    <Stack.Screen options={{
      title: '', headerTransparent: true, headerShadowVisible: false, headerTintColor: '#FFFFFF',
      headerBackButtonDisplayMode: 'minimal', headerBackButtonMenuEnabled: false,
      headerRight: song ? () => <Pressable accessibilityRole="button"
        accessibilityLabel={favorite ? `取消收藏 ${song.title}` : `收藏 ${song.title}`}
        disabled={library.isLoading || library.isUpdating} hitSlop={12}
        android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
        onPress={() => void library.setSongFavorite(song.id, !favorite)}
        style={({ pressed }) => [
          styles.headerFavorite, favorite && styles.headerFavoriteActive,
          Platform.OS !== 'ios' && styles.headerFavoriteBg,
          Platform.OS !== 'ios' && favorite && styles.headerFavoriteActiveBg,
          pressed && { opacity: 0.7 },
        ]}>
        <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={favorite ? '#A78BFA' : '#FFFFFF'} size={22} />
      </Pressable> : undefined,
    }} />
    <StatusBar style="light" />
    <View style={styles.page}>
      <QueryStateView<Song> isLoading={catalog.isLoading} isError={catalog.isError} isEmpty={!!catalog.data && !song}
        error={catalog.error} onRetry={() => void catalog.refetch()}
        emptyText="找不到这首歌曲" data={song} renderData={(item) => <Detail song={item} records={scores.data?.records ?? []}
          catalogSource={catalog.data!.source} scoreSource={scores.data?.source} library={library}
          initialChartType={initialChartType} initialLevelIndex={initialLevelIndex} />} />
    </View>
  </>;
}

function Detail({ song, records, catalogSource, scoreSource, library, initialChartType, initialLevelIndex }: {
  song: Song;
  records: ScoreRecord[];
  catalogSource: import('@/domain/models').DataSource;
  scoreSource?: import('@/domain/models').DataSource;
  library: LibraryHook;
  initialChartType?: ChartType;
  initialLevelIndex?: number;
}) {
  const { width } = useWindowDimensions();
  const [versionLocale, setVersionLocale] = useState<VersionNameLocale>('china');
  const songItem = library.data?.find((item) => item.key === songLibraryKey(song.id));
  const versionName = localizedVersionName(song.versionId, song.version, versionLocale);
  const availableChartTypes = useMemo(() => new Set(song.charts.map((chart) => chart.type)), [song.charts]);
  const defaultChartType: ChartType = initialChartType && availableChartTypes.has(initialChartType)
    ? initialChartType : availableChartTypes.has('DX') ? 'DX' : 'SD';
  const [selectedChartType, setSelectedChartType] = useState<ChartType>(defaultChartType);
  useEffect(() => setSelectedChartType(defaultChartType), [defaultChartType, song.id]);
  const sortedCharts = useMemo(() => song.charts.filter((chart) => chart.type === selectedChartType)
    .sort((left, right) => DIFFICULTY_ORDER[left.difficulty] - DIFFICULTY_ORDER[right.difficulty]),
  [selectedChartType, song.charts]);
  const canSwitchChartType = availableChartTypes.has('SD') && availableChartTypes.has('DX');
  const cardWidth = Math.max(280, width - 40);
  const masterIndex = Math.max(0, sortedCharts.findIndex((chart) => chart.difficulty === 'master'));
  const requestedIndex = selectedChartType === initialChartType && initialLevelIndex !== undefined
    ? sortedCharts.findIndex((chart) => chart.levelIndex === initialLevelIndex) : -1;
  const initialIndex = requestedIndex >= 0 ? requestedIndex : masterIndex;

  return <ScrollView testID="song-detail-scroll" contentContainerStyle={styles.content}
    keyboardShouldPersistTaps="handled" canCancelContentTouches={false}>
    <View style={[styles.hero, { width, height: width }]}>
      <SongCover songId={song.id} size={width} borderRadius={0} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.40)']}
        locations={[0, 1]} style={styles.heroShade} />
      <View style={styles.heroCopy}>
        <HorizontalText text={`#${song.id}`} textStyle={styles.songId} />
        <HorizontalText text={song.title} textStyle={styles.title} />
        <HorizontalText text={song.artist ?? '曲师未知'} textStyle={styles.artist} />
      </View>
    </View>

    <View style={styles.metadataTable} accessibilityLabel="歌曲详情数据">
      <MetadataCell label="分类" value={song.genre ?? '未知'} flex={1} />
      <MetadataCell label="BPM" value={song.bpm?.toString() ?? '未知'} flex={0.65} />
      <VersionMetadataCell value={versionName}
        onToggle={() => setVersionLocale((value) => value === 'china' ? 'japan' : 'china')} />
      {song.region ? <MetadataCell label="区域" value={song.region} flex={1} /> : null}
    </View>

    <ChartCarousel key={`${song.id}:${selectedChartType}:${initialIndex}`} charts={sortedCharts} records={records} song={song}
      library={library} cardWidth={cardWidth} initialIndex={initialIndex} canSwitchChartType={canSwitchChartType}
      onToggleChartType={() => setSelectedChartType((type) => type === 'DX' ? 'SD' : 'DX')} />

    <View style={styles.details}>
      <SourceStatus items={[
        { key: 'catalog', label: catalogSource.label, updatedAt: catalogSource.updatedAt, state: catalogSource.isStale ? 'cache' : 'live' },
        { key: 'scores', label: scoreSource?.label ?? '成绩未加载', updatedAt: scoreSource?.updatedAt, state: !scoreSource ? 'unavailable' : scoreSource.isStale ? 'cache' : 'live' },
      ]} />
      <Card><Text style={styles.section}>歌曲信息</Text><AliasLine aliases={song.aliases} />
        <Text style={styles.body}>版权：{song.rights || '未提供'}</Text><Text style={styles.body}>状态：{song.disabled ? '禁用' : song.locked ? '锁定' : '可用'}</Text></Card>
      <Card><TagEditor tags={songItem?.tags ?? []} disabled={library.isUpdating}
        onChange={(tags) => library.setTags({ kind: 'song', songId: song.id }, tags)} /></Card>
    </View>
  </ScrollView>;
}

function AliasLine({ aliases }: { aliases?: string[] }) {
  const text = `别名：${aliases?.join('、') || '无'}`;
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => { setExpanded(false); setOverflow(false); }, [text]);
  return <View style={styles.aliasBlock}>
    <Text accessible={false} testID="alias-overflow-measure" style={[styles.body, styles.aliasMeasure]}
      onTextLayout={(event) => setOverflow(event.nativeEvent.lines.length > 1)}>{text}</Text>
    <Text testID="song-alias-text" numberOfLines={expanded ? undefined : 1} style={styles.body}>{text}</Text>
    {overflow ? <Pressable accessibilityRole="button" accessibilityLabel={expanded ? '收起别名' : '展开别名'}
      onPress={() => setExpanded((value) => !value)} hitSlop={6} style={styles.aliasAction}>
      <Text style={styles.aliasActionText}>{expanded ? '收起' : '展开'}</Text>
    </Pressable> : null}
  </View>;
}


function AutoScrollText({ text, textStyle, style, contentContainerStyle }: {
  text: string; textStyle: object; style?: object; contentContainerStyle?: object;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(0);
  const directionRef = useRef(1);

  const shouldAutoScroll = contentWidth > containerWidth + 4;

  useEffect(() => {
    if (!shouldAutoScroll || dragging) return;
    const interval = setInterval(() => {
      const next = offsetRef.current + directionRef.current * 0.5;
      if (next >= contentWidth - containerWidth) { directionRef.current = -1; }
      else if (next <= 0) { directionRef.current = 1; }
      offsetRef.current = Math.max(0, Math.min(next, contentWidth - containerWidth));
      scrollRef.current?.scrollTo({ x: offsetRef.current, animated: false });
    }, 16);
    return () => clearInterval(interval);
  }, [shouldAutoScroll, dragging, contentWidth, containerWidth]);

  return <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
    style={style}
    contentContainerStyle={contentContainerStyle}
    onContentSizeChange={(w) => setContentWidth(w)}
    onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    onScrollBeginDrag={() => setDragging(true)}
    onScrollEndDrag={() => { setDragging(false); directionRef.current = 1; }}
    onScroll={(e) => { offsetRef.current = e.nativeEvent.contentOffset.x; }}
    scrollEventThrottle={16}>
    <Text numberOfLines={1} style={textStyle}>{text}</Text>
  </ScrollView>;
}

function HorizontalText({ text, textStyle }: { text: string; textStyle: object }) {
  return <AutoScrollText text={text} textStyle={textStyle} style={styles.singleLine}
    contentContainerStyle={styles.singleLineContent} />;
}

function MetadataCell({ label, value, flex }: { label: string; value: string; flex: number }) {
  return <View style={[styles.metadataCell, { flex }]}><Text numberOfLines={1} style={styles.metadataLabel}>{label}</Text>
    <AutoScrollText text={value} textStyle={styles.metadataValue} />
  </View>;
}

function VersionMetadataCell({ value, onToggle }: {
  value: string; onToggle: () => void;
}) {
  return <GestureHandlerRootView style={styles.versionCellRoot}>
    <GesturePressable accessibilityRole="button" accessibilityLabel="切换版本名称" onPress={onToggle}
      hitSlop={4} style={({ pressed }) => [styles.metadataCell, styles.versionCell, pressed && styles.switchPressed]}>
      <Text numberOfLines={1} style={styles.metadataLabel}>版本</Text>
      <View style={styles.versionValueRow}>
        <Text style={[styles.metadataValue, styles.versionName]}>{value}</Text>
        <View pointerEvents="none" style={styles.versionToggle}>
          <Ionicons name="swap-horizontal" color="#5967C9" size={14} />
        </View>
      </View>
    </GesturePressable>
  </GestureHandlerRootView>;
}

function ChartCarousel({ charts, records, song, library, cardWidth, initialIndex, canSwitchChartType, onToggleChartType }: {
  charts: Chart[];
  records: ScoreRecord[];
  song: Song;
  library: LibraryHook;
  cardWidth: number;
  initialIndex: number;
  canSwitchChartType: boolean;
  onToggleChartType: () => void;
}) {
  const interval = cardWidth + CARD_GAP;
  const scrollRef = useRef<ComponentRef<typeof GestureScrollView>>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * interval, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [initialIndex, interval]);
  if (charts.length === 0) return <View style={styles.noCharts}><Text style={styles.meta}>暂无可用难度</Text></View>;
  return <GestureHandlerRootView style={styles.carouselRoot}>
    <GestureScrollView ref={scrollRef} horizontal decelerationRate="fast" snapToInterval={interval}
      snapToAlignment="start" disableIntervalMomentum showsHorizontalScrollIndicator={false}
      directionalLockEnabled nestedScrollEnabled removeClippedSubviews={false} style={styles.carouselScroll}
      contentOffset={{ x: initialIndex * interval, y: 0 }}
      contentContainerStyle={styles.carousel} accessibilityLabel="难度卡片">
      {charts.map((chart) => {
        const best = records.filter((record) =>
          (String(record.songId) === song.id || normalizeSongId(record.songId) === song.id) &&
          record.type === chart.type && record.levelIndex === chart.levelIndex)
          .sort((left, right) => right.achievements - left.achievements)[0];
        return <ChartCard key={`${chart.type}:${chart.levelIndex}`} chart={chart} best={best} song={song}
          library={library} width={cardWidth} canSwitchChartType={canSwitchChartType}
          onToggleChartType={onToggleChartType} />;
      })}
    </GestureScrollView>
  </GestureHandlerRootView>;
}

function ChartCard({ chart, best, song, library, width, canSwitchChartType, onToggleChartType }: {
  chart: Chart;
  best?: ScoreRecord;
  song: Song;
  library: LibraryHook;
  width: number;
  canSwitchChartType: boolean;
  onToggleChartType: () => void;
}) {
  const visual = DIFFICULTY_VISUAL[chart.difficulty];
  const chartItem = library.data?.find((item) => item.key === chartLibraryKey(song.id, chart.type, chart.levelIndex));
  const practice = chartItem?.kind === 'chart' && chartItem.practice;
  return <View style={[styles.chartCard, { width, backgroundColor: visual.tint, borderColor: visual.color }]}>
    <View style={styles.chartHeader}>
      <View style={styles.chartIdentity}>
        <DifficultyBadge difficulty={chart.difficulty} />
        <ChartTypeSwitch type={chart.type} canSwitch={canSwitchChartType} onToggle={onToggleChartType} />
      </View>
      <View style={styles.levelBlock}><Text style={styles.level}>{chart.level}</Text><Text style={styles.constant}>{chart.difficultyConstant.toFixed(1)}</Text></View>
    </View>
    <View style={styles.resultRow}>
      <View style={styles.resultMain}>
        <Text style={styles.achievementLabel}>达成率</Text>
        <AchievementValue value={best?.achievements} />
        <View style={styles.statusRow}>
          <ScoreStatusBadges rate={best?.rate} achievements={best?.achievements} fc={best?.fc} fs={best?.fs} />
        </View>
        <Text style={styles.rating}>Rating <Text style={styles.ratingValue}>{best?.rating ?? '—'}</Text></Text>
      </View>
    </View>
    <View style={styles.chartDivider} />
    <Text style={styles.chartMeta}>谱师：{chart.charter || '未提供'}</Text>
    <NotesTable notes={chart.notes} />
    <Pressable accessibilityRole="button" disabled={library.isUpdating}
      onPress={() => void library.setChartPractice(song.id, chart.type, chart.levelIndex, !practice)}
      style={[styles.action, practice && { backgroundColor: visual.color, borderColor: visual.color }]}>
      <Text style={[styles.actionText, { color: practice ? '#FFFFFF' : visual.color }]}>{practice ? '已加入练习清单' : '加入练习清单'}</Text>
    </Pressable>
    <TagEditor tags={chartItem?.tags ?? []} disabled={library.isUpdating}
      onChange={(tags) => library.setTags({ kind: 'chart', songId: song.id, type: chart.type, levelIndex: chart.levelIndex }, tags)} />
  </View>;
}

function ChartTypeSwitch({ type, canSwitch, onToggle }: {
  type: ChartType; canSwitch: boolean; onToggle: () => void;
}) {
  return <GesturePressable accessibilityRole="button"
    accessibilityLabel={canSwitch ? `切换为${type === 'DX' ? 'SD' : 'DX'}谱面` : `${type}谱面`}
    accessibilityState={{ disabled: !canSwitch }} disabled={!canSwitch} onPress={onToggle}
    style={({ pressed }) => [styles.chartTypeRow, pressed && styles.switchPressed]}>
    <View pointerEvents="none"
      style={[styles.chartTypeBadge, type === 'SD' ? styles.sdTypeBadge : styles.dxTypeBadge]}>
      {type === 'SD' ? <Text style={styles.sdTypeText}>SD</Text> :
        <MaskedView style={styles.dxTypeTextMask}
          maskElement={<Text style={[styles.chartTypeText, styles.dxTypeMaskText]}>DX</Text>}>
          <LinearGradient colors={['#FF8A00', '#FFD84A']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={styles.gradientFill} />
        </MaskedView>}
    </View>
    {canSwitch ? <Text pointerEvents="none" style={styles.chartTypeHint}>·点击切换·</Text> : null}
  </GesturePressable>;
}

const NOTE_COLUMNS: readonly { label: string; key: keyof ChartNotes }[] = [
  { label: 'TAP', key: 'tap' }, { label: 'HOLD', key: 'hold' }, { label: 'SLIDE', key: 'slide' },
  { label: 'TOUCH', key: 'touch' }, { label: 'BREAK', key: 'break' }, { label: '总计', key: 'total' },
];

function NotesTable({ notes }: { notes?: ChartNotes }) {
  if (!notes) return <Text style={styles.chartMeta}>物量未提供</Text>;
  return <View accessibilityLabel="谱面物量" style={styles.notesTable}>
    <View style={[styles.notesRow, styles.notesHeaderRow]}>
      {NOTE_COLUMNS.map((column) => <Text key={column.key} numberOfLines={1}
        style={[styles.notesCell, styles.notesHeader]}>{column.label}</Text>)}
    </View>
    <View style={styles.notesRow}>
      {NOTE_COLUMNS.map((column) => <Text key={column.key} numberOfLines={1}
        style={[styles.notesCell, styles.notesValue]}>{notes[column.key]}</Text>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { paddingBottom: 48 },
  hero: { position: 'relative', backgroundColor: '#D9DEE7', overflow: 'hidden' },
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%' },
  heroCopy: { position: 'absolute', left: 18, right: 18, bottom: 20, gap: 2 },
  singleLine: { flexGrow: 0 }, singleLineContent: { paddingRight: 18 },
  songId: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  title: { color: '#FFFFFF', fontSize: 30, lineHeight: 37, fontWeight: '900', letterSpacing: -0.6, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8 },
  artist: { color: 'rgba(255,255,255,0.9)', fontSize: 16, lineHeight: 23, fontWeight: '600' },
  headerFavorite: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerFavoriteBg: { backgroundColor: 'rgba(17,24,39,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  headerFavoriteActive: {},
  headerFavoriteActiveBg: { backgroundColor: 'rgba(141,91,214,0.88)' },
  metadataTable: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8DEE8', paddingHorizontal: 12, paddingVertical: 13, gap: 6 },
  metadataCell: { minWidth: 0, paddingHorizontal: 6, gap: 5 },
  versionCellRoot: { flex: 1.8, minWidth: 0 }, versionCell: { flex: 1 },
  metadataLabel: { color: '#8A93A3', fontSize: 11, fontWeight: '700', lineHeight: 14 },
  versionValueRow: { minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  versionName: { flex: 1, minWidth: 0 },
  versionToggle: { width: 16, height: 16, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  switchPressed: { opacity: 0.58 },
  metadataValue: { color: '#182130', fontSize: 13, lineHeight: 16, fontWeight: '700' },
  carouselRoot: { flexGrow: 0 },
  carouselScroll: { flexGrow: 0 },
  carousel: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12, gap: CARD_GAP },
  noCharts: { padding: 20 },
  chartCard: { borderRadius: 24, borderWidth: 1, padding: 18, shadowColor: '#1A2232', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4 },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  chartIdentity: { alignItems: 'flex-start', gap: 7 },
  chartTypeRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chartTypeBadge: { minWidth: 31, height: 18, borderRadius: 6, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  sdTypeBadge: { backgroundColor: '#3286E6' }, sdTypeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  dxTypeBadge: { backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#F2C36C' },
  dxTypeTextMask: { width: 19, height: 13 }, chartTypeText: { fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.5 }, dxTypeMaskText: { color: '#000000' },
  chartTypeHint: { color: '#8A93A3', fontSize: 9, fontWeight: '600' },
  levelBlock: { alignItems: 'flex-end' }, level: { color: '#172033', fontSize: 28, lineHeight: 31, fontWeight: '900' }, constant: { color: '#667085', fontSize: 11, fontWeight: '600' },
  resultRow: { flexDirection: 'row', marginTop: 22 }, resultMain: { flex: 1, alignItems: 'flex-start' },
  achievementLabel: { color: '#7D8797', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  gradientFill: { ...StyleSheet.absoluteFillObject },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, minHeight: 29, marginTop: 7 },
  rating: { color: '#667085', fontSize: 12, fontWeight: '700', marginTop: 10 }, ratingValue: { color: '#172033', fontSize: 17, fontWeight: '900' },
  chartDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(51,65,85,0.18)', marginVertical: 16 },
  chartMeta: { color: '#4C586A', fontSize: 12, lineHeight: 18 },
  notesTable: { marginTop: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(76,88,106,0.28)', borderRadius: 9, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.38)' },
  notesRow: { minHeight: 26, flexDirection: 'row', alignItems: 'center' }, notesHeaderRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(76,88,106,0.22)' },
  notesCell: { flex: 1, minWidth: 0, textAlign: 'center' }, notesHeader: { color: '#697386', fontSize: 8, fontWeight: '800' }, notesValue: { color: '#253047', fontSize: 10, fontWeight: '800' },
  section: { fontWeight: '700', color: '#111827', marginBottom: 7 }, body: { color: '#374151', lineHeight: 20 }, meta: { color: '#6B7280', fontSize: 12 },
  aliasBlock: { position: 'relative', alignItems: 'stretch' }, aliasMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 },
  aliasAction: { alignSelf: 'flex-end', paddingHorizontal: 2, paddingVertical: 3 }, aliasActionText: { color: '#5967C9', fontSize: 12, fontWeight: '700' },
  details: { paddingHorizontal: 16, gap: 12, marginTop: 4 },
  action: { marginTop: 13, marginBottom: 10, borderWidth: 1, borderColor: '#667085', borderRadius: 11, padding: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.52)' },
  actionText: { fontWeight: '700' },
});
