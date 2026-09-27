import { createPreferencesStore } from '@/storage/create-preferences-store';
import { normalizeAccentHex } from '@/theme/accent-color';

export type AppAppearance = 'system' | 'light' | 'dark';
export type AppAccent =
  | 'blue' | 'violet' | 'pink' | 'orange' | 'green' | 'cyan'
  | 'red' | 'amber' | 'indigo' | 'rose' | 'teal' | 'slate'
  | 'custom';

export interface ThemePreferences {
  version: 3;
  appearance: AppAppearance;
  accent: AppAccent;
  customHex: string;
  scoreCardArtworkEnabled: boolean;
  scoreCardArtworkTransparency: number;
  scoreCardArtworkBlur: number;
}

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  version: 3,
  appearance: 'system',
  accent: 'blue',
  customHex: '#246BFD',
  scoreCardArtworkEnabled: false,
  scoreCardArtworkTransparency: 35,
  scoreCardArtworkBlur: 12,
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
  const scoreCardArtworkEnabled = input.scoreCardArtworkEnabled === true;
  const scoreCardArtworkTransparency = normalizeRange(
    input.scoreCardArtworkTransparency,
    0,
    100,
    DEFAULT_THEME_PREFERENCES.scoreCardArtworkTransparency,
  );
  const scoreCardArtworkBlur = normalizeRange(
    input.scoreCardArtworkBlur,
    0,
    30,
    DEFAULT_THEME_PREFERENCES.scoreCardArtworkBlur,
  );
  if (accent === 'custom' && !normalizeAccentHex(input.customHex)) {
    return {
      version: 3,
      appearance,
      accent: DEFAULT_THEME_PREFERENCES.accent,
      customHex,
      scoreCardArtworkEnabled,
      scoreCardArtworkTransparency,
      scoreCardArtworkBlur,
    };
  }
  return {
    version: 3,
    appearance,
    accent,
    customHex,
    scoreCardArtworkEnabled,
    scoreCardArtworkTransparency,
    scoreCardArtworkBlur,
  };
}

function normalizeRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.max(min, Math.min(max, value)));
}

const themeStore = createPreferencesStore<ThemePreferences>({
  storeKey: STORAGE_KEY,
  defaults: () => DEFAULT_THEME_PREFERENCES,
  parse: (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unrecognized theme preference document');
    const version = 'version' in value ? value.version : undefined;
    if (version !== undefined && version !== 1 && version !== 2 && version !== 3) throw new Error('Unrecognized theme preference version');
    return parseThemePreferences(value);
  },
  toStored: parseThemePreferences,
  readFailure: 'throw',
});

export const ThemePreferencesStore = themeStore.Store;

export const themePreferencesStore = new ThemePreferencesStore();
