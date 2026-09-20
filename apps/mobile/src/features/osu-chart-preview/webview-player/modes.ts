export const MODE_ORDER = [0, 1, 2, 3] as const;

export const MODE_LABELS: Record<(typeof MODE_ORDER)[number], string> = {
  0: 'osu!standard',
  1: 'osu!taiko',
  2: 'osu!catch',
  3: 'osu!mania',
};

export type OsuMode = (typeof MODE_ORDER)[number];

export function isOsuMode(mode: number): mode is OsuMode {
  return mode === 0 || mode === 1 || mode === 2 || mode === 3;
}

export function modeLabel(mode: number): string {
  return isOsuMode(mode) ? MODE_LABELS[mode] : `模式 ${mode}`;
}
