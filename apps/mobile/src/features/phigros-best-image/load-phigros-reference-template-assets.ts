import { File } from 'expo-file-system';
import { loadBundledBestImageAssetUri, loadBundledBestImageFile } from '@/features/best-image/load-best-image-assets';
import { loadRemoteImageFile, type BestImageAssetSession } from '@/features/best-image/load-best-image-session';

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

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro 静态资源编号只能在运行时 require
  b19: require('../../../assets/phigros-b30-reference/b19/b19.css') as number,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro 静态资源编号只能在运行时 require
  common: require('../../../assets/phigros-b30-reference/common/common.css') as number,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro 静态资源编号只能在运行时 require
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
const BACKGROUND_SOURCE = require('../../../assets/phigros-b30-reference/otherimg/phigros.webp') as number;
let cssPromise: Promise<readonly [string, string, string]> | null = null;

async function loadAssetText(moduleId: number): Promise<string> {
  return new File(await loadBundledBestImageAssetUri(moduleId)).text();
}

function withoutImport(css: string, importPath: string): string {
  return css.replace(`@import "${importPath}";`, '');
}

export async function loadPhigrosReferenceTemplateAssets(
  session: BestImageAssetSession, fallbackAvatarUrl: string, signal?: AbortSignal,
): Promise<PhigrosReferenceTemplateAssets> {
  const [css, challengeIconUrls, ratingEntries, dataIconUrl, fallbackBackgroundUrl, avatarUrl] = await Promise.all([
    cssPromise ??= Promise.all([
      loadAssetText(CSS_SOURCES.b19), loadAssetText(CSS_SOURCES.common), loadAssetText(CSS_SOURCES.snow),
    ]).catch((error) => { cssPromise = null; throw error; }),
    Promise.all(CHALLENGE_SOURCES.map((source) => loadBundledBestImageFile(session, source, 'png', signal))),
    Promise.all(Object.entries(RATING_SOURCES).map(async ([name, source]) => [name, await loadBundledBestImageFile(session, source, 'png', signal)] as const)),
    loadBundledBestImageFile(session, DATA_ICON_SOURCE, 'png', signal),
    loadBundledBestImageFile(session, BACKGROUND_SOURCE, 'webp', signal),
    loadRemoteImageFile(session, fallbackAvatarUrl, signal),
  ]);
  const [b19Css, commonCssSource, snowCss] = css;
  const commonCss = withoutImport(commonCssSource, './theme/snow/snow.css')
    .replace('../otherimg/phigros.png', fallbackBackgroundUrl);
  return {
    css: `${snowCss}\n${commonCss}\n${withoutImport(b19Css, '../common/common.css')}`,
    dataIconUrl, fallbackBackgroundUrl, fallbackAvatarUrl: avatarUrl ?? '', challengeIconUrls,
    ratingIconUrls: Object.fromEntries(ratingEntries),
    allowingReadAccessToUrl: session.directory.uri,
  };
}
