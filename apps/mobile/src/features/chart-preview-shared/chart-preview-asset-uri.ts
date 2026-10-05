/** Android release 可能以资源标识符返回内置图片。 */

export type ChartPreviewAssetUri = {
  uri: string;
  requiresDownload: boolean;
};

const ABSOLUTE_URI_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const ANDROID_RESOURCE_IDENTIFIER_PATTERN = /^[a-z\d_]+$/;

export function resolveChartPreviewAssetUri(
  localUri: string,
  assetType: string,
  platform: string,
): ChartPreviewAssetUri {
  if (ABSOLUTE_URI_PATTERN.test(localUri)) {
    return { uri: localUri, requiresDownload: false };
  }

  if (localUri.startsWith('/')) {
    return { uri: `file://${localUri}`, requiresDownload: false };
  }

  if (platform === 'android' && ANDROID_RESOURCE_IDENTIFIER_PATTERN.test(localUri)) {
    return {
      uri: `file:///android_res/drawable/${localUri}.${assetType}`,
      requiresDownload: true,
    };
  }

  throw new Error(`谱面预览资源 URI 不是绝对地址：${localUri}`);
}
