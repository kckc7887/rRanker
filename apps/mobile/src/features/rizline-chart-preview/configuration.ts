export const USER_SPEED_MIN = 0;
export const USER_SPEED_MAX = 20;
export const USER_SPEED_DEFAULT = 3.5;
export const USER_SPEED_STEP = 0.1;
export const VISUAL_SPEED_BASE = 6.71875;
export const PLAYBACK_SPEED_MIN = 0.5;
export const PLAYBACK_SPEED_MAX = 2;
export const PLAYBACK_SPEED_DEFAULT = 1;
export const PLAYBACK_SPEED_STEP = 0.05;
export const VOLUME_DEFAULT = 0.8;
export const HIT_SOUND_VOLUME_DEFAULT = 0.45;

export type RizlineChartPreviewTarget = {
  songId: string;
  levelIndex: number;
  title?: string;
};

export type RizlineChartPreviewSettings = {
  playbackSpeed: number;
  userSpeed: number;
  volume: number;
  hitSound: boolean;
  hitSoundVolume: number;
};

export type RizlineChartPreviewConfig = {
  theme: 'light' | 'dark';
  title?: string;
  settings: RizlineChartPreviewSettings;
};

function snap(value: unknown, fallback: number, min: number, max: number, step: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const decimals = (String(step).split('.')[1] ?? '').length;
  const snapped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(decimals))));
}

export function clampUserSpeed(value: number): number {
  return snap(value, USER_SPEED_DEFAULT, USER_SPEED_MIN, USER_SPEED_MAX, USER_SPEED_STEP);
}

export function visualSpeed(userSpeed: number): number {
  return VISUAL_SPEED_BASE + clampUserSpeed(userSpeed);
}

export function normalizeRizlineChartPreviewSettings(value: unknown): RizlineChartPreviewSettings {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    playbackSpeed: snap(raw.playbackSpeed, PLAYBACK_SPEED_DEFAULT, PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX, PLAYBACK_SPEED_STEP),
    userSpeed: snap(raw.userSpeed, USER_SPEED_DEFAULT, USER_SPEED_MIN, USER_SPEED_MAX, USER_SPEED_STEP),
    volume: snap(raw.volume, VOLUME_DEFAULT, 0, 1, 0.01),
    hitSound: typeof raw.hitSound === 'boolean' ? raw.hitSound : true,
    hitSoundVolume: snap(raw.hitSoundVolume, HIT_SOUND_VOLUME_DEFAULT, 0, 1, 0.01),
  };
}

export function parseRizlineChartPreviewTarget(params: {
  songId?: string;
  levelIndex?: string;
  title?: string;
}): RizlineChartPreviewTarget | null {
  const songId = typeof params.songId === 'string' ? params.songId.trim() : '';
  const parsedLevelIndex = typeof params.levelIndex === 'string' ? Number(params.levelIndex) : NaN;
  if (!songId || !Number.isInteger(parsedLevelIndex) || parsedLevelIndex < 0 || parsedLevelIndex > 4) return null;
  return {
    songId,
    levelIndex: parsedLevelIndex,
    title: typeof params.title === 'string' ? params.title.trim() || undefined : undefined,
  };
}
