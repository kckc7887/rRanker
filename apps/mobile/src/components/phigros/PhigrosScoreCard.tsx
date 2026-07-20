import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import type { PhigrosScoreEntry } from '@/domain/phigros';
import { useAppTheme } from '@/theme/app-theme';

export const PhigrosScoreCard = memo(function PhigrosScoreCard({
  entry,
  catalogTitle,
}: {
  entry: PhigrosScoreEntry;
  catalogTitle?: string;
}) {
  const theme = useAppTheme();
  const scoreColor = entry.score === 1000000
    ? '#D69B24'
    : entry.fc
      ? '#3B82F6'
      : theme.text;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <View style={styles.main}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {catalogTitle ?? entry.songId}
        </Text>
        <View style={styles.scoreRow}>
          <Text style={[styles.score, { color: scoreColor }]}>
            {entry.score.toLocaleString()}
          </Text>
          <View style={styles.tags}>
            <PhigrosDifficultyBadge levelIndex={entry.level} constant={entry.difficulty} />
            <RateBadge rate={resolveRate(entry)} />
          </View>
        </View>
      </View>
      <View style={styles.stats}>
        <Text style={[styles.acc, { color: theme.text }]}>
          {entry.acc % 1 === 0 ? entry.acc.toFixed(0) : entry.acc.toFixed(2)}%
        </Text>
        <Text style={[styles.rks, { color: theme.accent }]}>
          {Number.isInteger(entry.rks) ? entry.rks.toFixed(1) : entry.rks.toFixed(2)}
        </Text>
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

function resolveRate(entry: PhigrosScoreEntry): RateKind {
  if (entry.score === 1000000) return 'phi';
  if (entry.fc) return 'fc';
  if (entry.acc >= 96) return 'v';
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
