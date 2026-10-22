import { File } from 'expo-file-system';
import type { BestImageAssetSession } from '@/features/best-image/load-best-image-session';

export type PhigrosReferenceTemplateAssets = {
  css: string;
  dataIconUrl: string;
  fallbackBackgroundUrl: string;
  fallbackAvatarUrl: string;
  challengeIconUrls: readonly string[];
  ratingIconUrls: Readonly<Record<string, string>>;
  allowingReadAccessToUrl: string;
};

function withoutImport(css: string, importPath: string): string {
  return css.replace(`@import "${importPath}";`, '');
}

export async function loadPhigrosReferenceTemplateAssets(
  session: BestImageAssetSession,
): Promise<PhigrosReferenceTemplateAssets> {
  const [b19Css, commonCssSource, snowCss] = await Promise.all([
    'game/b19.css', 'game/common.css', 'game/snow.css',
  ].map(path => new File(session.directory, path).text()));
  const imageUrl = (name: string) => new File(session.directory, 'game/otherimg', name).uri;
  const fallbackBackgroundUrl = imageUrl('phigros.webp');
  const commonCss = withoutImport(commonCssSource, './theme/snow/snow.css')
    .replace('../otherimg/phigros.png', fallbackBackgroundUrl);
  const ratingIconUrls = Object.fromEntries([
    'A', 'B', 'C', 'F', 'FC', 'S', 'V', 'phi',
  ].map(name => [name, imageUrl(`${name}.png`)]));
  return {
    css: `${snowCss}\n${commonCss}\n${withoutImport(b19Css, '../common/common.css')}`,
    dataIconUrl: imageUrl('data.png'),
    fallbackBackgroundUrl,
    fallbackAvatarUrl: '',
    challengeIconUrls: Array.from({ length: 6 }, (_, index) => imageUrl(`${index}.png`)),
    ratingIconUrls,
    allowingReadAccessToUrl: session.directory.uri,
  };
}
