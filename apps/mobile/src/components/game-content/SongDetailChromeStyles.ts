import { StyleSheet } from 'react-native';

/**
 * 详情页悬浮按钮三件套（返回/收藏共用），
 * 按压态、激活色、禁用态等真实视觉差异仍由各调用方的样式插槽表达。
 * 独立成文件而非挂在 SongDetailChrome 组件模块上，避免调用方测试
 * mock 组件模块时连带丢失样式导出。
 */
export const SONG_DETAIL_CHROME_STYLES = StyleSheet.create({
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerFloatingButton: { position: 'absolute', zIndex: 30, elevation: 30 },
  headerFavoriteActive: {},
});

export const SONG_DETAIL_METADATA_STYLES = StyleSheet.create({
  metadataTable: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  metadataCellRoot: { minWidth: 0 },
  metadataCell: { minWidth: 0, alignItems: 'center', paddingHorizontal: 4, gap: 3 },
  metadataLabel: { fontSize: 10, fontWeight: '800' },
  metadataValueBlock: { position: 'relative', minWidth: 0, alignSelf: 'stretch' },
  metadataValueMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 },
  metadataValue: { fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
});

export const VERTICAL_SONG_DETAIL_STYLES = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingBottom: 48 },
  deferredPlaceholder: { minHeight: 180 },
  hero: { position: 'relative', backgroundColor: '#D9DEE7', overflow: 'hidden' },
  heroPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  heroPlaceholderNote: { color: '#6B7280', fontSize: 64 },
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%' },
  heroCopy: { position: 'absolute', left: 18, right: 18, bottom: 20, gap: 2 },
  singleLine: { flexGrow: 0 },
  singleLineContent: { paddingRight: 18 },
  songId: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  title: {
    color: '#FFFFFF', fontSize: 30, lineHeight: 37, fontWeight: '900', letterSpacing: -0.6,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8,
  },
  artist: { color: 'rgba(255,255,255,0.9)', fontSize: 16, lineHeight: 23, fontWeight: '600' },
  metadataTable: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 13, gap: 6,
  },
  metadataCell: { minWidth: 0, paddingHorizontal: 6, gap: 5 },
  metadataLabel: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
  metadataValueBlock: { position: 'relative', minWidth: 0 },
  metadataValueMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 },
  metadataValue: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  carouselRoot: { flexGrow: 0 },
  carouselScroll: { flexGrow: 0 },
  carousel: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12, gap: 12 },
  noCharts: { padding: 20 },
  chartCard: {
    borderRadius: 24, borderWidth: 1, padding: 18,
    shadowColor: '#1A2232', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  diffPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diffPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
    includeFontPadding: false,
  },
  levelBlock: { alignItems: 'flex-end' },
  level: { fontSize: 28, lineHeight: 31, fontWeight: '900' },
  constant: { fontSize: 11, fontWeight: '600' },
  resultBlock: { marginTop: 22, alignItems: 'flex-start', gap: 6 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  resultLabel: { fontSize: 12, fontWeight: '700' },
  scoreValue: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  statRow: { flexDirection: 'row', marginTop: 16, gap: 24 },
  statCell: { gap: 2 },
  statValue: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  chartDivider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  chartMeta: { fontSize: 12, lineHeight: 18 },
  notesTable: {
    marginTop: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(76,88,106,0.28)',
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  notesRow: { minHeight: 26, flexDirection: 'row', alignItems: 'center' },
  notesHeaderRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(76,88,106,0.22)',
  },
  notesCell: { flex: 1, minWidth: 0, textAlign: 'center' },
  notesHeader: { fontSize: 8, fontWeight: '800' },
  notesValue: { fontSize: 10, fontWeight: '800' },
  action: {
    marginTop: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: 11,
    padding: 10,
    alignItems: 'center',
  },
  chartSearchAction: { marginTop: 0 },
  actionText: { fontWeight: '700' },
  details: { paddingHorizontal: 16, gap: 12, marginTop: 4 },
  songInformation: { gap: 12 },
  informationTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  informationValue: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19 },
  aliasBlock: { position: 'relative', alignItems: 'stretch' },
  aliasMeasure: { position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 },
  aliasAction: { alignSelf: 'flex-end', paddingHorizontal: 2, paddingVertical: 3 },
  aliasActionText: { fontSize: 12, fontWeight: '700' },
  meta: { color: '#6B7280', fontSize: 12 },
});
