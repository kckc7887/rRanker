import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { Image } from 'react-native';
import { normalizePhigrosAvatarKey } from '@/domain/phigros-avatar-resolver';
import {
  PHIGROS_REFERENCE_AVATAR_KEYS,
  PHIGROS_REFERENCE_AVATAR_SOURCES,
} from './phigros-reference-avatar-assets.generated';

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

const avatarKeyByLowercase = new Map(PHIGROS_REFERENCE_AVATAR_KEYS.map((key) => [key.toLocaleLowerCase(), key]));
const avatarAliases: Readonly<Record<string, string>> = {
  'Cipher : /2&//<|0': 'Cipher1',
  'Oblivion: PHIN': 'OblivionPHIN',
  'Drop It': 'Drop it',
  RIPPER: 'ripper',
};

export function getPhigrosReferenceAvatarKeys(): readonly string[] {
  return PHIGROS_REFERENCE_AVATAR_KEYS;
}

export function findPhigrosReferenceAvatarKey(rawKey: string | null | undefined): string | null {
  const normalized = normalizePhigrosAvatarKey(rawKey);
  const aliased = avatarAliases[normalized] ?? normalized;
  return PHIGROS_REFERENCE_AVATAR_SOURCES[aliased]
    ? aliased
    : avatarKeyByLowercase.get(aliased.toLocaleLowerCase()) ?? null;
}

export function resolvePhigrosReferenceAvatarKey(rawKey: string | null | undefined): string {
  return findPhigrosReferenceAvatarKey(rawKey) ?? 'Introduction';
}

export function loadPhigrosReferenceAvatarUrl(rawKey: string | null | undefined): Promise<string> {
  const key = resolvePhigrosReferenceAvatarKey(rawKey);
  return loadPhigrosReferenceAssetDataUri(PHIGROS_REFERENCE_AVATAR_SOURCES[key]!, 'image/png');
}

export function getPhigrosReferenceAvatarSource(rawKey: string | null | undefined): number | null {
  const key = findPhigrosReferenceAvatarKey(rawKey);
  return key ? PHIGROS_REFERENCE_AVATAR_SOURCES[key] ?? null : null;
}

function withoutImport(css: string, importPath: string): string {
  return css.replace(`@import "${importPath}";`, '');
}

export async function loadPhigrosReferenceTemplateAssets(): Promise<PhigrosReferenceTemplateAssets> {
  if (templatePromise) return templatePromise;
  templatePromise = (async () => {
    const [b19Css, commonCssSource, snowCss, fontEntries, challengeIconUrls, ratingEntries, dataIconUrl, fallbackBackgroundUrl, fallbackAvatarUrl] = await Promise.all([
      loadAssetText(CSS_SOURCES.b19),
      loadAssetText(CSS_SOURCES.common),
      loadAssetText(CSS_SOURCES.snow),
      Promise.all(Object.entries(FONT_SOURCES).map(async ([name, source]) => [name, await loadPhigrosReferenceAssetDataUri(source, 'font/ttf')] as const)),
      Promise.all(CHALLENGE_SOURCES.map((source) => loadPhigrosReferenceAssetDataUri(source, 'image/png'))),
      Promise.all(Object.entries(RATING_SOURCES).map(async ([name, source]) => [name, await loadPhigrosReferenceAssetDataUri(source, 'image/png')] as const)),
      loadPhigrosReferenceAssetDataUri(DATA_ICON_SOURCE, 'image/png'),
      loadPhigrosReferenceAssetDataUri(BACKGROUND_SOURCE, 'image/png'),
      loadPhigrosReferenceAvatarUrl('Introduction'),
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
      fallbackAvatarUrl,
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
