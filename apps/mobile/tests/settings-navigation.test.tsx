import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SettingsScreen from '../app/(tabs)/settings';
import { useThemeStore } from '@/state/theme-store';
import { NotificationProvider } from '@/components/AppNotification';

const mockPush = jest.fn();
const mockSaveTheme = jest.fn(async (_value?: unknown) => undefined);
const mockClear = jest.fn(async (_ids?: unknown) => ({ clearedIds: ['shared'], failures: [] as string[] }));
const mockLoadPrefs = jest.fn(async () => ({ version: 1 as const, selectedIds: ['shared' as const] }));
const mockCollect = jest.fn(async () => ({ segments: [], totalBytes: 12 * 1024 }));

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    router: { push: (href: unknown) => mockPush(href) },
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = effect();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [effect]);
    },
  };
});
jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/storage/theme-preferences-store', () => ({
  DEFAULT_THEME_PREFERENCES: { version: 2, appearance: 'system', accent: 'blue', customHex: '#246BFD' },
  themePreferencesStore: {
    load: async () => ({ version: 2, appearance: 'system', accent: 'blue', customHex: '#246BFD' }),
    save: (value: unknown) => mockSaveTheme(value),
  },
}));
jest.mock('@/features/storage-management/storage-usage', () => ({
  collectStorageUsage: () => mockCollect(),
  listClearableCategoryIds: () => ['maimai', 'phigros', 'shared'],
}));
jest.mock('@/features/storage-management/clear-storage-cache', () => ({
  clearStorageByCategories: (ids: unknown) => mockClear(ids),
}));
jest.mock('@/storage/storage-clear-prefs-store', () => ({
  storageClearPreferencesStore: {
    load: () => mockLoadPrefs(),
    save: jest.fn(async () => undefined),
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

function renderSettings() {
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}
    >
      <NotificationProvider>
        <SettingsScreen />
      </NotificationProvider>
    </SafeAreaProvider>,
  );
}

describe('settings navigation', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockClear.mockClear();
    mockLoadPrefs.mockClear();
    mockCollect.mockClear();
    useThemeStore.setState({
      appearance: 'system', accent: 'blue', customHex: '#246BFD', hydrated: true,
    });
  });

  it('opens game management outside the native-tab route tree', async () => {
    const screen = await renderSettings();
    await fireEvent.press(screen.getByText('游戏管理'));
    expect(mockPush).toHaveBeenCalledWith('/game-management');
  });

  it('shows storage management and opens detail route', async () => {
    const screen = await renderSettings();
    await waitFor(() => {
      expect(screen.getByText('存储管理')).toBeTruthy();
      expect(screen.getByText('已用 12.0 KB')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('存储管理'));
    expect(mockPush).toHaveBeenCalledWith('/storage-management');
  });

  it('quick-clears using saved preferences without navigating', async () => {
    const screen = await renderSettings();
    await waitFor(() => expect(screen.getByLabelText('快捷清除缓存')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('快捷清除缓存'));
    await waitFor(() => expect(mockClear).toHaveBeenCalledWith(['shared']));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('changes appearance and accent from theme settings', async () => {
    const screen = await renderSettings();
    await fireEvent.press(screen.getByLabelText('外观 深色'));
    await fireEvent.press(screen.getByLabelText('主题色 紫'));
    expect(useThemeStore.getState()).toMatchObject({ appearance: 'dark', accent: 'violet' });
  });

  it('applies a custom accent from the palette entry', async () => {
    const screen = await renderSettings();
    await fireEvent.press(screen.getByLabelText('主题色 自定义'));
    await fireEvent.press(screen.getByLabelText('应用自定义主题色'));
    expect(useThemeStore.getState()).toMatchObject({ accent: 'custom', customHex: '#E11D48' });
  });
});
