import { resolveTier, type ThemeTier } from './tier-theme';

/**
 * osu! 难度星数主题：官方难度色阶十一档（osu 官网同款色值），只显示星数不显示难度名。
 * 档位匹配复用公共 resolveTier，本文件只承载档位表与展示口径。
 * 边界（≥ 含等号）：0.10/1.25/2.00/2.50/3.30/4.20/4.90/5.80/6.70/7.70/9.00；
 * 低于 0.10 回退首档（resolveTier 语义）。
 */
export type OsuStarTheme = {
  background: string;
  border: string;
  text: string;
};

export const OSU_STAR_TIERS: readonly ThemeTier<OsuStarTheme>[] = [
  { min: 0.10, theme: { background: '#4290FB', border: '#4290FB', text: '#FFFFFF' } },
  { min: 1.25, theme: { background: '#4FC0FF', border: '#4FC0FF', text: '#0B2545' } },
  { min: 2.00, theme: { background: '#4FFFD5', border: '#4FFFD5', text: '#0B3D1F' } },
  { min: 2.50, theme: { background: '#7CFF4F', border: '#7CFF4F', text: '#0B3D1F' } },
  { min: 3.30, theme: { background: '#F6F05C', border: '#F6F05C', text: '#3D3A00' } },
  { min: 4.20, theme: { background: '#FF8068', border: '#FF8068', text: '#FFFFFF' } },
  { min: 4.90, theme: { background: '#FF4E6F', border: '#FF4E6F', text: '#FFFFFF' } },
  { min: 5.80, theme: { background: '#C645B8', border: '#C645B8', text: '#FFFFFF' } },
  { min: 6.70, theme: { background: '#6563DE', border: '#6563DE', text: '#FFFFFF' } },
  { min: 7.70, theme: { background: '#18158E', border: '#18158E', text: '#FFFFFF' } },
  { min: 9.00, theme: { background: '#000000', border: '#000000', text: '#FFFFFF' } },
];

export function resolveOsuStarTheme(star: number): OsuStarTheme {
  return resolveTier(OSU_STAR_TIERS, Math.max(0, star));
}

/** 难度标签文本：仅星数「N★」（两位小数）。 */
export function formatOsuStar(star: number): string {
  return `${star.toFixed(2)}★`;
}
