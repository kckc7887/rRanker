import {
  MAIMAI_CHART_PREVIEW_SKIN_ASSETS,
  type MaimaiChartPreviewSkinAsset,
} from './maimai-chart-preview-skin-manifest.generated';

const UNUSED_RUNTIME_BASENAMES = new Set([
  'hold_off.png',
  'touch_just.png',
  'touchhold_off.png',
]);

/** file:// 下与 Phigros `skin/Tap2.png` 同层，避免多级子目录并发读图失败。 */
export function maimaiChartPreviewSkinStagePath(path: string): string {
  return `skin/${path.split('/').join('_')}`;
}

export function isMaimaiChartPreviewRuntimeSkinPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.includes('mine')) return false;
  const slash = lower.lastIndexOf('/');
  const basename = slash >= 0 ? lower.slice(slash + 1) : lower;
  return !UNUSED_RUNTIME_BASENAMES.has(basename);
}

export function maimaiChartPreviewRuntimeSkinAssets(): readonly MaimaiChartPreviewSkinAsset[] {
  return MAIMAI_CHART_PREVIEW_SKIN_ASSETS.filter((asset) => isMaimaiChartPreviewRuntimeSkinPath(asset.path));
}

export const MAIMAI_CHART_PREVIEW_SKIN_DATA_FILE = 'skin-data.js';
export const MAIMAI_CHART_PREVIEW_SKIN_DATA_GLOBAL = '__MAIMAI_CHART_PREVIEW_SKINS__';

/** 对齐 Phigros `music-data.js`：iOS file:// 不能稳定读取本地 PNG，改由脚本注入 data URL。 */
export function maimaiChartPreviewSkinDataScript(entries: Record<string, string>): string {
  return `window.${MAIMAI_CHART_PREVIEW_SKIN_DATA_GLOBAL}=${JSON.stringify(entries)};`;
}
