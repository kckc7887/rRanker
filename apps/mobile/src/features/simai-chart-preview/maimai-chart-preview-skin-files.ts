import {
  MAIMAI_CHART_PREVIEW_SKIN_ASSETS,
  MAIMAI_CHART_PREVIEW_SKIN_REVISION,
  type MaimaiChartPreviewSkinAsset,
} from './maimai-chart-preview-skin-manifest.generated';

const UNUSED_RUNTIME_BASENAMES = new Set([
  'hold_off.png',
  'touchhold_off.png',
]);

/** 内容修订参与缓存身份，避免复用同大小的旧皮肤。 */
export function maimaiChartPreviewSkinStagePath(path: string): string {
  return `skin/${MAIMAI_CHART_PREVIEW_SKIN_REVISION}_${path.split('/').join('_')}`;
}

export function isMaimaiChartPreviewRuntimeSkinPath(path: string): boolean {
  const lower = path.toLowerCase();
  const slash = lower.lastIndexOf('/');
  const basename = slash >= 0 ? lower.slice(slash + 1) : lower;
  return !UNUSED_RUNTIME_BASENAMES.has(basename);
}

export function maimaiChartPreviewRuntimeSkinAssets(): readonly MaimaiChartPreviewSkinAsset[] {
  return MAIMAI_CHART_PREVIEW_SKIN_ASSETS.filter((asset) => isMaimaiChartPreviewRuntimeSkinPath(asset.path));
}

export const MAIMAI_CHART_PREVIEW_SKIN_DATA_FILE = 'skin-data.js';
export const MAIMAI_CHART_PREVIEW_SKIN_DATA_GLOBAL = '__MAIMAI_CHART_PREVIEW_SKINS__';
export const MAIMAI_CHART_PREVIEW_SENSOR = { path: 'sensor.webp', width: 2048, height: 2048 } as const;

/** iOS file:// 读取本地 PNG 不稳定，改为注入 data URL。 */
export function maimaiChartPreviewSkinDataScript(entries: Record<string, string>): string {
  return `window.${MAIMAI_CHART_PREVIEW_SKIN_DATA_GLOBAL}=${JSON.stringify(entries)};`;
}
