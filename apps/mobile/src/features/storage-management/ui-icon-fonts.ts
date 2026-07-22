import * as Font from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';

/** 与 @expo/vector-icons Ionicons 组件一致的字体族名。 */
export const UI_ICON_FONT_FAMILY = 'ionicons';

/** 应用内 UI 图标依赖的矢量字体（Ionicons）。 */
export const UI_ICON_FONTS = Ionicons.font as Record<string, number>;

/**
 * 安全预加载 UI 图标字体。
 * Expo Go（尤其 iOS）上不要 purge/unload：删掉缓存后重存 ExponentAsset 常失败，
 * 会导致全站 Ionicons 空白，而 Android 往往能重下所以表现不一致。
 */
export async function ensureUiIconFontsLoaded(): Promise<void> {
  if (Font.isLoaded(UI_ICON_FONT_FAMILY)) return;
  await Font.loadAsync(UI_ICON_FONTS);
}

/** 清缓存后调用：仅补加载，失败不抛。 */
export async function reloadUiIconFonts(): Promise<void> {
  try {
    await ensureUiIconFontsLoaded();
  } catch {
    // 留给各 Ionicons 组件自行 loadAsync
  }
}
