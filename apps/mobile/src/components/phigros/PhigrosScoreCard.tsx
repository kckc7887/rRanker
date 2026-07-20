import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import type { ScoreRecord } from '@/domain/models';
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

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={styles.main}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {catalogTitle ?? record.title}
        </Text>
        <View style={styles.scoreRow}>
          <Text style={[styles.score, { color: scoreColor }]}>
            {(record.dxScore ?? 0).toLocaleString()}
          </Text>
          <View style={styles.tags}>
            <PhigrosDifficultyBadge levelIndex={record.levelIndex} constant={record.difficultyConstant} />
            <RateBadge rate={resolveRate(record)} />
          </View>
        </View>
      </View>
      <View style={styles.stats}>
        <Text style={[styles.acc, { color: theme.text }]}>{accText}</Text>
        <Text style={[styles.rks, { color: theme.accent }]}>{rksText}</Text>
      </View>
    </View>
  );
});

type RateKind = 'phi' | 'fc' | 'v' | 's';

const RATE_COLORS: Record<RateKind, { bg: string; fg: string }> = {
  phi: { bg: '#FFF7E6', fg: '#B8860B' },
  fc: { bg: '#E8F0FE', fg: '#3B82F6' },
  v: { bg: '#FFFFFF', fg: '#374151' },
  s: { bg: '#F3E8FF', fg: '#9333EA' },
};

const RATE_LABELS: Record<RateKind, string> = {
  phi: '\u03C6',
  fc: 'FC',
  v: 'V',
  s: 'S',
};

function resolveRate(record: ScoreRecord): RateKind {
  if (record.rate === 'phi') return 'phi';
  if (record.fc === 'ap') return 'fc';
  if (record.achievements >= 96) return 'v';
  return 's';
}

function RateBadge({ rate }: { rate: RateKind }) {
  const colors = RATE_COLORS[rate];
  const label = RATE_LABELS[rate];
  return (
    <View style={[styles.rateBadge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.rateText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  score: { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stats: { minWidth: 56, alignItems: 'flex-end', gap: 4 },
  acc: { fontSize: 12, fontWeight: '700' },
  rks: { fontSize: 20, fontWeight: '900' },
  rateBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  rateText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
});
