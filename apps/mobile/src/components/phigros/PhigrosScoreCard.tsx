import { memo } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import { PhigrosRateBadge, resolvePhigrosRate } from './PhigrosRateBadge';
import { PhigrosScoreValue } from './PhigrosScoreValue';
import { PhigrosXingBadge } from './PhigrosXingBadge';
import type { ScoreRecord } from '@/domain/models';
import { formatPhigrosSongRks, PHIGROS_MAX_SCORE } from '@/domain/phigros';
import { formatPushAcc } from '@/domain/phigros-push';
import { resolvePhigrosXingKind } from '@/domain/phigros-xing';
import { useAppTheme } from '@/theme/app-theme';

export type PhigrosPushHint = {
  currentAcc: number;
  targetAcc: number;
  accDiff: number;
};

export const PhigrosScoreCard = memo(function PhigrosScoreCard({
  record,
  catalogTitle,
  rank,
  pushHint,
  totalNotes,
}: {
  record: ScoreRecord;
  catalogTitle?: string;
  rank?: number;
  /** 推分页：当前 Acc → 目标 Acc */
  pushHint?: PhigrosPushHint;
  /** 谱面物量；缺省时不判定 XING */
  totalNotes?: number;
}) {
  const theme = useAppTheme();
  const score = record.dxScore ?? 0;
  const isPhi = score === PHIGROS_MAX_SCORE;
  const isFc = record.fc === 'ap' && !isPhi;
  const acc = record.achievements;
  const accText = acc % 1 === 0 ? `${acc.toFixed(0)}%` : `${acc.toFixed(2)}%`;
  const rksText = formatPhigrosSongRks(record.rating);
  const rate = resolvePhigrosRate(record);
  const xingKind = resolvePhigrosXingKind(acc, totalNotes, record.fc === 'ap');
  const title = catalogTitle ?? record.title;
  const openDetail = () => router.push({
    pathname: '/songs/[songId]',
    params: { songId: record.songId, levelIndex: String(record.levelIndex) },
  } as Href);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看谱面 ${title}`}
      onPress={openDetail}
      style={[styles.card, { backgroundColor: theme.surface }]}
    >
      <View style={styles.main}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {rank ? `${rank}. ` : ''}{title}
        </Text>
        <PhigrosScoreValue
          score={score}
          variant={isPhi ? 'phi' : isFc ? 'fc' : 'normal'}
          textColor={theme.text}
        />
        <View style={styles.tags}>
          <PhigrosDifficultyBadge levelIndex={record.levelIndex} constant={record.difficultyConstant} />
          <PhigrosRateBadge rate={rate} fc={record.fc === 'ap'} />
          {xingKind ? <PhigrosXingBadge kind={xingKind} /> : null}
        </View>
        {pushHint ? (
          <Text style={[styles.pushLine, { color: theme.textSecondary }]}>
            {formatPushAcc(pushHint.currentAcc)}
            {' → '}
            <Text style={{ color: theme.accent, fontWeight: '800' }}>
              {formatPushAcc(pushHint.targetAcc)}
            </Text>
            {'  '}
            <Text style={{ color: theme.textMuted }}>
              (+{formatPushAcc(pushHint.accDiff)})
            </Text>
          </Text>
        ) : null}
      </View>
      <View style={styles.stats}>
        <Text style={[styles.acc, { color: theme.text }]}>
          {pushHint ? formatPushAcc(pushHint.targetAcc) : accText}
        </Text>
        <Text style={[styles.rks, { color: theme.accent }]}>{rksText}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  pushLine: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  stats: { minWidth: 56, alignItems: 'flex-end', gap: 4 },
  acc: { fontSize: 12, fontWeight: '700' },
  rks: { fontSize: 20, fontWeight: '900' },
});
