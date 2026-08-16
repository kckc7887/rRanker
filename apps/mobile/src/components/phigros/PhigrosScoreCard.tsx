import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import { PhigrosRateBadge, resolvePhigrosRate } from './PhigrosRateBadge';
import { PhigrosScoreValue } from './PhigrosScoreValue';
import { PhigrosXingBadge } from './PhigrosXingBadge';
import type { ScoreRecord } from '@/domain/models';
import { formatPhigrosSongRks, PHIGROS_MAX_SCORE } from '@/domain/phigros';
import { formatPushAcc } from '@/domain/phigros-push';
import { resolvePhigrosXingKind } from '@/domain/phigros-xing';
import { useAppTheme } from '@/theme/app-theme';
import { COMPACT_METRIC_CARD_STYLES, GameScoreCard } from '@/components/game-content/GameScoreCard';
import { presentPhigrosScore } from '@/features/game-content/adapters';

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
  const presentation = presentPhigrosScore(record, title, rank);

  return (
    <GameScoreCard
      cardStyle={styles.card}
      mainStyle={styles.main}
      metricSide={{
        blockStyle: styles.stats,
        lines: [
          { text: pushHint ? formatPushAcc(pushHint.targetAcc) : accText, style: styles.acc, color: theme.text },
          { text: rksText, style: styles.rks, color: theme.accent },
        ],
      }}
      presentation={presentation}
      titleStyle={styles.title}
    >
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
    </GameScoreCard>
  );
});

export const PHIGROS_SCORE_CARD_STYLES = StyleSheet.create({
  ...COMPACT_METRIC_CARD_STYLES,
  pushLine: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
const styles = PHIGROS_SCORE_CARD_STYLES;
