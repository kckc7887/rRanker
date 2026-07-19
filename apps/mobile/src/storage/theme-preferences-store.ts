import Storage from 'expo-sqlite/kv-store';
import { normalizeAccentHex } from '@/theme/accent-color';

export type AppAppearance = 'system' | 'light' | 'dark';
export type AppAccent =
  | 'blue' | 'violet' | 'pink' | 'orange' | 'green' | 'cyan'
  | 'red' | 'amber' | 'indigo' | 'rose' | 'teal' | 'slate'
  | 'custom';

export interface ThemePreferences {
  version: 2;
  appearance: AppAppearance;
  accent: AppAccent;
  customHex: string;
}

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  version: 2,
  appearance: 'system',
  accent: 'blue',
  customHex: '#246BFD',
};

const STORAGE_KEY = 'rranker.theme-preferences.v1';
const APPEARANCES = new Set<AppAppearance>(['system', 'light', 'dark']);
const ACCENTS = new Set<AppAccent>([
  'blue', 'violet', 'pink', 'orange', 'green', 'cyan',
  'red', 'amber', 'indigo', 'rose', 'teal', 'slate', 'custom',
]);

export function parseThemePreferences(value: unknown): ThemePreferences {
  if (!value || typeof value !== 'object') return DEFAULT_THEME_PREFERENCES;
  const input = value as Partial<ThemePreferences> & { accent?: string; customHex?: string };
  const appearance = APPEARANCES.has(input.appearance as AppAppearance)
    ? input.appearance as AppAppearance
    : DEFAULT_THEME_PREFERENCES.appearance;
  const customHex = normalizeAccentHex(input.customHex) ?? DEFAULT_THEME_PREFERENCES.customHex;
  const accent = ACCENTS.has(input.accent as AppAccent)
    ? input.accent as AppAccent
    : DEFAULT_THEME_PREFERENCES.accent;
  if (accent === 'custom' && !normalizeAccentHex(input.customHex)) {
    return { version: 2, appearance, accent: DEFAULT_THEME_PREFERENCES.accent, customHex };
  }
  return { version: 2, appearance, accent, customHex };
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
