import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import SettingsScreen from '../app/(tabs)/settings';
import { useThemeStore } from '@/state/theme-store';

const mockPush = jest.fn();
const mockSaveTheme = jest.fn(async (_value?: unknown) => undefined);

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/storage/theme-preferences-store', () => ({
  DEFAULT_THEME_PREFERENCES: { version: 1, appearance: 'system', accent: 'blue' },
  themePreferencesStore: {
    load: async () => ({ version: 1, appearance: 'system', accent: 'blue' }),
    save: (value: unknown) => mockSaveTheme(value),
  },
}));

describe('settings navigation', () => {
  beforeEach(() => useThemeStore.setState({ appearance: 'system', accent: 'blue', hydrated: true }));

  it('opens game management outside the native-tab route tree', async () => {
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByText('游戏管理'));
    expect(mockPush).toHaveBeenCalledWith('/game-management');
  });

  it('changes appearance and accent from theme settings', async () => {
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('外观 深色'));
    await fireEvent.press(screen.getByLabelText('主题色 紫'));
    expect(useThemeStore.getState()).toMatchObject({ appearance: 'dark', accent: 'violet' });
  });
});
