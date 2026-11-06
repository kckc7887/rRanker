import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import { PhigrosRateBadge, resolvePhigrosRate } from './PhigrosRateBadge';
import { PhigrosScoreValue } from './PhigrosScoreValue';
import { PhigrosXingBadge } from './PhigrosXingBadge';
import type { ScoreRecord } from '@/domain/models';
import { formatPhigrosSongRks, PHIGROS_MAX_SCORE } from '@/domain/phigros';
import { formatPushAcc } from '@/domain/phigros-push';
import { resolvePhigrosXingKind } from '@/domain/phigros-xing';
import { useAppTheme } from '@/theme/app-theme';
import { GameScoreCard, ScoreCardMetric, ScoreCardBadges } from '@/components/game-content/GameScoreCard';
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
  artworkSource,
  pressable = true,
}: {
  record: ScoreRecord;
  catalogTitle?: string;
  rank?: number;
  pushHint?: PhigrosPushHint;
  totalNotes?: number;
  artworkSource?: string | null;
  pressable?: boolean;
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
      artwork={{ source: artworkSource }}
      side={<ScoreCardMetric numericLabel label={pushHint ? formatPushAcc(pushHint.targetAcc) : accText}
        labelColor={theme.text} value={rksText} />}
      presentation={presentation}
      pressable={pressable}
    >
        <PhigrosScoreValue
          score={score}
          variant={isPhi ? 'phi' : isFc ? 'fc' : 'normal'}
          textColor={theme.text}
        />
        <ScoreCardBadges>
          <PhigrosDifficultyBadge levelIndex={record.levelIndex} constant={record.difficultyConstant} />
          <PhigrosRateBadge rate={rate} fc={record.fc === 'ap'} />
          {xingKind ? <PhigrosXingBadge kind={xingKind} /> : null}
        </ScoreCardBadges>
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

const styles = StyleSheet.create({
  pushLine: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
