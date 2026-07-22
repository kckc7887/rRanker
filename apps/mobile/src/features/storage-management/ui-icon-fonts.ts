import { Ionicons } from '@expo/vector-icons';
import * as Font from 'expo-font';

/** 应用内 UI 图标依赖的矢量字体（当前为 Ionicons）。 */
export const UI_ICON_FONTS = Ionicons.font;

/** 预加载 / 清理缓存后重新注册 UI 图标字体。 */
export async function reloadUiIconFonts(): Promise<void> {
  try {
    await Font.loadAsync(UI_ICON_FONTS);
  } catch {
    // 字体加载失败时由各 Ionicons 组件自行重试；此处不抛以免阻断清缓存流程。
  }
}
