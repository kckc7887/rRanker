import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Image } from 'react-native';

export type PhigrosReferenceTemplateAssets = {
  css: string;
  dataIconUrl: string;
  fallbackBackgroundUrl: string;
  fallbackAvatarUrl: string;
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
const assetDataUriCache = new Map<string, Promise<string>>();
let templatePromise: Promise<PhigrosReferenceTemplateAssets> | null = null;

export async function loadPhigrosReferenceAssetUri(moduleId: number): Promise<string> {
  const cached = assetUriCache.get(moduleId);
  if (cached) return cached;
  const pending = (async () => {
    let initialError: unknown;
    try {
      const [asset] = await Asset.loadAsync(moduleId);
      const uri = asset?.localUri ?? asset?.uri;
      if (uri?.startsWith('file://')) return uri;
    } catch (error) {
      initialError = error;
    }
    const resourceUri = Image.resolveAssetSource(moduleId)?.uri;
    if (resourceUri) {
      const [cachedAsset] = await Asset.loadAsync(resourceUri);
      const uri = cachedAsset?.localUri ?? cachedAsset?.uri;
      if (uri?.startsWith('file://')) return uri;
    }
    if (initialError instanceof Error) throw initialError;
    throw new Error('Phigros 参考模板素材没有可读取的本地文件');
  })();
  assetUriCache.set(moduleId, pending);
  try {
    return await pending;
  } catch (error) {
    assetUriCache.delete(moduleId);
    throw error;
  }
}

async function loadPhigrosReferenceAssetDataUri(moduleId: number, mimeType: string): Promise<string> {
  const cacheKey = `${moduleId}:${mimeType}`;
  const cached = assetDataUriCache.get(cacheKey);
  if (cached) return cached;
  const pending = new File(await loadPhigrosReferenceAssetUri(moduleId)).base64()
    .then((base64) => `data:${mimeType};base64,${base64}`);
  assetDataUriCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    assetDataUriCache.delete(cacheKey);
    throw error;
  }
}

async function loadAssetText(moduleId: number): Promise<string> {
  return new File(await loadPhigrosReferenceAssetUri(moduleId)).text();
}

function withoutImport(css: string, importPath: string): string {
  return css.replace(`@import "${importPath}";`, '');
}

export async function loadPhigrosReferenceTemplateAssets(
  allowingReadAccessToUrl: string,
  fallbackAvatarUrl: string,
): Promise<PhigrosReferenceTemplateAssets> {
  const base = await (templatePromise ??= (async () => {
    const [b19Css, commonCssSource, snowCss, challengeIconUrls, ratingEntries, dataIconUrl, fallbackBackgroundUrl] = await Promise.all([
      loadAssetText(CSS_SOURCES.b19),
      loadAssetText(CSS_SOURCES.common),
      loadAssetText(CSS_SOURCES.snow),
      Promise.all(CHALLENGE_SOURCES.map((source) => loadPhigrosReferenceAssetDataUri(source, 'image/png'))),
      Promise.all(Object.entries(RATING_SOURCES).map(async ([name, source]) => [name, await loadPhigrosReferenceAssetDataUri(source, 'image/png')] as const)),
      loadPhigrosReferenceAssetDataUri(DATA_ICON_SOURCE, 'image/png'),
      loadPhigrosReferenceAssetDataUri(BACKGROUND_SOURCE, 'image/png'),
    ]);

    let commonCss = withoutImport(commonCssSource, './theme/snow/snow.css');
    commonCss = commonCss.replace('../otherimg/phigros.png', fallbackBackgroundUrl);

    return {
      css: `${snowCss}\n${commonCss}\n${withoutImport(b19Css, '../common/common.css')}`,
      dataIconUrl,
      fallbackBackgroundUrl,
      fallbackAvatarUrl,
      challengeIconUrls,
      ratingIconUrls: Object.fromEntries(ratingEntries),
      allowingReadAccessToUrl,
    };
  })().catch((error) => {
    templatePromise = null;
    throw error;
  }));
  return { ...base, fallbackAvatarUrl };
}
