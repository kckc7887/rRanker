import { BADGE_GOLD_BORDER_COLORS, BADGE_GOLD_FILL_COLORS } from '@/domain/badge-theme';

export const MUSE_DASH_TONE_COLORS: Readonly<Record<string, string>> = {
  'acc-gold': '#D69B24',
  'acc-silver': '#B0B6C0',
  'acc-red': '#DC2626',
  'acc-blue': '#2563EB',
  'acc-green': '#16A34A',
  'acc-gray': '#6B7280',
  'acc-purple': '#9333EA',
  'achievement-fc': '#EC4899',
  'rank-blue': '#2563EB',
  'rank-green': '#16A34A',
};

export type MuseDashMetalGradient = {
  fill: readonly [string, string, ...string[]];
  border: readonly [string, string, ...string[]];
  text: string;
};

export const MUSE_DASH_METAL_GRADIENTS: Readonly<Record<string, MuseDashMetalGradient>> = {
  gold: {
    fill: BADGE_GOLD_FILL_COLORS,
    border: BADGE_GOLD_BORDER_COLORS,
    text: '#4B3A05',
  },
  silver: {
    fill: ['#DCE3EC', '#FFFFFF', '#C8D1DD', '#FFFFFF'],
    border: ['#7D8795', '#BEC6D1', '#8E99A8'],
    text: '#394454',
  },
};

export function museDashMetalGradient(kind: 'gold' | 'silver'): MuseDashMetalGradient {
  return MUSE_DASH_METAL_GRADIENTS[kind];
}

export function museDashToneColor(tone: string | undefined): string | null {
  return tone ? (MUSE_DASH_TONE_COLORS[tone] ?? null) : null;
}
