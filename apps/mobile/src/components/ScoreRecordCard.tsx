import { memo } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScoreRecord } from '@/domain/models';
import { AchievementValue, DifficultyBadge, ScoreStatusBadges } from './ScoreVisuals';

export const ScoreRecordCard = memo(function ScoreRecordCard({ record, rank }: { record: ScoreRecord; rank?: number }) {
  const openDetail = () => router.push({
    pathname: '/songs/[songId]',
    params: { songId: record.songId, chartType: record.type, levelIndex: String(record.levelIndex) },
  } as Href);
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`查看谱面 ${record.title} ${record.type} ${record.difficulty}`}
    onPress={openDetail} style={styles.card}>
    <View style={styles.main}>
      <Text numberOfLines={1} style={styles.title}>{rank ? `${rank}. ` : ''}{record.title}</Text>
      <AchievementValue value={record.achievements} compact />
      <View style={styles.tags}>
        <DifficultyBadge difficulty={record.difficulty} constant={record.difficultyConstant} compact />
        <ScoreStatusBadges rate={record.rate} achievements={record.achievements} fc={record.fc} fs={record.fs} />
      </View>
    </View>
    <View style={styles.ratingBlock}>
      <Text style={styles.ratingLabel}>Rating</Text>
      <Text style={styles.rating}>{record.rating}</Text>
    </View>
  </Pressable>;
});

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 3 }, title: { color: '#111827', fontSize: 15, fontWeight: '700' },
  tags: { minHeight: 25, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  ratingBlock: { minWidth: 52, alignItems: 'flex-end', gap: 2 }, ratingLabel: { color: '#8A93A3', fontSize: 10, fontWeight: '700' },
  rating: { color: '#246BFD', fontSize: 19, fontWeight: '900' },
});
