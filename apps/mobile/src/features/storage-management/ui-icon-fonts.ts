import * as Font from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';

/** 字体族名与 Ionicons 一致。 */
export const UI_ICON_FONT_FAMILY = 'ionicons';

export const UI_ICON_FONTS = Ionicons.font as Record<string, number>;

/** Expo Go iOS 重存 ExponentAsset 可能失败，不卸载已加载的图标字体。 */
export async function ensureUiIconFontsLoaded(): Promise<void> {
  if (Font.isLoaded(UI_ICON_FONT_FAMILY)) return;
  await Font.loadAsync(UI_ICON_FONTS);
}

export async function reloadUiIconFonts(): Promise<void> {
  try {
    await ensureUiIconFontsLoaded();
  } catch {
    /** Ionicons 组件仍会自行加载字体。 */
  }
}
