import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Animated, InteractionManager, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SettingsTabScreen, { SettingsScreen } from '../app/(tabs)/settings';
import PersonalizationScreen from '../app/personalization';
import { useThemeStore } from '@/state/theme-store';
import { NotificationProvider } from '@/components/AppNotification';

const mockPush = jest.fn();
const mockSaveTheme = jest.fn(async (_value?: unknown) => undefined);
const mockClear = jest.fn(async (_ids?: unknown) => ({ clearedIds: ['shared'], failures: [] as string[], reclaimedBytes: 4096 }));
const mockLoadPrefs = jest.fn(async () => ({ version: 1 as const, selectedIds: ['shared' as const] }));
const mockExportDiagnostics = jest.fn(async () => undefined);

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const RN = jest.requireActual('react-native') as typeof import('react-native');
  return {
    Image: (props: React.ComponentProps<typeof RN.Image>) => React.createElement(RN.Image, props),
  };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    router: { push: (href: unknown) => mockPush(href) },
    Stack: { Screen: () => null },
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
  DEFAULT_THEME_PREFERENCES: {
    version: 3, appearance: 'system', accent: 'blue', customHex: '#246BFD',
    scoreCardArtworkEnabled: false, scoreCardArtworkTransparency: 35, scoreCardArtworkBlur: 12,
  },
  themePreferencesStore: {
    load: async () => ({
      version: 3, appearance: 'system', accent: 'blue', customHex: '#246BFD',
      scoreCardArtworkEnabled: false, scoreCardArtworkTransparency: 35, scoreCardArtworkBlur: 12,
    }),
    save: (value: unknown) => mockSaveTheme(value),
  },
}));
jest.mock('@/features/storage-management/storage-usage', () => ({
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
jest.mock('@/services/runtime-diagnostics', () => ({
  exportRuntimeDiagnostics: () => mockExportDiagnostics(),
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

function renderSettings(screen = <SettingsScreen />) {
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}
    >
      <NotificationProvider>
        {screen}
      </NotificationProvider>
    </SafeAreaProvider>,
  );
}

describe('settings navigation', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSaveTheme.mockClear();
    mockClear.mockClear();
    mockLoadPrefs.mockClear();
    mockExportDiagnostics.mockReset();
    mockExportDiagnostics.mockResolvedValue(undefined);
    // 预览卡流光徽章会启动循环动画，测试环境替换为无操作桩避免原生驱动报错。
    jest.spyOn(Animated, 'loop').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    } as unknown as ReturnType<typeof Animated.loop>);
    useThemeStore.setState({
      appearance: 'system', accent: 'blue', customHex: '#246BFD', hydrated: true,
      scoreCardArtworkEnabled: false, scoreCardArtworkTransparency: 35, scoreCardArtworkBlur: 12,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses the shared cached-tab lifecycle for the settings route', async () => {
    let resume: (() => void) | null = null;
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      resume = callback as () => void;
      return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });

    const screen = await renderSettings(<SettingsTabScreen />);
    expect(screen.getByTestId('cached-tab-placeholder')).toBeTruthy();
    await act(() => { resume?.(); });
    expect(screen.getByText('查看占用并清理缓存')).toBeTruthy();
  });

  it('opens game management outside the native-tab route tree', async () => {
    const screen = await renderSettings();
    await fireEvent.press(screen.getByText('游戏管理'));
    expect(mockPush).toHaveBeenCalledWith('/game-management');
  });

  it('moves appearance controls to personalization and explains diagnostics in user language', async () => {
    const screen = await renderSettings();
    expect(screen.queryByLabelText('外观 深色')).toBeNull();
    expect(screen.getByText('遇到闪退或功能异常时，可导出记录并发送给开发者协助排查')).toBeTruthy();
    await fireEvent.press(screen.getByText('个性化'));
    expect(mockPush).toHaveBeenCalledWith('/personalization');
  });

  it('shows storage management and opens detail route', async () => {
    const screen = await renderSettings();
    expect(screen.getByText('存储管理')).toBeTruthy();
    expect(screen.getByText('查看占用并清理缓存')).toBeTruthy();
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

  it('shows a user-actionable message when diagnostic export fails', async () => {
    mockExportDiagnostics.mockRejectedValueOnce(new Error('sharing unavailable'));
    const screen = await renderSettings();

    await fireEvent.press(screen.getByLabelText('导出诊断记录'));

    expect(await screen.findByText('导出失败')).toBeTruthy();
    expect(screen.getByText('暂时无法导出诊断记录，请稍后重试。')).toBeTruthy();
  });

  it('changes appearance and accent from theme settings', async () => {
    const screen = await renderSettings(<PersonalizationScreen />);
    await fireEvent.press(screen.getByLabelText('外观 深色'));
    await fireEvent.press(screen.getByLabelText('主题色 紫'));
    expect(useThemeStore.getState()).toMatchObject({ appearance: 'dark', accent: 'violet' });
  });

  it('applies a custom accent from the palette entry', async () => {
    const screen = await renderSettings(<PersonalizationScreen />);
    await fireEvent.press(screen.getByLabelText('主题色 自定义'));
    await fireEvent.press(screen.getByLabelText('应用自定义主题色'));
    expect(useThemeStore.getState()).toMatchObject({ accent: 'custom', customHex: '#E11D48' });
  });

  it('reveals the experimental artwork sliders with configured defaults', async () => {
    const screen = await renderSettings(<PersonalizationScreen />);
    expect(screen.queryByLabelText('成绩卡片曲绘透明度')).toBeNull();
    expect(screen.queryByText('PANDORA PARADOXXX')).toBeNull();
    fireEvent(screen.getByLabelText('启用成绩卡片显示曲绘'), 'valueChange', true);
    await waitFor(() => expect(screen.getByLabelText('成绩卡片曲绘透明度')).toBeTruthy());
    expect(screen.getByText('曲绘透明度')).toBeTruthy();
    expect(screen.getByText('65%')).toBeTruthy();
    expect(screen.getByText('12px')).toBeTruthy();
    expect(useThemeStore.getState().scoreCardArtworkEnabled).toBe(true);
    const slider = screen.getByLabelText('成绩卡片曲绘透明度');
    expect(StyleSheet.flatten(slider.props.style)).toMatchObject({ height: 36, marginHorizontal: 10 });
    const [track, activeTrack, thumb] = slider.props.children;
    expect(StyleSheet.flatten(track.props.style)).toMatchObject({ height: 4, borderRadius: 2 });
    expect(StyleSheet.flatten(activeTrack.props.style)).toMatchObject({
      height: 4,
      borderRadius: 2,
      backgroundColor: '#246BFD',
      left: 0,
      right: '35%',
    });
    expect(StyleSheet.flatten(thumb.props.style)).toMatchObject({
      width: 22,
      height: 22,
      marginLeft: -11,
      borderRadius: 11,
      borderWidth: 2,
      shadowOpacity: 0.16,
      shadowRadius: 2,
      elevation: 2,
      left: '65%',
    });
  });

  it('shows a non-interactive fixed-data score card preview under the artwork switch', async () => {
    const screen = await renderSettings(<PersonalizationScreen />);
    fireEvent(screen.getByLabelText('启用成绩卡片显示曲绘'), 'valueChange', true);
    await waitFor(() => expect(screen.getByText('PANDORA PARADOXXX')).toBeTruthy());
    expect(screen.getByText('101.0000%')).toBeTruthy();
    expect(screen.getByTestId('status-AP')).toBeTruthy();
    expect(screen.getByTestId('status-FDX+')).toBeTruthy();
    expect(screen.getByTestId('rainbow-rate-SSS+')).toBeTruthy();
    expect(screen.queryByLabelText('查看谱面 PANDORA PARADOXXX SD remaster')).toBeNull();
    fireEvent.press(screen.getByText('PANDORA PARADOXXX'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('previews artwork slider movement locally and persists once when dragging ends', async () => {
    const screen = await renderSettings(<PersonalizationScreen />);
    fireEvent(screen.getByLabelText('启用成绩卡片显示曲绘'), 'valueChange', true);
    await waitFor(() => expect(screen.getByText('PANDORA PARADOXXX')).toBeTruthy());
    mockSaveTheme.mockClear();

    const transparencySlider = screen.getByLabelText('成绩卡片曲绘透明度');
    expect(screen.getByTestId('personalization-scroll').props.scrollEnabled).toBe(true);
    expect(transparencySlider.props.onResponderTerminationRequest()).toBe(false);
    await act(() => transparencySlider.props.onLayout({ nativeEvent: { layout: { width: 100 } } }));
    await act(() => transparencySlider.props.onResponderGrant({ nativeEvent: { locationX: 65, pageX: 165 } }));
    expect(screen.getByTestId('personalization-scroll').props.scrollEnabled).toBe(false);
    await act(() => transparencySlider.props.onResponderMove({
      nativeEvent: { locationX: Number.NaN, pageX: 130, pageY: 400 },
    }));
    expect(screen.getByText('30%')).toBeTruthy();
    expect(screen.getByTestId('score-card-artwork-overlay').props.style).toContainEqual({
      backgroundColor: 'rgba(255,255,255,0.30000000000000004)',
    });
    expect(useThemeStore.getState().scoreCardArtworkTransparency).toBe(35);
    expect(mockSaveTheme).not.toHaveBeenCalled();
    await act(() => transparencySlider.props.onResponderRelease({
      nativeEvent: { locationX: Number.NaN, pageX: 130, pageY: 400 },
    }));
    await waitFor(() => expect(mockSaveTheme).toHaveBeenCalledTimes(1));
    expect(useThemeStore.getState().scoreCardArtworkTransparency).toBe(70);
    expect(screen.getByTestId('personalization-scroll').props.scrollEnabled).toBe(true);

    mockSaveTheme.mockClear();
    const blurSlider = screen.getByLabelText('成绩卡片曲绘模糊度');
    expect(blurSlider.props.onResponderTerminationRequest()).toBe(false);
    await act(() => blurSlider.props.onLayout({ nativeEvent: { layout: { width: 100 } } }));
    await act(() => blurSlider.props.onResponderGrant({ nativeEvent: { locationX: 40, pageX: 140 } }));
    expect(screen.getByTestId('personalization-scroll').props.scrollEnabled).toBe(false);
    await act(() => blurSlider.props.onResponderMove({
      nativeEvent: { locationX: Number.NaN, pageX: 120, pageY: 400 },
    }));
    expect(screen.getByText('6px')).toBeTruthy();
    expect(screen.getByTestId('score-card-artwork').props.blurRadius).toBe(6);
    expect(useThemeStore.getState().scoreCardArtworkBlur).toBe(12);
    expect(mockSaveTheme).not.toHaveBeenCalled();
    await act(() => blurSlider.props.onResponderRelease({
      nativeEvent: { locationX: Number.NaN, pageX: 120, pageY: 400 },
    }));
    await waitFor(() => expect(mockSaveTheme).toHaveBeenCalledTimes(1));
    expect(useThemeStore.getState().scoreCardArtworkBlur).toBe(6);
    expect(screen.getByTestId('personalization-scroll').props.scrollEnabled).toBe(true);
  });
});
