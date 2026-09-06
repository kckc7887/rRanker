import { StyleSheet } from 'react-native';

// 来自舞萌页面的既有列表、搜索和曲库行样式，双方统一消费。
export const SIMAI_BEST_LIST_STYLES = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  header: { gap: 9, marginBottom: 2 },
  sectionHeader: { marginTop: 10, marginBottom: 2, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  sectionCount: { color: '#8A93A3', fontSize: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  statusText: { fontSize: 16, fontWeight: '600' },
  statusHint: { fontSize: 13, textAlign: 'center' },
});

export const SIMAI_RECORDS_LIST_STYLES = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  note: { color: '#6B7280', marginBottom: 6 },
  header: { gap: 9 },
  searchArea: { padding: 12, paddingBottom: 8 },
  searchBox: { borderWidth: 1, borderRadius: 10, padding: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  statusText: { fontSize: 16, fontWeight: '600' },
  statusHint: { fontSize: 13 },
});

export const SIMAI_CATALOG_LIST_STYLES = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  searchArea: { padding: 12, paddingBottom: 8, gap: 6, backgroundColor: '#FFF' },
  searchBox: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 11, backgroundColor: '#FFF', color: '#111827' },
  resultCount: { color: '#6B7280', fontSize: 11 },
  listContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 20, gap: 9 },
  row: { backgroundColor: '#FFF', borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  openSong: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  favorite: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 3 },
  title: { color: '#111827', fontWeight: '700' },
  meta: { color: '#6B7280', fontSize: 11 },
  chartGroups: { gap: 4 },
  chartGroup: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
});
