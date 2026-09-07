import { BADGE_RAINBOW_FILL_COLORS, BADGE_RAINBOW_BORDER_COLORS, BADGE_GOLD_FILL_COLORS, BADGE_GOLD_BORDER_COLORS, BADGE_LAYER_OVERLAY } from '@/domain/badge-theme';
export * from '@/domain/badge-theme';

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
