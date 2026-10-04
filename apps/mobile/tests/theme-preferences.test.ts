import { createAppTheme, resolveAccentHex, resolveAppearance } from '@/theme/theme-tokens';
import { DEFAULT_THEME_PREFERENCES, parseThemePreferences, ThemePreferencesStore } from '@/storage/theme-preferences-store';
import { hslToHex, normalizeAccentHex } from '@/theme/accent-color';

describe('theme preferences', () => {
  it('parses supported values and falls back per field', () => {
    expect(parseThemePreferences({ appearance: 'dark', accent: 'violet' })).toMatchObject({
      version: 3, appearance: 'dark', accent: 'violet', customHex: '#246BFD',
      scoreCardArtworkEnabled: false, scoreCardArtworkTransparency: 35, scoreCardArtworkBlur: 12,
    });
    expect(parseThemePreferences({ appearance: 'sepia', accent: 'unknown' })).toEqual(DEFAULT_THEME_PREFERENCES);
  });

  it('normalizes presets and custom hex accents', () => {
    expect(parseThemePreferences({ version: 3, appearance: 'light', accent: 'teal' })).toMatchObject({
      version: 3, appearance: 'light', accent: 'teal',
    });
    expect(parseThemePreferences({
      appearance: 'system', accent: 'custom', customHex: '#abc',
    })).toMatchObject({ accent: 'custom', customHex: '#AABBCC' });
    expect(parseThemePreferences({
      appearance: 'system', accent: 'custom', customHex: 'not-a-color',
    })).toMatchObject({ accent: 'blue', customHex: '#246BFD' });
  });

  it('normalizes artwork defaults and clamps slider values', () => {
    expect(parseThemePreferences({ version: 3, appearance: 'system', accent: 'blue' })).toMatchObject({
      scoreCardArtworkEnabled: false,
      scoreCardArtworkTransparency: 35,
      scoreCardArtworkBlur: 12,
    });
    expect(parseThemePreferences({
      scoreCardArtworkEnabled: true,
      scoreCardArtworkTransparency: 140.4,
      scoreCardArtworkBlur: -3,
    })).toMatchObject({
      scoreCardArtworkEnabled: true,
      scoreCardArtworkTransparency: 100,
      scoreCardArtworkBlur: 0,
    });
  });

  it('resolves system mode and creates distinct semantic palettes', () => {
    expect(resolveAppearance('system', 'dark')).toBe('dark');
    expect(resolveAppearance('light', 'dark')).toBe('light');
    expect(createAppTheme('dark', '#0E7490').background).not.toBe(createAppTheme('light', '#0E7490').background);
    expect(createAppTheme('dark', '#0E7490').accent).toBe('#0E7490');
    expect(createAppTheme('light', '#FFFFFF').onAccent).toBe('#111827');
    expect(createAppTheme('dark', '#111827').onAccent).toBe('#FFFFFF');
    expect(resolveAccentHex({ accent: 'custom', customHex: '#e11d48' })).toBe('#E11D48');
    expect(normalizeAccentHex('#f0a')).toBe('#FF00AA');
    expect(hslToHex(0, 100, 50)).toBe('#FF0000');
  });
  it('round trips current preferences without rewriting valid data', async () => {
    const values = new Map<string, string>();
    const setItem = vi.fn(async (key: string, value: string) => { values.set(key, value); });
    const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem, removeItem: async () => undefined };
    const preferences = { ...DEFAULT_THEME_PREFERENCES, appearance: 'dark' as const, accent: 'green' as const, scoreCardArtworkEnabled: true };
    await new ThemePreferencesStore(storage).save(preferences);
    setItem.mockClear();
    await expect(new ThemePreferencesStore(storage).load()).resolves.toEqual(preferences);
    expect(setItem).not.toHaveBeenCalled();
  });

  it.each(['{', '[]', '{"version":1,"appearance":"dark","accent":"teal"}', '{"version":99}', '{"version":3,"appearance":"dark"}'])(
    'rebuilds unsupported preferences in their own key: %s', async raw => {
      const values = new Map([['rranker.theme-preferences.v1', raw], ['other-setting', 'untouched']]);
      const storage = {
        getItem: async (key: string) => values.get(key) ?? null,
        setItem: async (key: string, value: string) => { values.set(key, value); },
        removeItem: async (key: string) => { values.delete(key); },
      };
      await expect(new ThemePreferencesStore(storage).load()).resolves.toEqual(DEFAULT_THEME_PREFERENCES);
      expect(JSON.parse(values.get('rranker.theme-preferences.v1')!)).toEqual(DEFAULT_THEME_PREFERENCES);
      expect(values.get('other-setting')).toBe('untouched');
    },
  );

  it('propagates read and reset-write failures without deleting data', async () => {
    const setItem = vi.fn(async () => undefined), removeItem = vi.fn(async () => undefined);
    const getItem = vi.fn(async (): Promise<string | null> => '{');
    const store = new ThemePreferencesStore({ getItem, setItem, removeItem });
    getItem.mockRejectedValueOnce(new Error('read unavailable'));
    await expect(store.load()).rejects.toThrow('read unavailable');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRejectedValueOnce(new Error('write unavailable'));
    await expect(store.load()).rejects.toThrow('write unavailable');
    expect(removeItem).not.toHaveBeenCalled();
  });

});
