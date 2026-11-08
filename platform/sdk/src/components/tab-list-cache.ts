import { Platform } from 'react-native';

export const TAB_LIST_CACHE_PROPS = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 4,
  updateCellsBatchingPeriod: 50,
  windowSize: 3,
  /** iOS 裁剪不释放组件，还可能造成内容缺失。 */
  removeClippedSubviews: Platform.OS === 'android',
} as const;
