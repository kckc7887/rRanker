export type BadgeRainbowColors = readonly [string, string, ...string[]];

export const BEST_IMAGE_RAINBOW_COLORS: BadgeRainbowColors = [
  '#FF8A96', '#78E8A0', '#78C8FF', '#A89CF8', '#F08ADE',
];
export const BEST_IMAGE_RAINBOW_TEXT = '#4B5563';

export type TrophyTone = 'normal' | 'bronze' | 'silver' | 'gold' | 'rainbow';

export type SolidBadgeTheme = {
  border: string;
  background: string;
  text: string;
};

export const TROPHY_BADGE_THEMES: Record<Exclude<TrophyTone, 'rainbow'>, SolidBadgeTheme> = {
  normal: { border: '#CBD5E1', background: '#F8FAFC', text: '#475569' },
  bronze: { border: '#B87333', background: '#FBF3EA', text: '#8B5A1A' },
  silver: { border: '#9CA3AF', background: '#F3F4F6', text: '#4B5563' },
  gold: { border: '#D4A017', background: '#FFF8E6', text: '#92650A' },
};

export type StatusBadgeTone = 'normal' | 'rainbow' | 'gold' | 'green' | 'blue' | 'neutral';

export const STATUS_BADGE_THEMES: Record<StatusBadgeTone, SolidBadgeTheme> = {
  normal: { border: '#D1D5DB', background: '#E5E7EB', text: '#374151' },
  rainbow: { border: 'rgba(255,255,255,0.82)', background: BEST_IMAGE_RAINBOW_COLORS[0], text: BEST_IMAGE_RAINBOW_TEXT },
  gold: { border: '#D4B45A', background: '#D4B45A', text: '#4B3A05' },
  green: { border: '#78D29B', background: '#78D29B', text: '#174C2E' },
  blue: { border: '#78B4DC', background: '#78B4DC', text: '#173F5F' },
  neutral: { border: '#9CA3AF', background: '#9CA3AF', text: '#FFFFFF' },
};

export function normalizeTrophyTone(color: string | null | undefined): TrophyTone {
  const normalized = color?.trim().toLowerCase();
  return normalized === 'bronze' || normalized === 'silver' || normalized === 'gold' || normalized === 'rainbow'
    ? normalized
    : 'normal';
}

export function rainbowCssGradient(): string {
  return `linear-gradient(90deg,${BEST_IMAGE_RAINBOW_COLORS.join(',')})`;
}
