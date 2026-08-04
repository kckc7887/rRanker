export type ChartPreviewAssetUri = {
  uri: string;
  requiresDownload: boolean;
};

const ABSOLUTE_URI_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const ANDROID_RESOURCE_IDENTIFIER_PATTERN = /^[a-z\d_]+$/;

/**
 * Android release builds expose bundled drawable assets as resource identifiers
 * (for example `assets_maimai_chart_preview_sensor`) instead of file URIs.
 */
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
