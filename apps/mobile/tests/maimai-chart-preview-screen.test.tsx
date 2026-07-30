import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { BackHandler } from 'react-native';
import MaimaiChartPreviewScreen from '../app/songs/chart-preview';

const mockInjectJavaScript = jest.fn();
const mockSaveSettings = jest.fn(async (_key: string, _value: string) => undefined);
let latestScreenOptions: Record<string, unknown> | undefined;
let hardwareBackHandler: (() => boolean | null | undefined) | undefined;

jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      latestScreenOptions = options;
      return null;
    },
  },
  useLocalSearchParams: () => ({
    songId: '834',
    chartType: 'DX',
    levelIndex: '3',
    title: '测试曲 DX MASTER',
  }),
}));

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  const MockWebView = React.forwardRef((_props: Record<string, unknown>, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }));
    return React.createElement(ReactNative.View, _props);
  });
  MockWebView.displayName = 'MockWebView';
  return { WebView: MockWebView };
});

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: (key: string, value: string) => mockSaveSettings(key, value),
  },
}));

jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    accent: '#246BFD',
    background: '#ffffff',
    text: '#111111',
    textMuted: '#666666',
  }),
}));

jest.mock('@/features/maimai-chart-preview/prepare-chart-preview-webview', () => ({
  buildChartPreviewInjectedJavaScript: () => 'true;',
  chartPreviewAllowsFileAccess: () => true,
  chartPreviewExitFullscreenScript: () => "window.postMessage({type:'exit-fullscreen'}, '*');true;",
  chartPreviewStopScript: () => "window.postMessage({type:'stop'}, '*');true;",
  parseChartPreviewBridgeMessage: (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed !== null && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  },
  prepareChartPreviewWebViewSource: async () => ({
    uri: 'file:///chart-preview/index.html',
    allowingReadAccessToURL: 'file:///chart-preview/',
  }),
}));

describe('MaimaiChartPreviewScreen fullscreen bridge', () => {
  beforeEach(() => {
    latestScreenOptions = undefined;
    hardwareBackHandler = undefined;
    mockInjectJavaScript.mockClear();
    mockSaveSettings.mockClear();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      hardwareBackHandler = handler;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('switches the native screen to immersive landscape and restores portrait on exit', async () => {
    render(<MaimaiChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('maimai-chart-preview-webview')).toBeTruthy());
    const webview = screen.getByTestId('maimai-chart-preview-webview');

    expect(latestScreenOptions).toMatchObject({
      headerShown: true,
      orientation: 'portrait_up',
      statusBarHidden: false,
      navigationBarHidden: false,
    });

    fireEvent(webview, 'message', {
      nativeEvent: { data: '{"type":"fullscreen","active":true}' },
    });

    await waitFor(() => expect(latestScreenOptions).toMatchObject({
      headerShown: false,
      orientation: 'landscape_left',
      statusBarHidden: true,
      navigationBarHidden: true,
      autoHideHomeIndicator: true,
    }));

    expect(hardwareBackHandler?.()).toBe(true);
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("type:'exit-fullscreen'"),
    );

    fireEvent(webview, 'message', {
      nativeEvent: { data: '{"type":"fullscreen","active":false}' },
    });

    await waitFor(() => expect(latestScreenOptions).toMatchObject({
      headerShown: true,
      orientation: 'portrait_up',
      statusBarHidden: false,
      navigationBarHidden: false,
      autoHideHomeIndicator: false,
    }));
  });

  it('persists only player settings fields from bridge messages', async () => {
    render(<MaimaiChartPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('maimai-chart-preview-webview')).toBeTruthy());
    const webview = screen.getByTestId('maimai-chart-preview-webview');

    fireEvent(webview, 'message', {
      nativeEvent: {
        data: '{"type":"settings","active":false,"message":"ignored","hiSpeed":7.5}',
      },
    });

    await waitFor(() => expect(mockSaveSettings).toHaveBeenCalledWith(
      'maimai-chart-preview-settings',
      JSON.stringify({ hiSpeed: 7.5 }),
    ));
  });
});
