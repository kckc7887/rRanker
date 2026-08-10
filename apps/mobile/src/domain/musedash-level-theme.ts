/**
 * Muse Dash 难度档位主题：EASY 绿、HARD 蓝、MASTER 粉、HIDDEN 黑、EX 白。
 * 与中二 DIFFICULTY_THEME / DIFFICULTY_CARD_VISUAL 同构：{ background, border, text } 胶囊配色 + 卡片淡色 tint + 深色模式动作色 darkAction；
 * EX 白色采用白底深字（参照舞萌 Re:MASTER 白底深字先例），深色模式下动作填充用深字色保证可读。
 */
export type MuseDashLevelTheme = { background: string; border: string; text: string; tint: string; darkAction: string };

export const MUSE_DASH_LEVEL_THEMES: readonly MuseDashLevelTheme[] = [
  { background: '#3E9D6B', border: '#3E9D6B', text: '#FFFFFF', tint: '#E6F5ED', darkAction: '#3E9D6B' },
  { background: '#3B82F6', border: '#3B82F6', text: '#FFFFFF', tint: '#E8F0FE', darkAction: '#3B82F6' },
  { background: '#EC4899', border: '#EC4899', text: '#FFFFFF', tint: '#FDE9F1', darkAction: '#EC4899' },
  { background: '#111827', border: '#111827', text: '#FFFFFF', tint: '#F3F4F6', darkAction: '#111827' },
  { background: '#FFFFFF', border: '#E5E7EB', text: '#111827', tint: '#F3F4F6', darkAction: '#111827' },
];

export function museDashLevelTheme(levelIndex: number): MuseDashLevelTheme {
  return MUSE_DASH_LEVEL_THEMES[levelIndex] ?? MUSE_DASH_LEVEL_THEMES[0];
}
