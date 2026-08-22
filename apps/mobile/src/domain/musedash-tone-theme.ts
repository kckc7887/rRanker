/**
 * Muse Dash 展示色阶：ACC/评价/成就/排名 tone → 颜色（仿 phigros-rate-theme 的 domain 主题值模式）。
 * ACC 与评价使用同档色：100 金、95 银、90 红、80 蓝、70 绿、60 灰、更低紫；
 * 金色文字用舞萌先例亮金 #D69B24，银色文字用带金属感的银灰；
 * 成就 AP 金、FC 粉；排名 #1 用彩虹渐变（组件层 LayeredGradientBadge），<10 金、<50 蓝、<100 绿。
 * 金色/银色徽章（评价 S 金档、AP、排名 <10）由组件层渲染渐变胶囊（金色复用共享 BADGE_GOLD_* 渐变 + 深字）。
 */
import { BADGE_GOLD_BORDER_COLORS, BADGE_GOLD_FILL_COLORS } from '@/features/best-image/best-image-badge-theme';

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

/** 金色/银色胶囊渐变（金色复用共享 BADGE_GOLD_* 常量，银色仿中二 platinum）。 */
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
