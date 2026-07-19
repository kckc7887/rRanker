import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useThemeStore } from '@/state/theme-store';
import { createAppTheme, resolveAppearance, type AppThemeTokens } from '@/theme/theme-tokens';
export { APP_ACCENTS, createAppTheme, resolveAppearance, type AppThemeTokens } from '@/theme/theme-tokens';

const ThemeContext = createContext<AppThemeTokens>(createAppTheme('light', 'blue'));

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const appearance = useThemeStore((state) => state.appearance);
  const accent = useThemeStore((state) => state.accent);
  const mode = resolveAppearance(appearance, system);
  const value = useMemo(() => createAppTheme(mode, accent), [accent, mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): AppThemeTokens { return useContext(ThemeContext); }
