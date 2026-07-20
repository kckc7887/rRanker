import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import type { ScoreRecord } from '@/domain/models';
import { phigrosScoreToRate } from '@/domain/phigros';
import { useAppTheme } from '@/theme/app-theme';

export const PhigrosScoreCard = memo(function PhigrosScoreCard({
  record,
  catalogTitle,
}: {
  record: ScoreRecord;
  catalogTitle?: string;
}) {
  const theme = useAppTheme();
  const isPhi = record.rate === 'phi';
  const isFc = record.fc === 'ap';
  const scoreColor = isPhi ? '#D69B24' : isFc ? '#3B82F6' : theme.text;
  const acc = record.achievements;
  const accText = acc % 1 === 0 ? `${acc.toFixed(0)}%` : `${acc.toFixed(2)}%`;
  const rksText = Number.isInteger(record.rating) ? record.rating.toFixed(1) : record.rating.toFixed(2);
  const rate = resolveRate(record);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={styles.main}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {catalogTitle ?? record.title}
        </Text>
        <Text style={[styles.score, { color: scoreColor }]}>
          {(record.dxScore ?? 0).toLocaleString()}
        </Text>
        <View style={styles.tags}>
          <PhigrosDifficultyBadge levelIndex={record.levelIndex} constant={record.difficultyConstant} />
          <RateBadge rate={rate} fc={isFc} />
        </View>
      </View>
      <View style={styles.stats}>
        <Text style={[styles.acc, { color: theme.text }]}>{accText}</Text>
        <Text style={[styles.rks, { color: theme.accent }]}>{rksText}</Text>
      </View>
    </View>
  );
});

type RateKind = 'f' | 'c' | 'b' | 'a' | 's' | 'v' | 'phi';

const RATE_COLORS: Record<RateKind, { bg: string; fg: string }> = {
  f: { bg: '#F3F4F6', fg: '#6B7280' },
  c: { bg: '#F3F4F6', fg: '#6B7280' },
  b: { bg: '#F3F4F6', fg: '#6B7280' },
  a: { bg: '#F3F4F6', fg: '#6B7280' },
  s: { bg: '#FDF2F8', fg: '#DB2777' },
  v: { bg: '#FFFFFF', fg: '#374151' },
  phi: { bg: '#FFF7E6', fg: '#B8860B' },
};

const RATE_LABELS: Record<RateKind, string> = {
  f: 'F',
  c: 'C',
  b: 'B',
  a: 'A',
  s: 'S',
  v: 'V',
  phi: '\u03C6',
};

function resolveRate(record: ScoreRecord): RateKind {
  const rate = phigrosScoreToRate(record.dxScore ?? 0, record.fc === 'ap') as RateKind;
  if (rate in RATE_LABELS) return rate;
  return 'f';
}

function RateBadge({ rate, fc }: { rate: RateKind; fc: boolean }) {
  const colors = rate === 'v' && fc
    ? { bg: '#E8F0FE', fg: '#3B82F6' }
    : RATE_COLORS[rate];
  const label = RATE_LABELS[rate];
  return (
    <View style={[
      styles.rateBadge,
      { backgroundColor: colors.bg },
      rate === 'v' && !fc && styles.rateBadgeOutline,
    ]}>
      <Text style={[styles.rateText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  score: { fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  stats: { minWidth: 56, alignItems: 'flex-end', gap: 4 },
  acc: { fontSize: 12, fontWeight: '700' },
  rks: { fontSize: 20, fontWeight: '900' },
  rateBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  rateBadgeOutline: { borderWidth: 1, borderColor: '#E5E7EB' },
  rateText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
});
