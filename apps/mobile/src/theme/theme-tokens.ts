import type { AppAccent, AppAppearance } from '@/storage/theme-preferences-store';

const ACCENT_COLORS: Record<AppAccent, string> = {
  blue: '#246BFD', violet: '#7C3AED', pink: '#BE185D',
  orange: '#C2410C', green: '#15803D', cyan: '#0E7490',
};

export const APP_ACCENTS = Object.entries(ACCENT_COLORS).map(([id, color]) => ({
  id: id as AppAccent,
  color,
  label: ({ blue: '蓝', violet: '紫', pink: '粉', orange: '橙', green: '绿', cyan: '青' } as const)[id as AppAccent],
}));

export interface AppThemeTokens {
  dark: boolean; accent: string; accentSoft: string; background: string; surface: string;
  surfaceMuted: string; text: string; textSecondary: string; textMuted: string; border: string;
  input: string; overlay: string; danger: string; dangerSoft: string; success: string;
  warning: string; statusBar: 'light' | 'dark';
}

export function resolveAppearance(appearance: AppAppearance, system: 'light' | 'dark' | null | undefined): 'light' | 'dark' {
  return appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : appearance;
}

export function createAppTheme(mode: 'light' | 'dark', accentId: AppAccent): AppThemeTokens {
  const accent = ACCENT_COLORS[accentId];
  if (mode === 'dark') return {
    dark: true, accent, accentSoft: `${accent}33`, background: '#0D1117', surface: '#161B22',
    surfaceMuted: '#21262D', text: '#F0F3F6', textSecondary: '#C9D1D9', textMuted: '#8B949E',
    border: '#30363D', input: '#0D1117', overlay: 'rgba(0,0,0,0.72)', danger: '#FF7B72',
    dangerSoft: '#3D1F24', success: '#56D364', warning: '#E3B341', statusBar: 'light',
  };
  return {
    dark: false, accent, accentSoft: `${accent}18`, background: '#F7F8FA', surface: '#FFFFFF',
    surfaceMuted: '#EEF2F7', text: '#111827', textSecondary: '#4B5563', textMuted: '#6B7280',
    border: '#D1D5DB', input: '#FFFFFF', overlay: 'rgba(17,24,39,0.58)', danger: '#B42318',
    dangerSoft: '#FEECEB', success: '#15803D', warning: '#B45309', statusBar: 'dark',
  };
}
