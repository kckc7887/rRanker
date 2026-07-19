import { create } from 'zustand';
import {
  DEFAULT_THEME_PREFERENCES,
  themePreferencesStore,
  type AppAccent,
  type AppAppearance,
  type ThemePreferences,
} from '@/storage/theme-preferences-store';

interface ThemeState extends ThemePreferences {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAppearance: (appearance: AppAppearance) => Promise<void>;
  setAccent: (accent: AppAccent) => Promise<void>;
}

let hydrationPromise: Promise<void> | undefined;

export const useThemeStore = create<ThemeState>((set, get) => ({
  ...DEFAULT_THEME_PREFERENCES,
  hydrated: false,
  hydrate: () => {
    hydrationPromise ??= themePreferencesStore.load().then((preferences) => {
      set({ ...preferences, hydrated: true });
    });
    return hydrationPromise;
  },
  setAppearance: async (appearance) => {
    const previous = get().appearance;
    set({ appearance });
    try { await themePreferencesStore.save({ version: 1, appearance, accent: get().accent }); }
    catch { set({ appearance: previous }); }
  },
  setAccent: async (accent) => {
    const previous = get().accent;
    set({ accent });
    try { await themePreferencesStore.save({ version: 1, appearance: get().appearance, accent }); }
    catch { set({ accent: previous }); }
  },
}));
