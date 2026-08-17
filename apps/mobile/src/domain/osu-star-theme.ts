import { resolveTier, type ThemeTier } from './tier-theme';

/**
 * osu! 难度星数主题：六档配色（用户指定色值），只显示星数不显示难度名。
 * 档位匹配复用公共 resolveTier，本文件只承载档位表与展示口径。
 */
export type OsuStarTheme = {
  background: string;
  border: string;
  text: string;
};

export const OSU_STAR_TIERS: readonly ThemeTier<OsuStarTheme>[] = [
  { min: 0, theme: { background: '#4FC0FF', border: '#4FC0FF', text: '#0B2545' } },
  { min: 2.0, theme: { background: '#7CFF4F', border: '#7CFF4F', text: '#0B3D1F' } },
  { min: 2.7, theme: { background: '#f6f05c', border: '#f6f05c', text: '#3D3A00' } },
  { min: 4.0, theme: { background: '#ff4e6f', border: '#ff4e6f', text: '#FFFFFF' } },
  { min: 5.3, theme: { background: '#c645b8', border: '#c645b8', text: '#FFFFFF' } },
  { min: 6.5, theme: { background: '#6563de', border: '#6563de', text: '#FFFFFF' } },
];

export function resolveOsuStarTheme(star: number): OsuStarTheme {
  return resolveTier(OSU_STAR_TIERS, Math.max(0, star));
}

/** 难度标签文本：仅星数「N★」（两位小数）。 */
export function formatOsuStar(star: number): string {
  return `${star.toFixed(2)}★`;
}
