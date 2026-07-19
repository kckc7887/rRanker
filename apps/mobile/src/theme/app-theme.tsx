import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useThemeStore } from '@/state/theme-store';
import {
  createAppTheme,
  resolveAccentHex,
  resolveAppearance,
  type AppThemeTokens,
} from '@/theme/theme-tokens';
export {
  APP_ACCENTS,
  createAppTheme,
  resolveAccentHex,
  resolveAppearance,
  type AppThemeTokens,
} from '@/theme/theme-tokens';

const ThemeContext = createContext<AppThemeTokens>(createAppTheme('light', '#246BFD'));

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const appearance = useThemeStore((state) => state.appearance);
  const accent = useThemeStore((state) => state.accent);
  const customHex = useThemeStore((state) => state.customHex);
  const mode = resolveAppearance(appearance, system);
  const accentHex = resolveAccentHex({ accent, customHex });
  const value = useMemo(() => createAppTheme(mode, accentHex), [accentHex, mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): AppThemeTokens { return useContext(ThemeContext); }
