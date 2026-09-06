import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/Card';
import { RemoteImage } from '@/components/RemoteImage';
import { QueryStateView } from '@/components/QueryStateView';
import { TagEditor } from '@/components/TagEditor';
import { useNotification } from '@/components/AppNotification';
import { ChartCarousel } from '@/components/game-content/ChartCarousel';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { SongDetailHero } from '@/components/game-content/SongDetailHero';
import { SongDetailChrome } from '@/components/game-content/SongDetailChrome';
import { MAJDATA_NAMES, MAJDATA_ORDER, majdataAsset, majdataDefaultDifficulty, majdataTags, type MajdataSong } from '@/domain/majdata';
import { buildTagHistory } from '@/domain/user-library';
import { useMajdataSong, useMajdataParsedChart } from '@/hooks/use-majdata';
import { useGameData } from '@/hooks/use-game-data';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useAppTheme } from '@/theme/app-theme';
import { downloadSimaiPackage } from '@/features/chart-download-shared/simai-package';
import { useChartPackageDownload } from '@/features/chart-download-shared/use-chart-package-download';
import { MajdataDifficultyBadge, majdataVisual } from './MajdataCards';

export function MajdataSongDetail({ songId, initialLevelIndex }: { songId: string; initialLevelIndex?: number }) {
  const query = useMajdataSong(songId);
  return <QueryStateView {...query} isEmpty={false} onRetry={() => void query.refetch()} renderData={song => <MajdataDetailContent song={song} initialLevelIndex={initialLevelIndex} />} />;
}

function MajdataDetailContent({ song, initialLevelIndex }: { song: MajdataSong; initialLevelIndex?: number }) {
  const theme = useAppTheme(); const { width } = useWindowDimensions(); const insets = useSafeAreaInsets();
  const library = useUserLibrary(); const items = library.data ?? [];
  const local = items.find(item => item.key === library.songKey(song.id));
  const levels = MAJDATA_ORDER.filter(level => song.levels[level]?.trim());
  const initial = majdataDefaultDifficulty(song, initialLevelIndex);
  const label = { color: theme.text }; const cardWidth = width - 48;
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <SongDetailHero size={width} style={{ overflow: 'hidden' }} placeholderStyle={styles.fill} placeholderNoteStyle={{ fontSize: 80 }}
        cover={<RemoteImage source={majdataAsset(song.id, 'image', true)} gameId="majdata-net" cacheProfile="artwork" style={styles.fill} accessibilityLabel={`${song.title} 封面`} />}
        shadeColors={['transparent', '#000000CC']} shadeStyle={styles.fill} copyStyle={styles.heroCopy}>
        <Text style={styles.white}>{song.id}</Text><Text style={styles.title}>{song.title}</Text><Text style={styles.white}>{song.artist}</Text>
      </SongDetailHero>
      <View style={styles.section}><Text style={label}>{song.designer || '-'}</Text><Text style={{ color: theme.textMuted }}>{new Date(song.timestamp).toLocaleString()}</Text></View>
      <ChartCarousel items={levels} cardWidth={cardWidth} gap={12} initialIndex={Math.max(0, levels.indexOf(initial as typeof levels[number]))}
        resetKey={`${song.id}:${initial}`} accessibilityLabel="歌曲难度" empty={<Text style={label}>暂无谱面</Text>}
        rootStyle={{}} scrollStyle={{}} contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }} keyExtractor={String}
        renderItem={level => <MajdataChartCard song={song} level={level} width={cardWidth} />} />
      <View style={styles.section}><Card><Text style={[styles.heading, label]}>歌曲信息</Text>
        <Text style={label}>{song.description || '-'}</Text><Text style={label}>标签　{majdataTags(song).join(' · ') || '-'}</Text>
        <Text selectable style={label}>HASH　{song.hash}</Text><Text style={label}>上传者　{song.uploader || '-'}</Text>
      </Card><Card><Text style={[styles.heading, label]}>本地标签</Text><TagEditor tags={local?.tags ?? []} presets={library.tagPresets}
        historyTags={buildTagHistory(items, library.songKey(song.id), library.tagPresets)} onPresetsChange={library.setTagPresets} onChange={tags => library.setTags({ kind: 'song', songId: song.id }, tags)} /></Card></View>
    </ScrollView>
    <SongDetailChrome topInset={insets.top} backStyle={() => [styles.chrome, { top: insets.top + 8, left: 16 }]}
      favorite={{ label: local?.kind === 'song' && local.favorite ? '取消收藏' : '收藏歌曲', active: local?.kind === 'song' && local.favorite, disabled: library.isUpdating,
        onPress: () => void library.setSongFavorite(song.id, !(local?.kind === 'song' && local.favorite)) }}
      favoriteStyle={() => [styles.chrome, { top: insets.top + 8, right: 16 }]} />
  </View>;
}

function MajdataChartCard({ song, level, width }: { song: MajdataSong; level: number; width: number }) {
  const theme = useAppTheme(); const visual = majdataVisual(level); const parsed = useMajdataParsedChart(song, level);
  const library = useUserLibrary(); const game = useGameData(); const { showActionNotification } = useNotification();
  const download = useChartPackageDownload({ successMessage: '谱面文件已保存。' });
  const records = game.data?.payload.kind === 'majdata-net' ? game.data.payload.snapshot.records : [];
  const best = records.find(score => score.chartInfo.id === song.id && score.chartLevel === level && score.hash === song.hash);
  const item = library.data?.find(entry => entry.key === library.chartKey(song.id, 'SD', level));
  const statistics = parsed.data?.statistics;
  const notes = useMemo(() => ({ key: 'notes', values: Object.entries(statistics?.counts ?? { tap: '-', hold: '-', slide: '-', touch: '-', break: '-', mine: '-' }).map(([key, value]) => ({ key, label: key.toUpperCase(), value: String(value) })) }), [statistics]);
  const startDownload = (includeVideo: boolean) => void download.start(options => downloadSimaiPackage({ title: song.title, suffix: MAJDATA_NAMES[level], resources: [
    { fileName: 'maidata.txt', url: majdataAsset(song.id, 'chart') }, { fileName: 'track.mp3', url: majdataAsset(song.id, 'track') },
    { fileName: 'bg.auto', url: majdataAsset(song.id, 'image', true) }, ...(includeVideo ? [{ fileName: 'pv.mp4', url: majdataAsset(song.id, 'video') }] : []),
  ] }, options));
  const requestDownload = async () => {
    let video = false;
    try { video = (await fetch(majdataAsset(song.id, 'video'), { method: 'HEAD' })).ok; } catch { /* Optional video. */ }
    if (!video) { startDownload(false); return; }
    showActionNotification({ title: '包含背景视频？', message: '背景视频会增加下载大小。', variant: 'info', actions: [
      { label: '取消', tone: 'cancel' }, { label: '仅谱面和音乐', onPress: () => startDownload(false) }, { label: '包含视频', onPress: () => startDownload(true) },
    ] });
  };
  const button = (title: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: theme.surfaceMuted, opacity: disabled ? 0.5 : 1 }]}><Text style={{ color: theme.text }}>{title}</Text></Pressable>;
  return <GameChartResultCard style={{ width, padding: 18, borderRadius: 24, borderWidth: 1, borderColor: visual.color, backgroundColor: theme.surface, gap: 14 }}>
    <View style={styles.row}><MajdataDifficultyBadge level={level} /><Text style={{ color: visual.color, fontSize: 24, fontWeight: '800' }}>{song.levels[level]}</Text></View>
    <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>DX　{best ? `${best.acc.dx.toFixed(4)}%` : '-'}</Text>
    <Text style={{ color: theme.textSecondary }}>Classic　{best ? `${best.acc.classic.toFixed(4)}%` : '-'}</Text>
    <View style={{ height: 1, backgroundColor: theme.border }} />
    <Pressable accessibilityRole="button" accessibilityLabel="物量与达成率计算" disabled={!statistics} onPress={() => router.push({ pathname: '/tools/tolerance', params: { gameId: 'majdata-net', songId: song.id, hash: song.hash, levelIndex: String(level) } })}>
      <GameNoteTable mode="cells" group={notes} containerStyle={styles.row} itemStyle={{ alignItems: 'center' }} labelStyle={{ fontSize: 10, color: theme.textMuted }} valueStyle={{ fontSize: 18, color: theme.text }} />
    </Pressable>
    {parsed.isError ? button('物量加载失败，点击重试', () => void parsed.refetch()) : null}
    {button(item?.kind === 'chart' && item.practice ? '移出练习清单' : '加入练习清单', () => void library.setChartPractice(song.id, 'SD', level, !(item?.kind === 'chart' && item.practice)), library.isUpdating)}
    {button('查看谱面确认', () => router.push({ pathname: '/songs/chart-preview', params: { gameId: 'majdata-net', songId: song.id, levelIndex: String(level), hash: song.hash, title: song.title } }))}
    {button('下载谱面文件', () => void requestDownload(), download.isRunning)}
    <Text style={{ color: theme.text }}>本地标签</Text><TagEditor tags={item?.tags ?? []} presets={library.tagPresets} historyTags={buildTagHistory(library.data ?? [], library.chartKey(song.id, 'SD', level), library.tagPresets)}
      onPresetsChange={library.setTagPresets} onChange={tags => library.setTags({ kind: 'chart', songId: song.id, type: 'SD', levelIndex: level }, tags)} />
  </GameChartResultCard>;
}
const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject }, heroCopy: { position: 'absolute', left: 24, right: 24, bottom: 24, gap: 6 },
  white: { color: '#FFFFFF' }, title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' }, section: { padding: 24, gap: 12 },
  heading: { fontSize: 18, fontWeight: '800', marginBottom: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chrome: { position: 'absolute', backgroundColor: '#00000066', padding: 10, borderRadius: 30 }, button: { padding: 14, borderRadius: 12, alignItems: 'center' },
});
