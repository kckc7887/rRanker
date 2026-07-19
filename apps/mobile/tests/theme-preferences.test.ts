import { createAppTheme, resolveAppearance } from '@/theme/theme-tokens';
import { DEFAULT_THEME_PREFERENCES, parseThemePreferences } from '@/storage/theme-preferences-store';

describe('theme preferences', () => {
  it('parses supported values and falls back per field', () => {
    expect(parseThemePreferences({ appearance: 'dark', accent: 'violet' })).toMatchObject({ appearance: 'dark', accent: 'violet' });
    expect(parseThemePreferences({ appearance: 'sepia', accent: 'unknown' })).toEqual(DEFAULT_THEME_PREFERENCES);
  });
  it('resolves system mode and creates distinct semantic palettes', () => {
    expect(resolveAppearance('system', 'dark')).toBe('dark');
    expect(resolveAppearance('light', 'dark')).toBe('light');
    expect(createAppTheme('dark', 'cyan').background).not.toBe(createAppTheme('light', 'cyan').background);
    expect(createAppTheme('dark', 'cyan').accent).toBe('#0E7490');
  });
});
