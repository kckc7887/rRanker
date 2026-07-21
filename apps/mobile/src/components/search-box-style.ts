import { Platform, type TextStyle } from 'react-native';

/**
 * 搜索框占位/输入文字光学居中。
 * iOS 不支持 textAlignVertical，需用不对称 padding 上移；安卓同时关掉字体内边距。
 */
export const SEARCH_BOX_STYLE = {
  borderWidth: 1,
  borderRadius: 10,
  paddingHorizontal: 11,
  paddingTop: Platform.OS === 'ios' ? 6 : 7,
  paddingBottom: Platform.OS === 'ios' ? 14 : 13,
  ...(Platform.OS === 'android'
    ? { textAlignVertical: 'center' as const, includeFontPadding: false }
    : {}),
} satisfies TextStyle;
