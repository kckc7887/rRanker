import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ChartType, Difficulty, ScoreRecord } from '@/domain/models';
import { AchievementValue, ChartTypeBadge, DifficultyBadge, ScoreStatusBadges } from './ScoreVisuals';
import { useAppTheme } from '@/theme/app-theme';
import { GameScoreCard } from '@/components/game-content/GameScoreCard';
import { presentMaimaiScore } from '@/features/game-content/adapters';
import { maimaiJacketUrl } from '@/domain/maimai-assets';

/** 成绩页卡片数据；未游玩谱面可省略达成率/Rating/成就字段。 */
export type ScoreRecordCardData = {
  songId: string;
  title: string;
  type: ChartType;
  difficulty: Difficulty;
  difficultyConstant: number;
  levelIndex: number;
  achievements?: number;
  dxScore?: number | null;
  rating?: number;
  fc?: string | null;
  fs?: string | null;
  rate?: string | null;
};

export const ScoreRecordCard = memo(function ScoreRecordCard({
  record,
  rank,
  interactive = true,
  artworkCachePolicy,
}: {
  record: ScoreRecord | ScoreRecordCardData;
  rank?: number;
  /** false 时渲染纯预览卡（无按压与详情跳转）；缺省保持可点击。 */
  interactive?: boolean;
  /** 预览等一次性场景传 "none" 完全跳过曲绘缓存。 */
  artworkCachePolicy?: 'none';
}) {
  const theme = useAppTheme();
  const presentation = presentMaimaiScore(record, rank);
  return <GameScoreCard
    artwork={{ source: maimaiJacketUrl(record.songId), ...(artworkCachePolicy ? { cachePolicy: artworkCachePolicy } : {}) }}
    cardStyle={styles.card}
    mainStyle={styles.main}
    presentation={presentation}
    pressable={interactive}
    side={record.type === 'UTAGE' ? null : <View style={styles.ratingBlock}>
      <Text style={[styles.ratingLabel, { color: theme.textMuted }]}>Rating</Text>
      <Text style={[styles.rating, { color: record.rating === undefined ? theme.textMuted : theme.accent }]}>
        {record.rating === undefined ? '—' : record.rating}
      </Text>
    </View>}
    titleStyle={styles.title}
  >
      <AchievementValue value={record.achievements} compact />
      {record.type === 'UTAGE'
        ? <Text style={[styles.dxScore, { color: theme.textSecondary }]}>DX分数 {record.dxScore ?? '—'}</Text>
        : null}
      <View testID={`score-card-badges-${record.songId}`} style={styles.tags}>
        <DifficultyBadge difficulty={record.difficulty} constant={record.difficultyConstant} compact />
        {record.type === 'UTAGE' ? null : <ChartTypeBadge type={record.type} />}
        <ScoreStatusBadges rate={record.rate} achievements={record.achievements} fc={record.fc} fs={record.fs} nearMissFirst />
      </View>
  </GameScoreCard>;
});

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 3 }, title: { color: '#111827', fontSize: 15, fontWeight: '700' },
  dxScore: { fontSize: 11, fontWeight: '700' },
  tags: { minHeight: 25, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  ratingBlock: { minWidth: 52, alignItems: 'flex-end', gap: 2 }, ratingLabel: { color: '#8A93A3', fontSize: 10, fontWeight: '700' },
  rating: { color: '#246BFD', fontSize: 19, fontWeight: '900' },
});
