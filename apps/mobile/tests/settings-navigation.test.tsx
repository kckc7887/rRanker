import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import SettingsScreen from '../app/(tabs)/settings';
import { useThemeStore } from '@/state/theme-store';

const mockPush = jest.fn();
const mockSaveTheme = jest.fn(async (_value?: unknown) => undefined);

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/storage/theme-preferences-store', () => ({
  DEFAULT_THEME_PREFERENCES: { version: 2, appearance: 'system', accent: 'blue', customHex: '#246BFD' },
  themePreferencesStore: {
    load: async () => ({ version: 2, appearance: 'system', accent: 'blue', customHex: '#246BFD' }),
    save: (value: unknown) => mockSaveTheme(value),
  },
}));
jest.mock('@/components/AccentColorPicker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const RN = jest.requireActual('react-native') as typeof import('react-native');
  return {
    AccentColorPicker: ({
      visible,
      onApply,
      onClose,
    }: {
      visible: boolean;
      onApply: (hex: string) => void;
      onClose: () => void;
    }) => {
      if (!visible) return null;
      return React.createElement(
        RN.View,
        null,
        React.createElement(
          RN.Pressable,
          { accessibilityRole: 'button', accessibilityLabel: '应用自定义主题色', onPress: () => onApply('#E11D48') },
          React.createElement(RN.Text, null, '应用'),
        ),
        React.createElement(
          RN.Pressable,
          { accessibilityRole: 'button', accessibilityLabel: '取消自定义主题色', onPress: onClose },
          React.createElement(RN.Text, null, '取消'),
        ),
      );
    },
  };
});

describe('settings navigation', () => {
  beforeEach(() => useThemeStore.setState({
    appearance: 'system', accent: 'blue', customHex: '#246BFD', hydrated: true,
  }));

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

  it('applies a custom accent from the palette entry', async () => {
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('主题色 自定义'));
    await fireEvent.press(screen.getByLabelText('应用自定义主题色'));
    expect(useThemeStore.getState()).toMatchObject({ accent: 'custom', customHex: '#E11D48' });
  });
});
