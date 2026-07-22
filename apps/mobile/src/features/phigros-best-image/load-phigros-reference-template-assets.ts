import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { Image } from 'react-native';

export type PhigrosReferenceTemplateAssets = {
  css: string;
  dataIconUrl: string;
  fallbackBackgroundUrl: string;
  challengeIconUrls: readonly string[];
  ratingIconUrls: Readonly<Record<string, string>>;
  allowingReadAccessToUrl: string;
};

const CSS_SOURCES = {
  // Metro exposes copied reference stylesheets as bundled asset module IDs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  b19: require('../../../assets/phigros-b30-reference/b19/b19.css') as number,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  common: require('../../../assets/phigros-b30-reference/common/common.css') as number,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  snow: require('../../../assets/phigros-b30-reference/common/theme/snow/snow.css') as number,
};

const FONT_SOURCES: Readonly<Record<string, number>> = {
  '吞弥恰俊.ttf': require('../../../assets/phigros-b30-reference/common/font/吞弥恰俊.ttf') as number,
  'phi.ttf': require('../../../assets/phigros-b30-reference/common/font/phi.ttf') as number,
  'HIMALAYA.TTF': require('../../../assets/phigros-b30-reference/common/font/HIMALAYA.ttf') as number,
  'NotoSans-Regular.ttf': require('../../../assets/phigros-b30-reference/common/font/NotoSans-Regular.ttf') as number,
  'NotoSansSymbols2.ttf': require('../../../assets/phigros-b30-reference/common/font/NotoSansSymbols2.ttf') as number,
  'NotoSansArabic.ttf': require('../../../assets/phigros-b30-reference/common/font/NotoSansArabic.ttf') as number,
  'NotoSansJP.ttf': require('../../../assets/phigros-b30-reference/common/font/NotoSansJP.ttf') as number,
  'Aldrich-Regular.ttf': require('../../../assets/phigros-b30-reference/common/font/Aldrich-Regular.ttf') as number,
  'NotoSansKannada.ttf': require('../../../assets/phigros-b30-reference/common/font/NotoSansKannada.ttf') as number,
  'NotoSansCanadianAboriginal.ttf': require('../../../assets/phigros-b30-reference/common/font/NotoSansCanadianAboriginal.ttf') as number,
  'NotoColorEmoji-Regular.ttf': require('../../../assets/phigros-b30-reference/common/font/NotoColorEmoji-Regular.ttf') as number,
  'NotoSansMath-Regular.ttf': require('../../../assets/phigros-b30-reference/common/font/NotoSansMath-Regular.ttf') as number,
};

const CHALLENGE_SOURCES = [
  require('../../../assets/phigros-b30-reference/otherimg/0.png') as number,
  require('../../../assets/phigros-b30-reference/otherimg/1.png') as number,
  require('../../../assets/phigros-b30-reference/otherimg/2.png') as number,
  require('../../../assets/phigros-b30-reference/otherimg/3.png') as number,
  require('../../../assets/phigros-b30-reference/otherimg/4.png') as number,
  require('../../../assets/phigros-b30-reference/otherimg/5.png') as number,
] as const;

const RATING_SOURCES: Readonly<Record<string, number>> = {
  A: require('../../../assets/phigros-b30-reference/otherimg/A.png') as number,
  B: require('../../../assets/phigros-b30-reference/otherimg/B.png') as number,
  C: require('../../../assets/phigros-b30-reference/otherimg/C.png') as number,
  F: require('../../../assets/phigros-b30-reference/otherimg/F.png') as number,
  FC: require('../../../assets/phigros-b30-reference/otherimg/FC.png') as number,
  S: require('../../../assets/phigros-b30-reference/otherimg/S.png') as number,
  V: require('../../../assets/phigros-b30-reference/otherimg/V.png') as number,
  phi: require('../../../assets/phigros-b30-reference/otherimg/phi.png') as number,
};

const DATA_ICON_SOURCE = require('../../../assets/phigros-b30-reference/otherimg/data.png') as number;
const BACKGROUND_SOURCE = require('../../../assets/phigros-b30-reference/otherimg/phigros.png') as number;
const assetUriCache = new Map<number, Promise<string>>();
let templatePromise: Promise<PhigrosReferenceTemplateAssets> | null = null;

async function loadAssetUri(moduleId: number): Promise<string> {
  const cached = assetUriCache.get(moduleId);
  if (cached) return cached;
  const pending = (async () => {
    const [asset] = await Asset.loadAsync(moduleId);
    if (asset?.localUri) return asset.localUri;
    if (asset?.uri?.startsWith('http')) return asset.uri;
    const resourceUri = Image.resolveAssetSource(moduleId)?.uri;
    if (resourceUri) {
      const [cachedAsset] = await Asset.loadAsync(resourceUri);
      const uri = cachedAsset?.localUri ?? cachedAsset?.uri;
      if (uri) return uri;
    }
    if (asset?.uri) return asset.uri;
    throw new Error('Phigros 参考模板素材没有可读取的 URI');
  })();
  assetUriCache.set(moduleId, pending);
  try {
    return await pending;
  } catch (error) {
    assetUriCache.delete(moduleId);
    throw error;
  }
}

async function loadAssetText(moduleId: number): Promise<string> {
  return new File(await loadAssetUri(moduleId)).text();
}

function withoutImport(css: string, importPath: string): string {
  return css.replace(`@import "${importPath}";`, '');
}

export async function loadPhigrosReferenceTemplateAssets(): Promise<PhigrosReferenceTemplateAssets> {
  if (templatePromise) return templatePromise;
  templatePromise = (async () => {
    const [b19Css, commonCssSource, snowCss, fontEntries, challengeIconUrls, ratingEntries, dataIconUrl, fallbackBackgroundUrl] = await Promise.all([
      loadAssetText(CSS_SOURCES.b19),
      loadAssetText(CSS_SOURCES.common),
      loadAssetText(CSS_SOURCES.snow),
      Promise.all(Object.entries(FONT_SOURCES).map(async ([name, source]) => [name, await loadAssetUri(source)] as const)),
      Promise.all(CHALLENGE_SOURCES.map(loadAssetUri)),
      Promise.all(Object.entries(RATING_SOURCES).map(async ([name, source]) => [name, await loadAssetUri(source)] as const)),
      loadAssetUri(DATA_ICON_SOURCE),
      loadAssetUri(BACKGROUND_SOURCE),
    ]);

    let commonCss = withoutImport(commonCssSource, './theme/snow/snow.css');
    for (const [name, uri] of fontEntries) {
      commonCss = commonCss.replace(`./font/${name}`, uri);
    }
    commonCss = commonCss.replace('../otherimg/phigros.png', fallbackBackgroundUrl);

    return {
      css: `${snowCss}\n${commonCss}\n${withoutImport(b19Css, '../common/common.css')}`,
      dataIconUrl,
      fallbackBackgroundUrl,
      challengeIconUrls,
      ratingIconUrls: Object.fromEntries(ratingEntries),
      allowingReadAccessToUrl: Paths.cache.uri,
    };
  })();
  try {
    return await templatePromise;
  } catch (error) {
    templatePromise = null;
    throw error;
  }
}
