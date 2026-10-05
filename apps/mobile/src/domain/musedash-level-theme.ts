export type MuseDashLevelTheme = {
  background: string;
  border: string;
  text: string;
  tint: string;
  lightAction: string;
  darkAction: string;
};

export const MUSE_DASH_LEVEL_THEMES: readonly MuseDashLevelTheme[] = [
  { background: '#3E9D6B', border: '#3E9D6B', text: '#FFFFFF', tint: '#E6F5ED', lightAction: '#3E9D6B', darkAction: '#3E9D6B' },
  { background: '#3B82F6', border: '#3B82F6', text: '#FFFFFF', tint: '#E8F0FE', lightAction: '#3B82F6', darkAction: '#3B82F6' },
  { background: '#EC4899', border: '#EC4899', text: '#FFFFFF', tint: '#FDE9F1', lightAction: '#EC4899', darkAction: '#EC4899' },
  { background: '#111827', border: '#111827', text: '#FFFFFF', tint: '#F3F4F6', lightAction: '#111827', darkAction: '#111827' },
  { background: '#FFFFFF', border: '#E5E7EB', text: '#111827', tint: '#F3F4F6', lightAction: '#111827', darkAction: '#111827' },
];

export function museDashLevelTheme(levelIndex: number): MuseDashLevelTheme {
  return MUSE_DASH_LEVEL_THEMES[levelIndex] ?? MUSE_DASH_LEVEL_THEMES[0];
}
