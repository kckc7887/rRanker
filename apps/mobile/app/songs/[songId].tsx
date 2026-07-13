import { useMemo } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { QueryStateView } from '@/components/QueryStateView';
import { SongCover } from '@/components/SongCover';
import { SourceStatus } from '@/components/SourceStatus';
import { normalizeSongId } from '@/domain/catalog';
import type { ScoreRecord, Song } from '@/domain/models';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';

export default function SongDetailScreen() {
  const { songId } = useLocalSearchParams<{ songId: string }>();
  const catalog = useDetailedCatalog();
  const scores = useScoreSnapshot();
  const song = useMemo(() => catalog.data?.songs.find((item) => item.id === songId), [catalog.data?.songs, songId]);
  return <View style={styles.page}><Stack.Screen options={{ title: song?.title ?? '歌曲详情' }} />
    <QueryStateView<Song> isLoading={catalog.isLoading} isError={catalog.isError} isEmpty={!!catalog.data && !song}
      isStale={!!catalog.data?.source.isStale} error={catalog.error} onRetry={() => void catalog.refetch()}
      emptyText="找不到这首歌曲" data={song} renderData={(item) => <Detail song={item} records={scores.data?.records ?? []}
        catalogSource={catalog.data!.source} scoreSource={scores.data?.source} />} />
  </View>;
}

function Detail({ song, records, catalogSource, scoreSource }: { song: Song; records: ScoreRecord[]; catalogSource: Song['charts'][number] extends never ? never : import('@/domain/models').DataSource; scoreSource?: import('@/domain/models').DataSource }) {
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><SongCover songId={song.id} size={100} /><View style={styles.headerText}>
      <Text style={styles.title}>{song.title}</Text><Text style={styles.meta}>{song.artist ?? '曲师未知'}</Text>
      <Text style={styles.meta}>ID {song.id} · BPM {song.bpm ?? '未知'}</Text><Text style={styles.meta}>{song.genre ?? '分类未知'} · {song.version}</Text>
    </View></View>
    <SourceStatus items={[
      { key: 'catalog', label: catalogSource.label, updatedAt: catalogSource.updatedAt, state: catalogSource.isStale ? 'cache' : 'live' },
      { key: 'scores', label: scoreSource?.label ?? '成绩未加载', updatedAt: scoreSource?.updatedAt, state: !scoreSource ? 'unavailable' : scoreSource.isStale ? 'cache' : 'live' },
    ]} />
    <Card><Text style={styles.section}>歌曲信息</Text><Text style={styles.body}>别名：{song.aliases?.join('、') || '无'}</Text>
      <Text style={styles.body}>版权：{song.rights || '未提供'}</Text><Text style={styles.body}>状态：{song.disabled ? '禁用' : song.locked ? '锁定' : '可用'}</Text></Card>
    {song.charts.map((chart) => {
      const best = records.filter((record) => normalizeSongId(record.songId) === song.id && record.type === chart.type && record.levelIndex === chart.levelIndex)
        .sort((a, b) => b.achievements - a.achievements)[0];
      return <Card key={`${chart.type}:${chart.levelIndex}`}><Text style={styles.section}>{chart.type} · {chart.difficulty.toUpperCase()} · {chart.level} ({chart.difficultyConstant.toFixed(1)})</Text>
        <Text style={styles.body}>谱师：{chart.charter || '未提供'} · 谱面版本：{chart.versionId ?? '未知'}</Text>
        <Text style={styles.body}>{chart.notes ? `TAP ${chart.notes.tap} / HOLD ${chart.notes.hold} / SLIDE ${chart.notes.slide} / TOUCH ${chart.notes.touch} / BREAK ${chart.notes.break} / 总计 ${chart.notes.total}` : '物量未提供'}</Text>
        <Text style={best ? styles.best : styles.meta}>{best ? `最佳 ${best.achievements.toFixed(4)}% · Rating ${best.rating} · ${best.fc ?? '无 FC'} · ${best.fs ?? '无 FS'}` : '未游玩'}</Text>
      </Card>;
    })}
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 16, gap: 12 }, header: { flexDirection: 'row', gap: 14, alignItems: 'center' }, headerText: { flex: 1, gap: 3 }, title: { fontSize: 21, fontWeight: '800', color: '#111827' }, meta: { color: '#6B7280', fontSize: 12 }, section: { fontWeight: '700', color: '#111827', marginBottom: 7 }, body: { color: '#374151', lineHeight: 20 }, best: { color: '#246BFD', fontWeight: '600', marginTop: 6 } });
