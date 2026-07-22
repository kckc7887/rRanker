import { Asset } from 'expo-asset';
import { File, Directory, Paths } from 'expo-file-system';
import * as Font from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';

/** 与 @expo/vector-icons Ionicons 组件一致的字体族名。 */
export const UI_ICON_FONT_FAMILY = 'ionicons';

/** 应用内 UI 图标依赖的矢量字体（Ionicons）。 */
export const UI_ICON_FONTS = Ionicons.font as Record<string, number>;

function cacheRoot(): Directory {
  return new Directory(Paths.cache);
}

/** 删除 Paths.cache 中的 ExponentAsset 字体文件（损坏/空洞文件会导致图标永久空白）。 */
export function purgeCachedIconFontFiles(): void {
  try {
    const root = cacheRoot();
    if (!root.exists) return;
    for (const item of root.list()) {
      if (!(item instanceof File)) continue;
      if (!/^ExponentAsset-.*\.(ttf|otf)$/i.test(item.name)) continue;
      try {
        item.delete();
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

function resetIconFontAssets(): Asset[] {
  return Object.values(UI_ICON_FONTS).map((moduleId) => {
    const asset = Asset.fromModule(moduleId);
    asset.downloaded = false;
    asset.localUri = null;
    return asset;
  });
}

function buildFontMap(assets: Asset[]): Record<string, Asset> {
  const fontMap: Record<string, Asset> = {};
  Object.keys(UI_ICON_FONTS).forEach((family, index) => {
    const asset = assets[index];
    if (asset) fontMap[family] = asset;
  });
  return fontMap;
}

/**
 * 强制修复并加载 UI 图标字体。
 * 会清掉可能损坏的 ExponentAsset 字体缓存，重置 Asset 下载状态后再 loadAsync。
 * 若字体已被标记为 loaded 但实际空白，必须先 unload 才能重新注册。
 */
export async function ensureUiIconFontsLoaded(): Promise<void> {
  purgeCachedIconFontFiles();
  const fontMap = buildFontMap(resetIconFontAssets());

  if (Font.isLoaded(UI_ICON_FONT_FAMILY)) {
    try {
      await Font.unloadAsync(UI_ICON_FONT_FAMILY);
    } catch {
      // 部分运行时不支持 unload；继续尝试覆盖加载。
    }
  }

  await Font.loadAsync(fontMap);
}

/** 清缓存后调用：失败不抛，避免阻断清理流程。 */
export async function reloadUiIconFonts(): Promise<void> {
  try {
    await ensureUiIconFontsLoaded();
  } catch {
    // 留给启动路径或图标组件自行重试
  }
}
