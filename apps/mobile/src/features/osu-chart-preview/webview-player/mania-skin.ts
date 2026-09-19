import { normalizeOsuChartPreviewSettings, type OsuChartPreviewSettings } from '../configuration';

export type ManiaSkinVariant = OsuChartPreviewSettings['maniaSkin'];
export const DEFAULT_MANIA_SKIN: ManiaSkinVariant = normalizeOsuChartPreviewSettings({}).maniaSkin;
export function parseManiaSkinVariant(value: unknown): ManiaSkinVariant {
  return normalizeOsuChartPreviewSettings({ maniaSkin: value }).maniaSkin;
}
