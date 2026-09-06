import { StyleSheet } from 'react-native';
export const simaiScoreCardStyles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 3 }, title: { color: '#111827', fontSize: 15, fontWeight: '700' },
  dxScore: { fontSize: 11, fontWeight: '700' },
  tags: { minHeight: 25, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  ratingBlock: { minWidth: 52, alignItems: 'flex-end', gap: 2 }, ratingLabel: { color: '#8A93A3', fontSize: 10, fontWeight: '700' },
  rating: { color: '#246BFD', fontSize: 19, fontWeight: '900' },
});
