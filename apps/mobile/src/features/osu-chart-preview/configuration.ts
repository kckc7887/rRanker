import type { OsuGameId } from '../../domain/game-mode-family';

export type OsuChartPreviewTarget = {
  gameId: OsuGameId;
  beatmapsetId: number;
  beatmapId: number;
  title?: string;
};

export type OsuChartPreviewFile = {
  path: string;
  mime: string;
  text?: string;
  uri?: string;
};

export type OsuChartPreviewSettings = {
  holdWidth: number;
  backgroundBrightness: number;
  backgroundBlur: number;
  storyboardEnabled: boolean;
  videoEnabled: boolean;
  maniaIgnoreSV: boolean;
  maniaTrackOpacity: number;
  taikoTrackOpacity: number;
  maniaScrollSpeed: number;
  maniaSkin: 'brick' | 'circle';
};

export type OsuChartPreviewConfig = {
  theme: 'light' | 'dark';
  title?: string;
  requestedMode: 0 | 1 | 2 | 3;
  chartPath: string;
  files: OsuChartPreviewFile[];
  settings: OsuChartPreviewSettings;
};

export function normalizeOsuChartPreviewSettings(value: unknown): OsuChartPreviewSettings {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const number = (key: string, fallback: number, min: number, max: number, scale = 1): number => {
    const candidate = raw[key];
    return typeof candidate === 'number' && Number.isFinite(candidate)
      ? Math.round(Math.min(max, Math.max(min, candidate)) * scale) / scale
      : fallback;
  };
  const boolean = (key: string, fallback: boolean): boolean =>
    typeof raw[key] === 'boolean' ? raw[key] as boolean : fallback;
  return {
    holdWidth: number('holdWidth', 60, 10, 100),
    backgroundBrightness: number('backgroundBrightness', 20, 0, 100),
    backgroundBlur: number('backgroundBlur', 0, 0, 20),
    storyboardEnabled: boolean('storyboardEnabled', true),
    videoEnabled: boolean('videoEnabled', true),
    maniaIgnoreSV: boolean('maniaIgnoreSV', false),
    maniaTrackOpacity: number('maniaTrackOpacity', 100, 0, 100),
    taikoTrackOpacity: number('taikoTrackOpacity', 100, 0, 100),
    maniaScrollSpeed: number('maniaScrollSpeed', 8, 1, 40, 10),
    maniaSkin: raw.maniaSkin === 'circle' ? 'circle' : 'brick',
  };
}

export function parseOsuChartPreviewTarget(params: {
  gameId?: string;
  beatmapsetId?: string;
  beatmapId?: string;
  title?: string;
}): OsuChartPreviewTarget | null {
  const { gameId } = params;
  if (gameId !== 'osu-standard' && gameId !== 'osu-mania'
    && gameId !== 'osu-catch' && gameId !== 'osu-taiko') return null;
  if (typeof params.beatmapsetId !== 'string' || typeof params.beatmapId !== 'string'
    || !/^\d+$/u.test(params.beatmapsetId) || !/^\d+$/u.test(params.beatmapId)) return null;
  const beatmapsetId = Number(params.beatmapsetId);
  const beatmapId = Number(params.beatmapId);
  if (!Number.isSafeInteger(beatmapsetId) || beatmapsetId <= 0
    || !Number.isSafeInteger(beatmapId) || beatmapId <= 0) return null;
  return { gameId, beatmapsetId, beatmapId,
    title: typeof params.title === 'string' ? params.title.trim() || undefined : undefined };
}
