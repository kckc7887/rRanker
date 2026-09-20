import { normalizeOsuChartPreviewSettings } from '../configuration';

export const MANIA_SCROLL_MIN = 1;
export const MANIA_SCROLL_MAX = 40;
export const MANIA_SCROLL_DEFAULT = normalizeOsuChartPreviewSettings({}).maniaScrollSpeed;
export const MANIA_SCROLL_STEP = 0.1;
export function clampManiaScrollSpeed(value: number): number {
  return normalizeOsuChartPreviewSettings({ maniaScrollSpeed: value }).maniaScrollSpeed;
}
