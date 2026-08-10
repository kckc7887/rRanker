/**
 * Muse Dash 展示色阶：ACC/评价/成就/排名 tone → 颜色（仿 phigros-rate-theme 的 domain 主题值模式）。
 * ACC 与评价沿用同档色：100 金、95 银、90 红、80 蓝、70 绿、60 灰、更低紫；
 * 成就 AP 金、FC 粉；排名 #1 用彩虹渐变（组件层 LayeredGradientBadge），<10 金、<50 蓝、<100 绿。
 */
export const MUSE_DASH_TONE_COLORS: Readonly<Record<string, string>> = {
  'acc-gold': '#B8860B',
  'acc-silver': '#9CA3AF',
  'acc-red': '#DC2626',
  'acc-blue': '#2563EB',
  'acc-green': '#16A34A',
  'acc-gray': '#6B7280',
  'acc-purple': '#9333EA',
  'achievement-ap': '#B8860B',
  'achievement-fc': '#EC4899',
  'rank-gold': '#B8860B',
  'rank-blue': '#2563EB',
  'rank-green': '#16A34A',
};

export function museDashToneColor(tone: string | undefined): string | null {
  return tone ? (MUSE_DASH_TONE_COLORS[tone] ?? null) : null;
}
