import { Platform } from 'react-native';

/**
 * 标签页列表只保留当前视口及前后各一小段内容，避免切换次数增加常驻卡片数量。
 */
export const TAB_LIST_CACHE_PROPS = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 4,
  updateCellsBatchingPeriod: 50,
  windowSize: 3,
  // iOS 上裁剪只会脱离原生视图树，并不会释放组件，且可能造成内容缺失。
  removeClippedSubviews: Platform.OS === 'android',
} as const;
