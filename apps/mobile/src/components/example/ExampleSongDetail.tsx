import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { RemoteImage } from '@/components/RemoteImage';
import { TagEditor } from '@/components/TagEditor';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import { useStackScreenReady } from '@/components/CachedTabScreen';
import { AutoScrollText } from '@/components/game-content/AutoScrollText';
import { DetailGestureRoot, DetailPressable } from '@/components/game-content/DetailPressable';
import { FloatingSongDetailChrome } from '@/components/game-content/FloatingSongDetailChrome';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { SongDetailHero } from '@/components/game-content/SongDetailHero';
import { SongMetadataTable } from '@/components/game-content/SongMetadataTable';
import { VERTICAL_SONG_DETAIL_STYLES as styles } from '@/components/game-content/SongDetailChromeStyles';
import { EXAMPLE_DIFFICULTY_COLORS, type ExampleRecord } from '@/domain/example';
import { buildTagHistory } from '@/domain/user-library';
import { presentExampleRecord } from '@/features/game-content/adapters/example';
import { useGameData } from '@/hooks/use-game-data';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useAppTheme } from '@/theme/app-theme';
import { ExampleDifficultyBadge, ExampleScoreValue } from './ExampleSongContent';

type Library = ReturnType<typeof useUserLibrary>;

export function ExampleSongDetail({ songId }: { songId: string }) {
  const theme = useAppTheme(); const query = useGameData(); const library = useUserLibrary();
  const record = query.data?.payload.kind === 'example' ? query.data.payload.records.find(item => item.song.id === songId) : undefined;
  const entry = library.data?.find(item => item.key === library.songKey(songId));
  const favorite = entry?.kind === 'song' && entry.favorite;
  return <><StatusBar style="light" /><View style={[styles.page, { backgroundColor: theme.background }]}>
    <QueryStateView data={record} isLoading={query.isPending} isError={query.isError} error={query.error} isEmpty={!record}
      emptyText="找不到这首歌曲" onRetry={() => void query.refetch()}
      renderData={data => <ExampleDetailContent key={data.song.id} record={data} library={library} />} />
    <FloatingSongDetailChrome songTitle={record?.song.title} favorite={favorite} favoriteDisabled={library.isLoading || library.isUpdating}
      onToggleFavorite={record ? () => { void library.setSongFavorite(songId, !favorite); } : undefined} />
  </View></>;
}

function ExampleDetailContent({ record, library }: { record: ExampleRecord; library: Library }) {
  const theme = useAppTheme(); const { width } = useWindowDimensions(); const ready = useStackScreenReady();
  const [coverFailed, setCoverFailed] = useState(false); const { song } = record;
  const presentation = presentExampleRecord(record);
  const songKey = library.songKey(song.id); const chartKey = library.chartKey(song.id, 'SD', 0);
  const songItem = library.data?.find(item => item.key === songKey);
  const chartItem = library.data?.find(item => item.key === chartKey);
  const practice = chartItem?.kind === 'chart' && chartItem.practice;
  const pending = library.isLoading || library.isUpdating;
  return <ScrollView contentContainerStyle={styles.content}>
    <SongDetailHero size={width} style={styles.hero}
      cover={coverFailed ? undefined : <RemoteImage source={song.coverUrl} gameId="example" cacheProfile="artwork"
        contentFit="cover" style={StyleSheet.absoluteFill} onError={() => setCoverFailed(true)} />}
      placeholderStyle={[styles.heroPlaceholder, { backgroundColor: theme.input }]} placeholderNoteStyle={styles.heroPlaceholderNote}
      shadeColors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} shadeStyle={styles.heroShade} copyStyle={styles.heroCopy}>
      <Text style={styles.songId}>ID{song.id}</Text>
      <AutoScrollText text={song.title} textStyle={styles.title} style={styles.singleLine} contentContainerStyle={styles.singleLineContent} />
      <Text style={styles.artist}>{song.artist}</Text>
    </SongDetailHero>
    <SongMetadataTable accessibilityLabel={song.title} testIDPrefix="example-metadata" items={[
      { key: 'genre', label: '分类', value: song.genre, flex: 1 }, { key: 'bpm', label: 'BPM', value: String(song.bpm), flex: 1 },
      { key: 'version', label: '版本', value: song.version, flex: 1 },
    ]} cellStyle={styles.metadataCell} labelStyle={styles.metadataLabel} measureStyle={styles.metadataValueMeasure}
      style={styles.metadataTable} valueBlockStyle={styles.metadataValueBlock} valueStyle={styles.metadataValue} />
    {ready ? <>
      <View style={localStyles.chartWrap}><LinearGradient colors={EXAMPLE_DIFFICULTY_COLORS}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={localStyles.chartBorder}>
        <GameChartResultCard style={[styles.chartCard, localStyles.chart, { backgroundColor: theme.surface }]}>
          <View style={styles.chartHeader}><ExampleDifficultyBadge /></View>
          <View style={localStyles.resultRow}>
            <View style={styles.resultBlock}><Text style={[styles.resultLabel, { color: theme.textMuted }]}>{presentation.primaryMetric.label}</Text>
              <ExampleScoreValue text={presentation.primaryMetric.text} large /><LayeredGradientBadge label="EX" tone="rainbow"
                style={localStyles.grade} textStyle={localStyles.gradeText} />
            </View>
            <View style={localStyles.rating}><Text style={[styles.resultLabel, { color: theme.textMuted }]}>Rating</Text>
              <Text style={[styles.statValue, { color: theme.text }]}>{record.rating}</Text></View>
          </View>
          <View style={[styles.chartDivider, { backgroundColor: theme.border }]} />
          <DetailGestureRoot><DetailPressable disabled={pending} onPress={() => { void library.setChartPractice(song.id, 'SD', 0, !practice); }}>
            <LinearGradient colors={EXAMPLE_DIFFICULTY_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={localStyles.action}>
              <Text style={[styles.actionText, localStyles.actionText]}>{practice ? '移出练习清单' : '加入练习清单'}</Text>
            </LinearGradient>
          </DetailPressable></DetailGestureRoot>
          <TagEditor readState={library.tagReadState} testID="example-chart-tags" tags={chartItem?.tags ?? []} presets={library.tagPresets}
            historyTags={() => buildTagHistory(library.data ?? [], chartKey, library.tagPresets)} disabled={pending}
            onPresetsChange={library.setTagPresets} onChange={tags => library.setTags({ kind: 'chart', songId: song.id, type: 'SD', levelIndex: 0 }, tags)} />
        </GameChartResultCard>
      </LinearGradient></View>
      <View style={styles.details}><Card><TagEditor readState={library.tagReadState} testID="example-song-tags" tags={songItem?.tags ?? []} presets={library.tagPresets}
        historyTags={() => buildTagHistory(library.data ?? [], songKey, library.tagPresets)} disabled={pending}
        onPresetsChange={library.setTagPresets} onChange={tags => library.setTags({ kind: 'song', songId: song.id }, tags)} /></Card></View>
    </> : <View style={styles.deferredPlaceholder} />}
  </ScrollView>;
}

const localStyles = StyleSheet.create({
  chartWrap: { padding: 16 }, chartBorder: { padding: 2, borderRadius: 26 }, chart: { borderWidth: 0 },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rating: { alignItems: 'flex-end', gap: 4 }, action: { borderRadius: 11, padding: 12, alignItems: 'center', marginBottom: 14 },
  actionText: { color: '#FFFFFF' },
  grade: { height: 24, minWidth: 32 }, gradeText: { fontSize: 9, fontWeight: '900', paddingHorizontal: 6 },
});
