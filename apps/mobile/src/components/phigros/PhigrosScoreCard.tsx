import { memo } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import { PhigrosScoreValue } from './PhigrosScoreValue';
import type { ScoreRecord } from '@/domain/models';
import { PHIGROS_MAX_SCORE, phigrosScoreToRate } from '@/domain/phigros';
import { useAppTheme } from '@/theme/app-theme';

export const PhigrosScoreCard = memo(function PhigrosScoreCard({
  record,
  catalogTitle,
  rank,
}: {
  record: ScoreRecord;
  catalogTitle?: string;
  rank?: number;
}) {
  const theme = useAppTheme();
  const score = record.dxScore ?? 0;
  const isPhi = score === PHIGROS_MAX_SCORE;
  const isFc = record.fc === 'ap' && !isPhi;
  const acc = record.achievements;
  const accText = acc % 1 === 0 ? `${acc.toFixed(0)}%` : `${acc.toFixed(2)}%`;
  const rksText = Number.isInteger(record.rating) ? record.rating.toFixed(1) : record.rating.toFixed(2);
  const rate = resolveRate(record);
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
          <RateBadge rate={rate} fc={record.fc === 'ap'} />
        </View>
      </View>
      <View style={styles.stats}>
        <Text style={[styles.acc, { color: theme.text }]}>{accText}</Text>
        <Text style={[styles.rks, { color: theme.accent }]}>{rksText}</Text>
      </View>
    </Pressable>
  );
});

type RateKind = 'f' | 'c' | 'b' | 'a' | 's' | 'v' | 'phi';

const RATE_COLORS: Record<RateKind | 'vFc', { bg: string; fg: string }> = {
  f: { bg: '#F3F4F6', fg: '#6B7280' },
  c: { bg: '#F3F4F6', fg: '#6B7280' },
  b: { bg: '#F3F4F6', fg: '#6B7280' },
  a: { bg: '#F3F4F6', fg: '#6B7280' },
  s: { bg: '#FDF2F8', fg: '#DB2777' },
  v: { bg: '#4B5563', fg: '#FFFFFF' },
  vFc: { bg: '#E0F2FE', fg: '#0EA5E9' },
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
  const colors = rate === 'v' && fc ? RATE_COLORS.vFc : RATE_COLORS[rate];
  const label = RATE_LABELS[rate];
  return (
    <View style={[styles.rateBadge, { backgroundColor: colors.bg }]}>
      <Text style={[
        styles.rateText,
        { color: colors.fg },
        rate === 'phi' && styles.rateTextPhi,
      ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  stats: { minWidth: 56, alignItems: 'flex-end', gap: 4 },
  acc: { fontSize: 12, fontWeight: '700' },
  rks: { fontSize: 20, fontWeight: '900' },
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
