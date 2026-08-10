import { StyleSheet, Text, View } from 'react-native';
import type { DxRatingTheme } from '@/domain/dx-rating-theme';
import type { MuseDashPlayer } from '@/domain/muse-dash';
import { useAppTheme } from '@/theme/app-theme';

export const MUSE_DASH_RATING_THEME: DxRatingTheme = {
  id: 'musedash', label: '喵斯',
  fillColors: ['#FF5A8A', '#C084FC', '#7C6CF5'], fillLocations: [0, 0.5, 1],
  borderColors: ['#E0447A', '#9C62E0', '#5F52D8'], borderLocations: [0, 0.5, 1],
  overlayColor: 'rgba(30, 18, 44, 0.18)', textColor: '#FFFFFF', starColor: '#FFFFFF', starCount: 0,
};

export function formatMuseDashOverviewRatingMeta(player: MuseDashPlayer): string {
  return `谱面 ${player.plays.length} 首 · 更新于 ${formatMuseDashUpdateTime(player.lastUpdate)}`;
}

export function formatMuseDashUpdateTime(lastUpdate: number | undefined): string {
  if (!lastUpdate || !Number.isFinite(lastUpdate)) return '—';
  const date = new Date(lastUpdate);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function MuseDashOverviewDetails({ player }: { player: MuseDashPlayer }) {
  const theme = useAppTheme();
  const metrics = [
    ['Rating', player.rl == null ? '—' : player.rl.toFixed(2)],
    ['成绩谱面', String(player.plays.length)],
    ['定数历史', player.diffHistoryNumber == null ? '—' : String(player.diffHistoryNumber)],
    ['上次更新', formatMuseDashUpdateTime(player.lastUpdate)],
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
