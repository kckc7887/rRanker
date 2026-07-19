import { create } from 'zustand';
import {
  DEFAULT_THEME_PREFERENCES,
  themePreferencesStore,
  type AppAccent,
  type AppAppearance,
  type ThemePreferences,
} from '@/storage/theme-preferences-store';
import { normalizeAccentHex } from '@/theme/accent-color';

interface ThemeState extends ThemePreferences {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAppearance: (appearance: AppAppearance) => Promise<void>;
  setAccent: (accent: Exclude<AppAccent, 'custom'>) => Promise<void>;
  setCustomAccent: (hex: string) => Promise<void>;
}

let hydrationPromise: Promise<void> | undefined;

function snapshot(state: ThemeState): ThemePreferences {
  return {
    version: 2,
    appearance: state.appearance,
    accent: state.accent,
    customHex: state.customHex,
  };
}

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
    try { await themePreferencesStore.save(snapshot(get())); }
    catch { set({ appearance: previous }); }
  },
  setAccent: async (accent) => {
    const previous = { accent: get().accent, customHex: get().customHex };
    set({ accent });
    try { await themePreferencesStore.save(snapshot(get())); }
    catch { set(previous); }
  },
  setCustomAccent: async (hex) => {
    const normalized = normalizeAccentHex(hex);
    if (!normalized) return;
    const previous = { accent: get().accent, customHex: get().customHex };
    set({ accent: 'custom', customHex: normalized });
    try { await themePreferencesStore.save(snapshot(get())); }
    catch { set(previous); }
  },
}));
