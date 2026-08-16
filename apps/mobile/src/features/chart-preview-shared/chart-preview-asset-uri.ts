/**
 * 谱面预览资源 URI 解析（公共层，纯函数不拉取 react-native）：
 * 处理 expo-asset localUri 在各平台/构建形态下的绝对地址归一，
 * Android release 会把 drawable 资产暴露为资源标识符而非 file URI。
 */

export type ChartPreviewAssetUri = {
  uri: string;
  requiresDownload: boolean;
};

const ABSOLUTE_URI_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const ANDROID_RESOURCE_IDENTIFIER_PATTERN = /^[a-z\d_]+$/;

/**
 * Android release builds expose bundled drawable assets as resource identifiers
 * (for example `assets_<bundle>_<name>`) instead of file URIs.
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
