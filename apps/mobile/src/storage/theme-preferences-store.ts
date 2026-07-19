import Storage from 'expo-sqlite/kv-store';

export type AppAppearance = 'system' | 'light' | 'dark';
export type AppAccent = 'blue' | 'violet' | 'pink' | 'orange' | 'green' | 'cyan';

export interface ThemePreferences {
  version: 1;
  appearance: AppAppearance;
  accent: AppAccent;
}

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  version: 1,
  appearance: 'system',
  accent: 'blue',
};

const STORAGE_KEY = 'rranker.theme-preferences.v1';
const APPEARANCES = new Set<AppAppearance>(['system', 'light', 'dark']);
const ACCENTS = new Set<AppAccent>(['blue', 'violet', 'pink', 'orange', 'green', 'cyan']);

export function parseThemePreferences(value: unknown): ThemePreferences {
  if (!value || typeof value !== 'object') return DEFAULT_THEME_PREFERENCES;
  const input = value as Partial<ThemePreferences>;
  return {
    version: 1,
    appearance: APPEARANCES.has(input.appearance as AppAppearance)
      ? input.appearance as AppAppearance : DEFAULT_THEME_PREFERENCES.appearance,
    accent: ACCENTS.has(input.accent as AppAccent)
      ? input.accent as AppAccent : DEFAULT_THEME_PREFERENCES.accent,
  };
}

export class ThemePreferencesStore {
  async load(): Promise<ThemePreferences> {
    try {
      const raw = await Storage.getItem(STORAGE_KEY);
      return raw ? parseThemePreferences(JSON.parse(raw)) : DEFAULT_THEME_PREFERENCES;
    } catch {
      return DEFAULT_THEME_PREFERENCES;
    }
  }

  async save(preferences: ThemePreferences): Promise<void> {
    await Storage.setItem(STORAGE_KEY, JSON.stringify(parseThemePreferences(preferences)));
  }
}

export const themePreferencesStore = new ThemePreferencesStore();
