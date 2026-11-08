import { StyleSheet } from 'react-native';

export const providerLoginSheetStyles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 14 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, gap: 10 },
  body: { color: '#4B5563', lineHeight: 21 },
  message: { color: '#4B5563', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, color: '#111827' },
  primary: { backgroundColor: '#246BFD', borderRadius: 10, padding: 13, alignItems: 'center' },
  primaryPressed: { opacity: 0.9 },
  primaryText: { color: '#FFF', fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: '#246BFD', borderRadius: 10, padding: 13, alignItems: 'center' },
  secondaryPressed: { backgroundColor: '#F0F5FF' },
  secondaryText: { color: '#246BFD', fontWeight: '700' },
  or: { color: '#9CA3AF', textAlign: 'center' },
  hint: { color: '#6B7280', fontSize: 12, lineHeight: 16 },
  phiQrWrap: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
  },
  phiStatus: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  reuseSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4, paddingTop: 14, gap: 10 },
  reuseList: { gap: 8 },
  reuseAccount: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  reuseName: { fontSize: 15, fontWeight: '700' },
});
