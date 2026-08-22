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
