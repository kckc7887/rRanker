export type BadgeRainbowColors = readonly [string, string, ...string[]];

export const BADGE_RAINBOW_FILL_COLORS: BadgeRainbowColors = [
  '#FF9CA8', '#FFC07E', '#EADB72', '#88CF96', '#79BFDB', '#9199DC', '#C28BD4',
];
export const BADGE_RAINBOW_BORDER_COLORS: BadgeRainbowColors = [
  '#8E2437', '#984D19', '#796515', '#256B39', '#205E7A', '#384181', '#692C7C',
];
export const BADGE_GOLD_FILL_COLORS: BadgeRainbowColors = [
  '#FFF3B0', '#F6DC7D', '#E8BF54', '#F6DC7D', '#FFF3B0',
];
export const BADGE_GOLD_BORDER_COLORS: BadgeRainbowColors = [
  '#84530A', '#A46E12', '#765006', '#A46E12', '#84530A',
];
export const BADGE_LAYER_OVERLAY = 'rgba(75,78,85,0.16)';
// 达成率彩虹字沿用原配色；胶囊标签使用上方独立的浅/深双层色组。
export const BEST_IMAGE_RAINBOW_COLORS: BadgeRainbowColors = [
  '#FF8A96', '#78E8A0', '#78C8FF', '#A89CF8', '#F08ADE',
];
export const BEST_IMAGE_RAINBOW_TEXT = '#303136';

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
  rainbow: { border: BADGE_RAINBOW_BORDER_COLORS[0], background: BADGE_RAINBOW_FILL_COLORS[0], text: BEST_IMAGE_RAINBOW_TEXT },
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
  return `linear-gradient(90deg,${BADGE_RAINBOW_FILL_COLORS.join(',')})`;
}

export function layeredBadgeCssBackground(tone: 'rainbow' | 'gold'): string {
  const fill = tone === 'rainbow' ? BADGE_RAINBOW_FILL_COLORS : BADGE_GOLD_FILL_COLORS;
  const border = tone === 'rainbow' ? BADGE_RAINBOW_BORDER_COLORS : BADGE_GOLD_BORDER_COLORS;
  return [
    `linear-gradient(${BADGE_LAYER_OVERLAY},${BADGE_LAYER_OVERLAY}) padding-box`,
    `linear-gradient(90deg,${fill.join(',')}) padding-box`,
    `linear-gradient(90deg,${border.join(',')}) border-box`,
  ].join(',');
}
