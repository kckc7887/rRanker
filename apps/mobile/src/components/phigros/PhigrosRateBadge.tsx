import { StyleSheet, Text, View } from 'react-native';
import { phigrosScoreToRate } from '@/domain/phigros';
import {
  PHIGROS_RATE_COLORS,
  PHIGROS_RATE_LABELS,
  type PhigrosRateKind,
} from '@/domain/phigros-rate-theme';
import type { ScoreRecord } from '@/domain/models';

export type { PhigrosRateKind };

export { PHIGROS_RATE_COLORS, PHIGROS_RATE_LABELS };

export function resolvePhigrosRate(record: Pick<ScoreRecord, 'dxScore' | 'fc'>): PhigrosRateKind {
  const rate = phigrosScoreToRate(record.dxScore ?? 0, record.fc === 'ap') as PhigrosRateKind;
  if (rate in PHIGROS_RATE_LABELS) return rate;
  return 'f';
}

export function PhigrosRateBadge({
  rate,
  fc = false,
}: {
  rate: PhigrosRateKind;
  /** V + FC 时使用浅蓝配色，文案仍为 V */
  fc?: boolean;
}) {
  const colors = rate === 'v' && fc ? PHIGROS_RATE_COLORS.vFc : PHIGROS_RATE_COLORS[rate];
  const text = PHIGROS_RATE_LABELS[rate];
  return (
    <View style={[styles.rateBadge, { backgroundColor: colors.bg }]}>
      <Text style={[
        styles.rateText,
        { color: colors.fg },
        rate === 'phi' && styles.rateTextPhi,
      ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rateBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minHeight: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
    includeFontPadding: false,
    textAlign: 'center',
  },
  rateTextPhi: { transform: [{ translateY: -1.5 }] },
});
