import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { QueryStateView } from '@/components/QueryStateView';
import { TagEditor } from '@/components/TagEditor';
import { GameAssetImage } from '@/components/game-model/GameAssetImage';
import { GameTag, formatGameTag } from '@/components/game-model/GameTag';
import {
  findTagGroup,
  findTagItem,
  type ChartDocument,
  type GameManifestV1,
  type ScoreCardDocument,
  type SongDocument,
  type TagGroupInstance,
  type TagValue,
} from '@/domain/game-model';
import { buildTagHistory } from '@/domain/user-library';
import { useGameModel } from '@/hooks/use-game-model';
import { useGameSongDocument } from '@/hooks/use-game-song-document';
import { useAppTheme } from '@/theme/app-theme';

type ChartEntry = {
  type?: SongDocument['chartGroups'][number]['type'];
  chart: ChartDocument;
};

async function openChartSearch(query: string): Promise<void> {
  const keyword = encodeURIComponent(query);
  const webUrl = `https://search.bilibili.com/all?keyword=${keyword}`;
  if (Platform.OS === 'web') {
    await Linking.openURL(webUrl);
    return;
  }
  try {
    await Linking.openURL(`bilibili://search?keyword=${keyword}`);
  } catch {
    await Linking.openURL(webUrl);
  }
}

function flattenCharts(song: SongDocument): ChartEntry[] {
  return song.chartGroups.flatMap((group) => group.charts.map((chart) => ({
    type: group.type,
    chart,
  })));
}

function simpleValue(value: TagValue | undefined): string {
  if (!value) return '—';
  if (value.kind !== 'tag-group') return String(value.value);
  return value.value.items.map((item) => `${item.itemId} ${simpleValue(item.value)}`).join(' · ');
}

function noteLabel(id: string): string {
  if (id === 'total') return '总计';
  if (['tap', 'hold', 'slide', 'touch', 'break', 'drag', 'flick'].includes(id)) {
    return id.toUpperCase();
  }
  return id;
}

function AttributeTable({
  manifest,
  groups,
}: {
  manifest: GameManifestV1;
  groups: readonly TagGroupInstance[];
}) {
  const theme = useAppTheme();
  if (!groups.length) return null;
  return (
    <View style={[styles.attributeTable, { borderColor: theme.border }]}>
      {groups.flatMap((group) => group.items.map((item) => {
        const definition = findTagGroup(manifest, group.groupId);
        const itemDefinition = definition?.items.find((candidate) => candidate.id === item.itemId);
        return (
          <View key={`${group.groupId}:${item.itemId}`} style={styles.attributeCell}>
            <Text style={[styles.attributeLabel, { color: theme.textMuted }]}>
              {itemDefinition?.label ?? (group.groupId === 'charter' ? '谱师' : item.itemId)}
            </Text>
            <Text numberOfLines={2} style={[styles.attributeValue, { color: theme.text }]}>
              {simpleValue(item.value)}
            </Text>
          </View>
        );
      }))}
    </View>
  );
}

function NestedGroup({
  value,
  depth = 0,
}: {
  value: Extract<TagValue, { kind: 'tag-group' }>;
  depth?: number;
}) {
  const theme = useAppTheme();
  return (
    <View style={[styles.nestedGroup, depth > 0 && { borderColor: theme.border }]}>
      {value.value.items.map((item) => (
        <View key={item.itemId} style={styles.nestedRow}>
          <Text style={[styles.nestedLabel, { color: theme.textMuted }]}>{noteLabel(item.itemId)}</Text>
          {item.value?.kind === 'tag-group'
            ? <NestedGroup value={item.value} depth={depth + 1} />
            : <Text style={[styles.nestedValue, { color: theme.text }]}>{simpleValue(item.value)}</Text>}
        </View>
      ))}
    </View>
  );
}

function ChartScore({
  manifest,
  record,
}: {
  manifest: GameManifestV1;
  record?: ScoreCardDocument;
}) {
  const theme = useAppTheme();
  if (!record) {
    return (
      <Text accessibilityLabel="未游玩" style={[styles.noScore, { color: theme.textMuted }]}>
        —
      </Text>
    );
  }
  const primaryLabel = findTagItem(manifest, record.primaryValue)?.label;
  return (
    <View style={styles.scoreArea}>
      <Text style={[styles.primaryLabel, { color: theme.textMuted }]}>{primaryLabel}</Text>
      <Text style={[styles.primaryValue, { color: theme.text }]}>
        {simpleValue(record.primaryValue.value)}
      </Text>
      {record.tagRows.map((row, index) => (
        <View key={index} style={styles.tagRow}>
          {row.map((tag, tagIndex) => (
            <GameTag
              key={`${tag.groupId}:${tag.itemId}:${tagIndex}`}
              manifest={manifest}
              tag={tag}
            />
          ))}
        </View>
      ))}
      {record.trailingMetric ? (
        <View style={styles.metricRow}>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>
            {findTagItem(manifest, record.trailingMetric)?.label}
          </Text>
          <Text style={[styles.metricValue, { color: theme.accent }]}>
            {simpleValue(record.trailingMetric.value)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ChartCard({
  manifest,
  song,
  entry,
  record,
  library,
  width,
}: {
  manifest: GameManifestV1;
  song: SongDocument;
  entry: ChartEntry;
  record?: ScoreCardDocument;
  library: ReturnType<typeof useGameModel>['library'];
  width: number;
}) {
  const theme = useAppTheme();
  const chartItem = library.data?.find((item) => (
    item.kind === 'chart' && item.chartId === entry.chart.id
  ));
  const practice = chartItem?.kind === 'chart' && chartItem.practice;
  const attributes = entry.chart.attributes.filter((group) => group.groupId !== 'notes');
  const notes = entry.chart.attributes.find((group) => group.groupId === 'notes');
  const difficultyDefinition = findTagItem(manifest, entry.chart.difficulty);
  const background = difficultyDefinition?.detailCardBackground;
  const cardBackground = background?.kind === 'solid'
    ? `${background.color}${theme.dark ? '24' : '14'}`
    : theme.surface;
  const externalSearch = async () => {
    const difficulty = findTagItem(manifest, entry.chart.difficulty)?.label
      ?? formatGameTag(manifest, entry.chart.difficulty);
    await openChartSearch(`${song.title} ${difficulty} 谱面确认`);
  };
  return (
    <View
      accessibilityLabel={`${findTagItem(manifest, entry.chart.difficulty)?.label ?? simpleValue(entry.chart.difficulty.value)} 难度卡片`}
      testID={`game-chart-card-${entry.chart.id}`}
      style={[styles.chartCard, { width, backgroundColor: cardBackground, borderColor: theme.border }]}
    >
      <View style={styles.chartHeader}>
        <View style={styles.chartHeaderTags}>
          {entry.type ? <GameTag manifest={manifest} tag={entry.type} /> : null}
          <GameTag manifest={manifest} tag={{
            ...entry.chart.difficulty,
            value: undefined,
            auxiliaryValue: undefined,
          }} />
        </View>
        <View style={styles.difficultyValue}>
          <Text style={[styles.level, { color: theme.text }]}>
            {simpleValue(entry.chart.difficulty.value)}
          </Text>
          {entry.chart.difficulty.auxiliaryValue !== undefined ? (
            <Text style={[styles.constant, { color: theme.textMuted }]}>
              {entry.chart.difficulty.auxiliaryValue.toFixed(1)}
            </Text>
          ) : null}
        </View>
      </View>
      <ChartScore manifest={manifest} record={record} />
      <AttributeTable manifest={manifest} groups={attributes} />
      <View accessibilityLabel="谱面物量" style={styles.notesSection}>
        {notes ? (
          <>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>物量表</Text>
          {notes.items.map((item) => item.value?.kind === 'tag-group'
            ? <NestedGroup key={item.itemId} value={item.value} />
            : (
              <View key={item.itemId} style={styles.nestedRow}>
                <Text style={[styles.nestedLabel, { color: theme.textMuted }]}>
                  {noteLabel(item.itemId)}
                </Text>
                <Text style={[styles.nestedValue, { color: theme.text }]}>{simpleValue(item.value)}</Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={[styles.noScore, { color: theme.textMuted }]}>物量未提供</Text>
        )}
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={practice ? '移出练习清单' : '加入练习清单'}
          onPress={() => {
            if (typeof library.setChartPracticeById === 'function') {
              void library.setChartPracticeById(song.id, entry.chart.id, !practice);
            }
          }}
          style={[styles.action, { borderColor: theme.accent }, practice && { backgroundColor: theme.accent }]}
        >
          <Text style={[styles.actionText, { color: practice ? '#FFFFFF' : theme.accent }]}>
            {practice ? '移出练习清单' : '加入练习清单'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="搜索谱面确认"
          onPress={() => void externalSearch()}
          style={[styles.action, { borderColor: theme.accent }]}
        >
          <Text style={[styles.actionText, { color: theme.accent }]}>搜索谱面确认</Text>
        </Pressable>
      </View>
      <TagEditor
        tags={chartItem?.tags ?? []}
        presets={library.tagPresets ?? []}
        historyTags={buildTagHistory(
          library.data ?? [],
          typeof library.chartKeyById === 'function'
            ? library.chartKeyById(song.id, entry.chart.id)
            : '',
          library.tagPresets ?? [],
        )}
        disabled={library.isUpdating}
        onChange={(tags) => library.setTags({
          kind: 'chart',
          songId: song.id,
          chartId: entry.chart.id,
        }, tags)}
        onPresetsChange={library.setTagPresets}
      />
    </View>
  );
}

export function GameSongDetailScreen() {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const model = useGameModel();
  const {
    songId,
    chartId,
    levelIndex,
    type,
    chartType,
  } = useLocalSearchParams<{
    songId?: string;
    chartId?: string;
    levelIndex?: string;
    type?: string;
    chartType?: string;
  }>();
  const requestedType = type ?? chartType;
  const catalogSong = useMemo(
    () => model.document?.songs.find((item) => item.id === songId),
    [model.document?.songs, songId],
  );
  const detail = useGameSongDocument(songId, catalogSong);
  const song = detail.song;
  const chartEntries = useMemo(() => song ? flattenCharts(song) : [], [song]);
  const requestedIndex = useMemo(() => {
    if (chartId) return Math.max(0, chartEntries.findIndex((entry) => entry.chart.id === chartId));
    if (levelIndex !== undefined) {
      const suffix = `:${Number(levelIndex)}`;
      const index = chartEntries.findIndex((entry) => (
        entry.chart.id.endsWith(suffix)
        && (!requestedType || [
          simpleValue(entry.type?.value),
          entry.type?.itemId,
          entry.type ? findTagItem(model.manifest, entry.type)?.label : undefined,
        ].includes(requestedType))
      ));
      return Math.max(0, index);
    }
    const defaultIndex = chartEntries.findIndex((entry) => entry.chart.difficulty.itemId === 'in');
    return Math.max(0, defaultIndex);
  }, [chartEntries, chartId, levelIndex, model.manifest, requestedType]);
  const [selectedChartId, setSelectedChartId] = useState<string | undefined>(
    chartEntries[requestedIndex]?.chart.id ?? chartId,
  );
  const favoriteItem = model.library.data?.find((item) => (
    item.kind === 'song' && item.songId === song?.id
  ));
  const favorite = favoriteItem?.kind === 'song' && favoriteItem.favorite;
  const cardWidth = Math.max(280, width - 24);

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{
        headerShown: false,
        headerBackVisible: false,
        headerTransparent: true,
      }} />
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={() => router.back()}
          style={[styles.circleButton, { backgroundColor: theme.surface }]}
        >
          <Ionicons name="chevron-back" color={theme.text} size={24} />
        </Pressable>
        {song ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${favorite ? '取消收藏' : '收藏'} ${song.title}`}
            onPress={() => void model.library.setSongFavorite(song.id, !favorite)}
            style={[styles.circleButton, { backgroundColor: theme.surface }]}
          >
            <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={theme.accent} size={23} />
          </Pressable>
        ) : null}
      </View>
      <QueryStateView<SongDocument>
        isLoading={model.isLoading || detail.isLoading}
        isError={model.isError || detail.isError}
        isEmpty={!!model.document && !song}
        error={model.error ?? detail.error}
        onRetry={() => void Promise.all([model.refetch(), detail.refetch()])}
        emptyText="未找到歌曲"
        data={song}
        renderData={(currentSong) => (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.hero}>
              <GameAssetImage asset={currentSong.cover} size={210} borderRadius={18} />
              <Text style={[styles.songId, { color: theme.textMuted }]}>ID {currentSong.id}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                testID="game-song-title-scroll"
              >
                <Text numberOfLines={1} style={[styles.songTitle, { color: theme.text }]}>
                  {currentSong.title}
                </Text>
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={[styles.artist, { color: theme.textSecondary }]}>{currentSong.artist}</Text>
              </ScrollView>
            </View>
            <AttributeTable manifest={model.manifest} groups={currentSong.attributes} />
            <ScrollView
              testID="game-chart-carousel"
              horizontal
              pagingEnabled
              decelerationRate="fast"
              snapToInterval={cardWidth + 12}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              contentOffset={{ x: requestedIndex * (cardWidth + 12), y: 0 }}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12));
                setSelectedChartId(chartEntries[index]?.chart.id);
              }}
            >
              {chartEntries.map((entry) => (
                <ChartCard
                  key={entry.chart.id}
                  manifest={model.manifest}
                  song={currentSong}
                  entry={entry}
                  record={model.document?.records.find((record) => record.chartId === entry.chart.id)}
                  library={model.library}
                  width={cardWidth}
                />
              ))}
            </ScrollView>
            {selectedChartId ? (
              <Text style={[styles.carouselHint, { color: theme.textMuted }]}>
                {chartEntries.findIndex((entry) => entry.chart.id === selectedChartId) + 1}
                {' / '}
                {chartEntries.length}
              </Text>
            ) : null}
            {currentSong.customSections.map((section) => (
              <View key={section.id} style={[styles.customSection, { backgroundColor: theme.surface }]}>
                <Text style={[styles.customSectionTitle, { color: theme.text }]}>{section.title}</Text>
                {section.items.map((item) => (
                  <View key={item.id} style={[styles.customItem, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.customItemTitle, { color: theme.text }]}>{item.title}</Text>
                    {item.subtitle ? (
                      <Text style={[styles.customItemSubtitle, { color: theme.textMuted }]}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
            <View style={[styles.songTags, { backgroundColor: theme.surface }]}>
              <TagEditor
                tags={favoriteItem?.tags ?? []}
                presets={model.library.tagPresets ?? []}
                historyTags={buildTagHistory(
                  model.library.data ?? [],
                  model.library.songKey(currentSong.id),
                  model.library.tagPresets ?? [],
                )}
                disabled={model.library.isUpdating}
                onChange={(tags) => model.library.setTags({ kind: 'song', songId: currentSong.id }, tags)}
                onPresetsChange={model.library.setTagPresets}
              />
            </View>
          </ScrollView>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingBottom: 32, gap: 14 },
  topBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 12,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  hero: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 12, gap: 7 },
  songId: { fontSize: 11, fontWeight: '700', marginTop: 5 },
  songTitle: { fontSize: 25, fontWeight: '900' },
  artist: { fontSize: 14, fontWeight: '600' },
  attributeTable: {
    marginHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  attributeCell: { minWidth: 90, flex: 1, gap: 3 },
  attributeLabel: { fontSize: 10, fontWeight: '700' },
  attributeValue: { fontSize: 12, fontWeight: '700' },
  carousel: { paddingHorizontal: 12, gap: 12 },
  chartCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 11 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  chartHeaderTags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  difficultyValue: { alignItems: 'flex-end' },
  level: { fontSize: 24, fontWeight: '900' },
  constant: { fontSize: 11, fontWeight: '700' },
  scoreArea: { gap: 5 },
  primaryLabel: { fontSize: 10, fontWeight: '700' },
  primaryValue: { fontSize: 28, fontWeight: '900' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metricRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  metricLabel: { fontSize: 10, fontWeight: '700' },
  metricValue: { fontSize: 20, fontWeight: '900' },
  noScore: { fontSize: 12 },
  notesSection: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#9CA3AF66', paddingTop: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '700' },
  nestedGroup: { gap: 5 },
  nestedRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  nestedLabel: { fontSize: 11, fontWeight: '700' },
  nestedValue: { flex: 1, textAlign: 'right', fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12, fontWeight: '800' },
  carouselHint: { alignSelf: 'center', fontSize: 11 },
  songTags: { marginHorizontal: 12, padding: 14, borderRadius: 14 },
  customSection: { marginHorizontal: 12, padding: 14, borderRadius: 14, gap: 8 },
  customSectionTitle: { fontSize: 16, fontWeight: '900' },
  customItem: { paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  customItemTitle: { fontSize: 13, fontWeight: '800' },
  customItemSubtitle: { fontSize: 11, lineHeight: 16 },
});
