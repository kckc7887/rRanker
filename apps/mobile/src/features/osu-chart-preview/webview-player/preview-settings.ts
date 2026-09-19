import { normalizeOsuChartPreviewSettings, type OsuChartPreviewSettings } from '../configuration';

export type PreviewSettings = Omit<OsuChartPreviewSettings, 'maniaSkin' | 'maniaScrollSpeed'>;

export function normalizePreviewSettings(value: unknown): PreviewSettings {
  const { maniaSkin: _skin, maniaScrollSpeed: _speed, ...display } = normalizeOsuChartPreviewSettings(value);
  return display;
}

export const DEFAULT_PREVIEW_SETTINGS: Readonly<PreviewSettings> = Object.freeze(normalizePreviewSettings({}));
