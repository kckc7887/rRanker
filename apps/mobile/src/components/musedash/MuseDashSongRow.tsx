import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { GameSongRow } from '@/components/game-content/GameSongRow';
import type { MuseDashSong } from '@/domain/muse-dash';
import { presentMuseDashSong } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export function MuseDashSongRow({
  song, albumTitle, constants,
}: {
  song: MuseDashSong;
  albumTitle: string;
  constants?: readonly (number | undefined)[];
}) {
  const theme = useAppTheme();
  const p = presentMuseDashSong({ song, albumTitle }, constants);
  return <GameSongRow presentation={p} wholeRowPressable rowStyle={[styles.row, { borderColor: theme.border }]}
    mainStyle={styles.main} titleStyle={styles.title} subtitleStyle={styles.subtitle} pressedStyle={styles.pressed}
    cover={<View style={[styles.cover, { backgroundColor: theme.accent }]}>
      <Ionicons name="musical-notes" size={20} color="#FFFFFF" />
    </View>}
    badges={<View style={styles.badges}>{p.chartBadges.map((badge) => (
      <View key={badge.key} style={[styles.badge, { borderColor: theme.border }]}>
        <Text style={[styles.badgeText, { color: theme.text }]}>{badge.label}</Text>
        <Text style={[styles.badgeValue, { color: theme.textMuted }]}>{badge.value}</Text>
      </View>
    ))}</View>} />;
}

const styles = StyleSheet.create({
  row: { minHeight: 88, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, gap: 5 }, title: { fontSize: 16, fontWeight: '800' }, subtitle: { fontSize: 12 }, pressed: { opacity: 0.82 },
  cover: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  badge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' }, badgeValue: { fontSize: 10, fontVariant: ['tabular-nums'] },
});
