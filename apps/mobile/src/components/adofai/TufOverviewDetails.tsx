import { StyleSheet, Text, View } from 'react-native';
import type { DxRatingTheme } from '@/domain/dx-rating-theme';
import type { TufPlayer } from '@/domain/tuf';
import { formatTufAccuracy } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export const TUF_RATING_THEME: DxRatingTheme = {
  id: 'tuf', label: 'TUF',
  fillColors: ['#45C9F4', '#6977B8', '#F15B55'], fillLocations: [0, 0.5, 1],
  borderColors: ['#209FCB', '#8A5A91', '#C53E3B'], borderLocations: [0, 0.5, 1],
  overlayColor: 'rgba(10, 22, 38, 0.18)', textColor: '#FFFFFF', starColor: '#FFFFFF', starCount: 0,
};

export function formatTufOverviewRatingMeta(player: TufPlayer): string {
  const rank = player.globalRank ?? player.rank;
  return `世界排名 ${rank ? `#${rank}` : '—'} · ${player.totalPasses} 条公开成绩`;
}

export function formatTufRankBadge(player: TufPlayer): string {
  const rank = player.globalRank ?? player.rank;
  return rank ? `#${rank}` : '—';
}

export function TufOverviewDetails({ player }: { player: TufPlayer }) {
  const theme = useAppTheme();
  const metrics = [
    ['General Score', player.generalScore.toFixed(2)],
    ['PP Score', player.ppScore.toFixed(2)],
    ['平均 XACC', player.averageXacc == null ? '—' : formatTufAccuracy(player.averageXacc)],
    ['Universal Pass', String(player.universalPassCount)],
    ['最高难度', player.topDiff == null ? '—' : typeof player.topDiff === 'object' ? player.topDiff.name : String(player.topDiff)],
    ['世界首杀', String(player.worldFirstCount)],
  ];
  return <View style={[styles.card, { backgroundColor: theme.surface }]}>
    <Text style={[styles.title, { color: theme.text }]}>公开资料</Text>
    <View style={styles.grid}>{metrics.map(([label, value]) => <View key={label} style={styles.cell}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
    </View>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 18, gap: 14 },
  title: { fontSize: 18, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 },
  cell: { width: '50%', gap: 4, paddingRight: 10 },
  label: { fontSize: 11 },
  value: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
