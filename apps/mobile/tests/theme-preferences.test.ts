import { createAppTheme, resolveAccentHex, resolveAppearance } from '@/theme/theme-tokens';
import { DEFAULT_THEME_PREFERENCES, parseThemePreferences } from '@/storage/theme-preferences-store';
import { hslToHex, normalizeAccentHex } from '@/theme/accent-color';

describe('theme preferences', () => {
  it('parses supported values and falls back per field', () => {
    expect(parseThemePreferences({ appearance: 'dark', accent: 'violet' })).toMatchObject({
      version: 2, appearance: 'dark', accent: 'violet', customHex: '#246BFD',
    });
    expect(parseThemePreferences({ appearance: 'sepia', accent: 'unknown' })).toEqual(DEFAULT_THEME_PREFERENCES);
  });

  it('migrates v1 presets and accepts custom hex accents', () => {
    expect(parseThemePreferences({ version: 1, appearance: 'light', accent: 'teal' })).toMatchObject({
      version: 2, appearance: 'light', accent: 'teal',
    });
    expect(parseThemePreferences({
      appearance: 'system', accent: 'custom', customHex: '#abc',
    })).toMatchObject({ accent: 'custom', customHex: '#AABBCC' });
    expect(parseThemePreferences({
      appearance: 'system', accent: 'custom', customHex: 'not-a-color',
    })).toMatchObject({ accent: 'blue', customHex: '#246BFD' });
  });

  it('resolves system mode and creates distinct semantic palettes', () => {
    expect(resolveAppearance('system', 'dark')).toBe('dark');
    expect(resolveAppearance('light', 'dark')).toBe('light');
    expect(createAppTheme('dark', '#0E7490').background).not.toBe(createAppTheme('light', '#0E7490').background);
    expect(createAppTheme('dark', '#0E7490').accent).toBe('#0E7490');
    expect(resolveAccentHex({ accent: 'custom', customHex: '#e11d48' })).toBe('#E11D48');
    expect(normalizeAccentHex('#f0a')).toBe('#FF00AA');
    expect(hslToHex(0, 100, 50)).toBe('#FF0000');
  });
});
