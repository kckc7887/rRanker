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
