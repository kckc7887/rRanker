import { StyleSheet, Text, View } from 'react-native';
import { GameSongRow } from '@/components/game-content/GameSongRow';
import type { TufLevel } from '@/domain/tuf';
import { presentTufLevel } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export function TufSongRow({ level }: { level: TufLevel }) {
  const theme = useAppTheme();
  const p = presentTufLevel(level);
  const badge = p.chartBadges[0];
  return <GameSongRow presentation={p} wholeRowPressable rowStyle={[styles.row, { borderColor: theme.border }]}
    mainStyle={styles.main} titleStyle={styles.title} subtitleStyle={styles.subtitle} pressedStyle={styles.pressed}
    cover={<View style={styles.orbit}><View style={styles.ice} /><View style={styles.fire} /></View>}
    badges={<View style={[styles.badge, { borderColor: theme.border }]}>
      <Text style={[styles.badgeText, { color: theme.accent }]}>{badge?.label ?? 'Unranked'}{badge?.value ? ` · ${badge.value}` : ''}</Text>
    </View>} />;
}

const styles = StyleSheet.create({
  row: { minHeight: 88, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, gap: 5 }, title: { fontSize: 16, fontWeight: '800' }, subtitle: { fontSize: 12 }, pressed: { opacity: 0.82 },
  orbit: { width: 44, height: 44, position: 'relative' },
  ice: { position: 'absolute', left: 1, top: 7, width: 26, height: 26, borderRadius: 13, backgroundColor: '#44C7F4' },
  fire: { position: 'absolute', right: 1, bottom: 7, width: 26, height: 26, borderRadius: 13, backgroundColor: '#F15B55', borderWidth: 2, borderColor: '#FFFFFF' },
  badge: { alignSelf: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' },
});
